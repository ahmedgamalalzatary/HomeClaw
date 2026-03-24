import { afterEach, describe, expect, it, vi } from "vitest"

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
  vi.doUnmock("node:fs")
  vi.doUnmock("node:fs/promises")
  vi.doUnmock("../../src/config/types.js")
})

describe("ConfigLoader branch coverage", () => {
  it("formats schema errors with missing issues as invalid configuration", async () => {
    vi.doMock("node:fs/promises", () => ({
      readFile: vi.fn().mockResolvedValue("{}")
    }))
    vi.doMock("../../src/config/types.js", () => ({
      GatewayConfigSchema: {
        safeParse: vi.fn().mockReturnValue({
          success: false,
          error: { issues: undefined }
        })
      }
    }))

    const { ConfigLoader } = await import("../../src/config/loader.js")
    const loader = new ConfigLoader("config.json")

    await expect(loader.load()).rejects.toThrow("Invalid config: invalid configuration")
  })

  it("reports watch callback Errors using their message when no stack is available", async () => {
    const watchCallbacks: Array<(eventType: string) => void | Promise<void>> = []

    vi.doMock("node:fs/promises", () => ({
      readFile: vi.fn().mockResolvedValue("{}")
    }))
    vi.doMock("node:fs", () => ({
      watch: vi.fn((_path: string, callback: (eventType: string) => void | Promise<void>) => {
        watchCallbacks.push(callback)
        return { close: vi.fn() }
      })
    }))
    vi.doMock("../../src/config/types.js", () => ({
      GatewayConfigSchema: {
        safeParse: vi.fn().mockReturnValue({
          success: true,
          data: { ok: true }
        })
      }
    }))

    const { ConfigLoader } = await import("../../src/config/loader.js")
    const stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true)
    const loader = new ConfigLoader("config.json")
    const reloadError = new Error("reload message only")
    Object.defineProperty(reloadError, "stack", {
      value: undefined,
      configurable: true
    })

    loader.watch(() => {
      throw reloadError
    })
    const watchCallback = watchCallbacks[0]
    expect(watchCallback).toBeDefined()
    expect(watchCallback).toBeInstanceOf(Function)
    await watchCallback!("change")

    expect(stderrSpy).toHaveBeenCalled()
    expect(String(stderrSpy.mock.calls[0]?.[0])).toContain("reload message only")
  })
})
