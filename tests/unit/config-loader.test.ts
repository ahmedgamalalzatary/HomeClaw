import { writeFile } from "node:fs/promises"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ConfigLoader } from "../../src/config/loader.js"
import { createTempDir, removeTempDir } from "../helpers/temp-dir.js"

const sampleConfig = {
  provider: {
    name: "google",
    apiKey: "x",
    primaryModel: "m1",
    fallbackModels: ["m2"],
    params: {
      temperature: 0.2,
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
    enabled: true,
    intervalMinutes: 30
  },
  storage: {
    sessionsDir: "sessions",
    memoryDir: "memory",
    sqlitePath: "db/gateway.sqlite",
    vector: {
      engine: "sqlite-vec",
      enabled: false,
      indexSource: "chat_messages",
      triggerMode: "bot_action_only"
    }
  },
  logging: {
    dir: "logs",
    mode: "session_split",
    output: ["file"],
    metadataOnly: false
  },
  hotReload: {
    enabled: true,
    files: ["config.json"]
  }
}

const watchCallbacks: Array<(eventType: string) => void | Promise<void>> = []

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs")
  return {
    ...actual,
    watch: vi.fn((_path: string, callback: (eventType: string) => void | Promise<void>) => {
      watchCallbacks.push(callback)
      return { close: vi.fn() }
    })
  }
})

afterEach(() => {
  watchCallbacks.length = 0
  vi.restoreAllMocks()
})

describe("ConfigLoader", () => {
  it("loads config file and exposes current config", async () => {
    const dir = await createTempDir("config-loader")
    try {
      const configPath = path.join(dir, "config.json")
      await writeFile(configPath, JSON.stringify(sampleConfig), "utf8")

      const loader = new ConfigLoader(configPath)
      const loaded = await loader.load()
      expect(loaded.provider.primaryModel).toBe("m1")
      expect(loader.getCurrent().logging.mode).toBe("session_split")
    } finally {
      await removeTempDir(dir)
    }
  })

  it("throws if getCurrent is called before load", () => {
    const loader = new ConfigLoader("config.json")
    expect(() => loader.getCurrent()).toThrow(/Config has not been loaded yet/)
  })

  it("throws when config file shape is invalid", async () => {
    const dir = await createTempDir("config-loader-invalid")
    try {
      const configPath = path.join(dir, "config.json")
      await writeFile(configPath, JSON.stringify({
        ...sampleConfig,
        provider: {
          ...sampleConfig.provider,
          fallbackModels: "not-an-array"
        }
      }), "utf8")

      const loader = new ConfigLoader(configPath)
      await expect(loader.load()).rejects.toThrow(/Invalid config/)
    } finally {
      await removeTempDir(dir)
    }
  })

  it("formats root-level validation issues with <root>", async () => {
    const dir = await createTempDir("config-loader-root-invalid")
    try {
      const configPath = path.join(dir, "config.json")
      await writeFile(configPath, "null", "utf8")

      const loader = new ConfigLoader(configPath)
      await expect(loader.load()).rejects.toThrow(/<root>:/)
    } finally {
      await removeTempDir(dir)
    }
  })

  it("reports parser errors from watch reload failures", async () => {
    const dir = await createTempDir("config-loader-watch-invalid-json")
    try {
      const configPath = path.join(dir, "config.json")
      await writeFile(configPath, JSON.stringify(sampleConfig), "utf8")
      const stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true)
      const onReload = vi.fn()
      const loader = new ConfigLoader(configPath)

      loader.watch(onReload)
      await writeFile(configPath, "{invalid", "utf8")
      await watchCallbacks[0]?.("change")

      expect(onReload).not.toHaveBeenCalled()
      expect(stderrSpy).toHaveBeenCalled()
      expect(String(stderrSpy.mock.calls[0]?.[0])).toContain("Config reload failed:")
    } finally {
      await removeTempDir(dir)
    }
  })

  it("ignores non-change watch events", async () => {
    const dir = await createTempDir("config-loader-watch-rename")
    try {
      const configPath = path.join(dir, "config.json")
      await writeFile(configPath, JSON.stringify(sampleConfig), "utf8")
      const onReload = vi.fn()
      const loader = new ConfigLoader(configPath)

      loader.watch(onReload)
      await watchCallbacks[0]?.("rename")

      expect(onReload).not.toHaveBeenCalled()
    } finally {
      await removeTempDir(dir)
    }
  })

  it("reports non-Error watch callback failures", async () => {
    const dir = await createTempDir("config-loader-watch-string-error")
    try {
      const configPath = path.join(dir, "config.json")
      await writeFile(configPath, JSON.stringify(sampleConfig), "utf8")
      const stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true)
      const loader = new ConfigLoader(configPath)

      loader.watch(() => {
        throw "reload-string-error"
      })
      await watchCallbacks[0]?.("change")

      expect(stderrSpy).toHaveBeenCalled()
      expect(String(stderrSpy.mock.calls[0]?.[0])).toContain("reload-string-error")
    } finally {
      await removeTempDir(dir)
    }
  })
})
