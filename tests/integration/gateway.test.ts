import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { Gateway } from "../../src/core/gateway.js"
import { Logger } from "../../src/core/logger.js"
import type { RetryPolicyOverrides } from "../../src/core/retry-policy.js"
import { SessionStore } from "../../src/storage/session-store.js"
import { SqliteStore } from "../../src/storage/sqlite-store.js"
import type { GatewayConfig, ProviderParams } from "../../src/config/types.js"
import type { AIResponse, AIClient } from "../../src/integrations/ai/client.js"
import type { ChatMessage, IncomingWhatsAppMessage } from "../../src/types/chat.js"
import type { MessageHandler, WhatsAppClient } from "../../src/integrations/whatsapp/client.js"
import { createTempDir, removeTempDir } from "../helpers/temp-dir.js"

class FakeAI implements AIClient {
  public readonly calls: string[] = []
  public readonly inputs: ChatMessage[][] = []
  private readonly queue: Array<AIResponse | unknown>
  private readonly events: string[]

  constructor(queue: Array<AIResponse | unknown>, events: string[]) {
    this.queue = queue
    this.events = events
  }

  async complete(input: ChatMessage[], model: string, params: ProviderParams): Promise<AIResponse> {
    void params
    this.inputs.push(input)
    this.calls.push(model)
    this.events.push(`ai:${model}`)
    const next = this.queue.shift()
    if (next instanceof Error || typeof next === "string") {
      throw next
    }
    if (!next) {
      return { text: "default-response", model }
    }
    return next
  }
}

class FakeWhatsApp implements WhatsAppClient {
  public readonly sent: Array<{ chatId: string; text: string }> = []
  private onMessage: MessageHandler | null = null

  async start(onMessage: MessageHandler): Promise<void> {
    this.onMessage = onMessage
  }

  async sendText(chatId: string, text: string): Promise<void> {
    this.sent.push({ chatId, text })
  }

  status(): string {
    return "connected"
  }

  async emit(text: string, chatId = "user@s.whatsapp.net"): Promise<void> {
    if (!this.onMessage) {
      throw new Error("FakeWhatsApp must be started before emit.")
    }

    const message: IncomingWhatsAppMessage = {
      chatId,
      senderId: chatId,
      text,
      receivedAt: new Date().toISOString()
    }
    await this.onMessage(message)
  }
}

class TrackingSessionStore extends SessionStore {
  constructor(
    sessionsDir: string,
    memoryDir: string,
    private readonly events: string[]
  ) {
    super(sessionsDir, memoryDir)
  }

  override async appendMessage(sessionPath: string, message: ChatMessage): Promise<void> {
    this.events.push(`session:${message.role}`)
    await super.appendMessage(sessionPath, message)
  }
}

class FailingMoveSessionStore extends TrackingSessionStore {
  override async moveSessionToMemory(sessionPath: string): Promise<string> {
    void sessionPath
    throw new Error("disk permission denied")
  }
}

class TrackingSqliteStore extends SqliteStore {
  constructor(dbPath: string, private readonly events: string[]) {
    super(dbPath)
  }

  override async connect(): Promise<void> {
    this.events.push("sqlite:connect")
    await super.connect()
  }

  override async saveMessage(
    chatId: string,
    message: ChatMessage,
    sessionPath: string
  ): Promise<void> {
    void chatId
    void sessionPath
    this.events.push(`sqlite:${message.role}`)
  }

  override async status(): Promise<string> {
    return "ready"
  }
}

let rootDir = ""
let sessionsDir = ""
let memoryDir = ""
let dbPath = ""
const testRetryPolicy: RetryPolicyOverrides = {
  maxAttempts: 3,
  delaysMs: [0]
}

async function findMarkdownFiles(dir: string): Promise<string[]> {
  let entries: Awaited<ReturnType<typeof readdir>>
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch (error) {
    const isNodeError = typeof error === "object" && error !== null
    const errorCode = isNodeError ? (error as { code?: string }).code : undefined
    if (errorCode === "ENOENT") {
      return []
    }
    throw error
  }
  const files: string[] = []

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const nestedFiles = await findMarkdownFiles(fullPath)
      files.push(...nestedFiles)
      continue
    }
    if (entry.isFile() && fullPath.endsWith(".md")) {
      files.push(fullPath)
    }
  }

  return files
}

beforeEach(async () => {
  rootDir = await createTempDir("gateway-integration")
  sessionsDir = path.join(rootDir, "sessions")
  memoryDir = path.join(rootDir, "memory")
  dbPath = ":memory:"
})

afterEach(async () => {
  if (rootDir) {
    await removeTempDir(rootDir)
  }
})

function buildConfig(): GatewayConfig {
  return {
    provider: {
      name: "google",
      apiKey: "test",
      primaryModel: "model-a",
      fallbackModels: ["model-b", "model-c"],
      params: {
        temperature: 0.1,
        topP: 1,
        maxOutputTokens: 256
      }
    },
    whatsapp: {
      driver: "baileys",
      mode: "dm_only",
      authPath: "data/whatsapp",
      textOnly: true
    },
    commands: {
      enabled: ["/status", "/ping", "/new"],
      unknownCommandBehavior: "ignore"
    },
    heartbeat: {
      enabled: false,
      intervalMinutes: 30
    },
    storage: {
      sessionsDir,
      memoryDir,
      sqlitePath: dbPath,
      vector: {
        engine: "sqlite-vec",
        enabled: false,
        indexSource: "chat_messages",
        triggerMode: "bot_action_only"
      }
    },
    logging: {
      dir: path.join(rootDir, "logs"),
      mode: "session_split",
      output: ["file"],
      metadataOnly: false
    },
    hotReload: {
      enabled: false,
      files: ["config.json"]
    }
  }
}

function createGateway(
  config: GatewayConfig,
  ai: AIClient,
  whatsapp: WhatsAppClient,
  sessions: SessionStore,
  sqlite: SqliteStore
): Gateway {
  return new Gateway(
    config,
    ai,
    whatsapp,
    sessions,
    sqlite,
    new Logger(path.join(rootDir, "logs"), false),
    testRetryPolicy
  )
}

describe("Gateway integration", () => {
  it("processes normal message and replies through AI", async () => {
    const events: string[] = []
    const ai = new FakeAI([{ text: "hello from ai", model: "model-a" }], events)
    const whatsapp = new FakeWhatsApp()
    const sessions = new TrackingSessionStore(sessionsDir, memoryDir, events)
    const sqlite = new TrackingSqliteStore(dbPath, events)
    const gateway = createGateway(buildConfig(), ai, whatsapp, sessions, sqlite)

    await gateway.start()
    await whatsapp.emit("hello gateway")

    expect(whatsapp.sent).toHaveLength(1)
    expect(whatsapp.sent[0]?.text).toBe("hello from ai")
    expect(ai.calls).toEqual(["model-a"])
    expect(events.indexOf("session:user")).toBeGreaterThan(-1)
    expect(events.indexOf("sqlite:user")).toBeGreaterThan(-1)
    expect(events.indexOf("ai:model-a")).toBeGreaterThan(events.indexOf("sqlite:user"))
  })

  it("handles slash commands without calling AI", async () => {
    const events: string[] = []
    const ai = new FakeAI([{ text: "unused", model: "model-a" }], events)
    const whatsapp = new FakeWhatsApp()
    const sessions = new TrackingSessionStore(sessionsDir, memoryDir, events)
    const sqlite = new TrackingSqliteStore(dbPath, events)
    const gateway = createGateway(buildConfig(), ai, whatsapp, sessions, sqlite)

    await gateway.start()
    await whatsapp.emit("/ping")
    await whatsapp.emit("/status")
    await whatsapp.emit("/unknown")

    expect(ai.calls).toHaveLength(0)
    expect(whatsapp.sent[0]?.text.startsWith("pong ")).toBe(true)
    expect(whatsapp.sent[1]?.text).toContain("uptime:")
    expect(whatsapp.sent[1]?.text).toContain("session:")
    expect(whatsapp.sent).toHaveLength(2)
  })

  it("ignores disabled slash commands based on config.commands.enabled", async () => {
    const events: string[] = []
    const ai = new FakeAI([{ text: "unused", model: "model-a" }], events)
    const whatsapp = new FakeWhatsApp()
    const sessions = new TrackingSessionStore(sessionsDir, memoryDir, events)
    const sqlite = new TrackingSqliteStore(dbPath, events)
    const config = buildConfig()
    config.commands.enabled = ["/status", "/new"]
    const gateway = createGateway(config, ai, whatsapp, sessions, sqlite)

    await gateway.start()
    await whatsapp.emit("/ping")

    expect(ai.calls).toHaveLength(0)
    expect(whatsapp.sent).toHaveLength(0)
  })

  it("moves current session to memory when /new is called", async () => {
    const events: string[] = []
    const ai = new FakeAI([{ text: "hello", model: "model-a" }], events)
    const whatsapp = new FakeWhatsApp()
    const sessions = new TrackingSessionStore(sessionsDir, memoryDir, events)
    const sqlite = new TrackingSqliteStore(dbPath, events)
    const gateway = createGateway(buildConfig(), ai, whatsapp, sessions, sqlite)

    await gateway.start()
    await whatsapp.emit("first")
    await whatsapp.emit("/new")

    const memoryFiles = await findMarkdownFiles(memoryDir)
    expect(memoryFiles.length).toBe(1)
    expect(memoryFiles[0]?.endsWith(".md")).toBe(true)
    expect(whatsapp.sent.at(-1)?.text).toBe("new session started")
  })

  it("uses fallback model after primary fails", async () => {
    const events: string[] = []
    const ai = new FakeAI(
      [new Error("primary failed"), { text: "fallback response", model: "model-b" }],
      events
    )
    const whatsapp = new FakeWhatsApp()
    const sessions = new TrackingSessionStore(sessionsDir, memoryDir, events)
    const sqlite = new TrackingSqliteStore(dbPath, events)
    const gateway = createGateway(buildConfig(), ai, whatsapp, sessions, sqlite)

    await gateway.start()
    await whatsapp.emit("retry please")

    expect(ai.calls).toEqual(["model-a", "model-b"])
    expect(whatsapp.sent[0]?.text).toBe("fallback response")
  })

  it("sends last raw provider error message to user when AI ultimately fails", async () => {
    const events: string[] = []
    const ai = new FakeAI(
      [new Error("a"), new Error("b"), new Error("c")],
      events
    )
    const whatsapp = new FakeWhatsApp()
    const sessions = new TrackingSessionStore(sessionsDir, memoryDir, events)
    const sqlite = new TrackingSqliteStore(dbPath, events)
    const gateway = createGateway(buildConfig(), ai, whatsapp, sessions, sqlite)

    await gateway.start()
    await whatsapp.emit("fail now")

    expect(whatsapp.sent[0]?.text).toBe("c")
  })

  it("returns fallback error text when AI throws a non-Error", async () => {
    const events: string[] = []
    const ai = new FakeAI(
      ["not-an-error-object", "still-not-an-error-object", "again-not-an-error-object"],
      events
    )
    const whatsapp = new FakeWhatsApp()
    const sessions = new TrackingSessionStore(sessionsDir, memoryDir, events)
    const sqlite = new TrackingSqliteStore(dbPath, events)
    const gateway = createGateway(buildConfig(), ai, whatsapp, sessions, sqlite)

    await gateway.start()
    await whatsapp.emit("force non error")

    expect(whatsapp.sent[0]?.text).toBe("AI call failed.")
  })

  it("returns internal error when /new move to memory fails with non-ENOENT error", async () => {
    const events: string[] = []
    const ai = new FakeAI([{ text: "ok", model: "model-a" }], events)
    const whatsapp = new FakeWhatsApp()
    const sessions = new FailingMoveSessionStore(sessionsDir, memoryDir, events)
    const sqlite = new TrackingSqliteStore(dbPath, events)
    const gateway = createGateway(buildConfig(), ai, whatsapp, sessions, sqlite)

    await gateway.start()
    await whatsapp.emit("hello")
    await whatsapp.emit("/new")
    expect(whatsapp.sent.at(-1)?.text).toContain("internal error")
  })

  it("writes session markdown with user and assistant messages", async () => {
    const events: string[] = []
    const ai = new FakeAI([{ text: "ack", model: "model-a" }], events)
    const whatsapp = new FakeWhatsApp()
    const sessions = new TrackingSessionStore(sessionsDir, memoryDir, events)
    const sqlite = new TrackingSqliteStore(dbPath, events)
    const gateway = createGateway(buildConfig(), ai, whatsapp, sessions, sqlite)

    await gateway.start()
    await whatsapp.emit("persist me")

    const sessionFiles = await findMarkdownFiles(sessionsDir)
    expect(sessionFiles.length).toBe(1)
    const content = await readFile(sessionFiles[0] as string, "utf8")
    expect(content).toContain("## user")
    expect(content).toContain("persist me")
    expect(content).toContain("## assistant")
    expect(content).toContain("ack")
  })

  it("creates separate session paths per chat id", async () => {
    const events: string[] = []
    const ai = new FakeAI(
      [{ text: "first-reply", model: "model-a" }, { text: "second-reply", model: "model-a" }],
      events
    )
    const whatsapp = new FakeWhatsApp()
    const sessions = new TrackingSessionStore(sessionsDir, memoryDir, events)
    const sqlite = new TrackingSqliteStore(dbPath, events)
    const gateway = createGateway(buildConfig(), ai, whatsapp, sessions, sqlite)

    await gateway.start()
    await whatsapp.emit("hello from first", "first@s.whatsapp.net")
    await whatsapp.emit("hello from second", "second@s.whatsapp.net")

    const sessionFiles = await findMarkdownFiles(sessionsDir)
    expect(sessionFiles).toHaveLength(2)
    expect(sessionFiles.some((f) => f.includes("first_s.whatsapp.net"))).toBe(true)
    expect(sessionFiles.some((f) => f.includes("second_s.whatsapp.net"))).toBe(true)
  })

  it("prepends workspace system context to AI input", async () => {
    const events: string[] = []
    const ai = new FakeAI([{ text: "ok", model: "model-a" }], events)
    const whatsapp = new FakeWhatsApp()
    const sessions = new TrackingSessionStore(sessionsDir, memoryDir, events)
    const sqlite = new TrackingSqliteStore(dbPath, events)
    const gateway = createGateway(buildConfig(), ai, whatsapp, sessions, sqlite)

    await gateway.start()
    await whatsapp.emit("hello")

    const input = ai.inputs[0] ?? []
    const systemMessages = input.filter((m) => m.role === "system")
    expect(systemMessages.length).toBeGreaterThan(0)
    expect(systemMessages[0]?.content).toMatch(/File: (AGENTS|SOUL|TOOLS|USER)\.md/)
  })

  it("sends prior session history into AI input", async () => {
    const events: string[] = []
    const ai = new FakeAI(
      [
        { text: "first-reply", model: "model-a" },
        { text: "second-reply", model: "model-a" }
      ],
      events
    )
    const whatsapp = new FakeWhatsApp()
    const sessions = new TrackingSessionStore(sessionsDir, memoryDir, events)
    const sqlite = new TrackingSqliteStore(dbPath, events)
    const gateway = createGateway(buildConfig(), ai, whatsapp, sessions, sqlite)

    await gateway.start()
    await whatsapp.emit("first")
    await whatsapp.emit("second")

    expect(ai.inputs).toHaveLength(2)
    expect(ai.inputs[0]?.at(-1)).toEqual(
      {
        role: "user",
        content: "first",
        createdAt: expect.any(String)
      }
    )
    expect(ai.inputs[1]?.slice(-3)).toEqual([
      {
        role: "user",
        content: "first",
        createdAt: expect.any(String)
      },
      {
        role: "assistant",
        content: "first-reply",
        createdAt: expect.any(String)
      },
      {
        role: "user",
        content: "second",
        createdAt: expect.any(String)
      }
    ])
  })
})
