import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { BaileysClient } from "../../src/integrations/whatsapp/baileys-client.js"

type EventHandler = (...args: unknown[]) => void | Promise<void>

interface FakeSocket {
  ev: {
    on: (event: string, handler: EventHandler) => void
    removeAllListeners: (event: string) => void
  }
  sendMessage: ReturnType<typeof vi.fn>
  readMessages: ReturnType<typeof vi.fn>
  sendPresenceUpdate: ReturnType<typeof vi.fn>
}

const {
  sockets,
  handlersBySocket,
  useMultiFileAuthStateMock,
  makeWASocketMock
} = vi.hoisted(() => {
  const sockets: FakeSocket[] = []
  const handlersBySocket = new Map<FakeSocket, Map<string, EventHandler[]>>()
  const useMultiFileAuthStateMock = vi.fn()
  const makeWASocketMock = vi.fn(() => {
    const handlers = new Map<string, EventHandler[]>()
    const sock: FakeSocket = {
      ev: {
        on: (event: string, handler: EventHandler) => {
          const existing = handlers.get(event) ?? []
          existing.push(handler)
          handlers.set(event, existing)
        },
        removeAllListeners: (event: string) => {
          handlers.delete(event)
        }
      },
      sendMessage: vi.fn(),
      readMessages: vi.fn(),
      sendPresenceUpdate: vi.fn()
    }
    sockets.push(sock)
    handlersBySocket.set(sock, handlers)
    return sock
  })

  return {
    sockets,
    handlersBySocket,
    useMultiFileAuthStateMock,
    makeWASocketMock
  }
})

vi.mock("@whiskeysockets/baileys", () => ({
  default: makeWASocketMock,
  useMultiFileAuthState: useMultiFileAuthStateMock
}))

vi.mock("qrcode-terminal", () => ({
  default: {
    generate: vi.fn()
  }
}))

async function emitSocketEvent(socket: FakeSocket, event: string, payload: unknown): Promise<void> {
  const handlers = handlersBySocket.get(socket)?.get(event) ?? []
  for (const handler of handlers) {
    await handler(payload)
  }
}

describe("BaileysClient", () => {
  beforeEach(() => {
    sockets.length = 0
    handlersBySocket.clear()
    useMultiFileAuthStateMock.mockReset()
    makeWASocketMock.mockClear()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  async function startClient(): Promise<{ client: BaileysClient; socket: FakeSocket }> {
    useMultiFileAuthStateMock.mockResolvedValue({ state: {}, saveCreds: vi.fn() })
    const client = new BaileysClient("auth")
    await client.start(async () => {})
    const socket = sockets[0]
    if (!socket) {
      throw new Error("expected socket")
    }
    return { client, socket }
  }

  it("keeps reconnecting when reconnect attempt fails", async () => {
    const timeoutSpy = vi.spyOn(globalThis, "setTimeout")
    useMultiFileAuthStateMock
      .mockResolvedValueOnce({ state: {}, saveCreds: vi.fn() })
      .mockImplementationOnce(() => {
        throw new Error("reconnect failed")
      })
      .mockResolvedValueOnce({ state: {}, saveCreds: vi.fn() })

    const client = new BaileysClient("auth")
    await client.start(async () => {})
    expect(useMultiFileAuthStateMock).toHaveBeenCalledTimes(1)

    const firstSocket = sockets[0]
    if (!firstSocket) {
      throw new Error("expected initial socket")
    }

    await emitSocketEvent(firstSocket, "connection.update", { connection: "close" })

    await vi.advanceTimersByTimeAsync(3_000)
    await Promise.resolve()

    expect(useMultiFileAuthStateMock).toHaveBeenCalledTimes(2)
    expect(timeoutSpy).toHaveBeenCalledTimes(2)
  })

  it("updates status on open event", async () => {
    const { client, socket } = await startClient()
    expect(client.status()).toBe("disconnected")
    await emitSocketEvent(socket, "connection.update", { connection: "open" })
    expect(client.status()).toBe("connected")
  })

  it("throws on sendText when socket is unavailable", async () => {
    const client = new BaileysClient("auth")
    await expect(client.sendText("x", "hello")).rejects.toThrow(/not connected/i)
  })

  it("sends paused presence then message in sendText", async () => {
    const { client, socket } = await startClient()
    await client.sendText("chat@s.whatsapp.net", "hello")
    expect(socket.sendPresenceUpdate).toHaveBeenCalledWith("paused", "chat@s.whatsapp.net")
    expect(socket.sendMessage).toHaveBeenCalledWith("chat@s.whatsapp.net", { text: "hello" })
  })

  it("ignores non-notify/append upsert events", async () => {
    const onMessage = vi.fn()
    useMultiFileAuthStateMock.mockResolvedValue({ state: {}, saveCreds: vi.fn() })
    const client = new BaileysClient("auth")
    await client.start(onMessage)
    const socket = sockets[0]
    if (!socket) {
      throw new Error("expected socket")
    }

    await emitSocketEvent(socket, "messages.upsert", {
      type: "history",
      messages: [{ key: { remoteJid: "u@s.whatsapp.net" }, message: { conversation: "x" } }]
    })

    expect(onMessage).not.toHaveBeenCalled()
  })

  it("filters fromMe messages and non-dm messages", async () => {
    const onMessage = vi.fn()
    useMultiFileAuthStateMock.mockResolvedValue({ state: {}, saveCreds: vi.fn() })
    const client = new BaileysClient("auth")
    await client.start(onMessage)
    const socket = sockets[0]
    if (!socket) {
      throw new Error("expected socket")
    }

    await emitSocketEvent(socket, "messages.upsert", {
      type: "notify",
      messages: [
        {
          key: { id: "1", remoteJid: "u@s.whatsapp.net", fromMe: true },
          message: { conversation: "skip me" }
        },
        {
          key: { id: "2", remoteJid: "group@g.us", fromMe: false },
          message: { conversation: "skip group" }
        }
      ]
    })

    expect(onMessage).not.toHaveBeenCalled()
  })

  it("deduplicates repeated message ids", async () => {
    const onMessage = vi.fn()
    useMultiFileAuthStateMock.mockResolvedValue({ state: {}, saveCreds: vi.fn() })
    const client = new BaileysClient("auth")
    await client.start(onMessage)
    const socket = sockets[0]
    if (!socket) {
      throw new Error("expected socket")
    }

    const message = {
      key: { id: "dup", remoteJid: "u@s.whatsapp.net", fromMe: false },
      message: { conversation: "hello" },
      messageTimestamp: 1
    }

    await emitSocketEvent(socket, "messages.upsert", { type: "notify", messages: [message] })
    await emitSocketEvent(socket, "messages.upsert", { type: "notify", messages: [message] })

    expect(onMessage).toHaveBeenCalledTimes(1)
  })

  it("handles mark-as-read and presence failures without failing message handling", async () => {
    const onMessage = vi.fn()
    useMultiFileAuthStateMock.mockResolvedValue({ state: {}, saveCreds: vi.fn() })
    const client = new BaileysClient("auth")
    await client.start(onMessage)
    const socket = sockets[0]
    if (!socket) {
      throw new Error("expected socket")
    }

    socket.readMessages.mockRejectedValueOnce(new Error("read fail"))
    socket.sendPresenceUpdate.mockRejectedValue(new Error("presence fail"))

    await emitSocketEvent(socket, "messages.upsert", {
      type: "notify",
      messages: [
        {
          key: { id: "x", remoteJid: "u@s.whatsapp.net", fromMe: false },
          message: { conversation: "hello" },
          messageTimestamp: 1
        }
      ]
    })

    expect(onMessage).toHaveBeenCalledTimes(1)
  })
})
