import { readFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, it, vi } from "vitest"
import { Logger } from "../../src/core/logger.js"
import { createTempDir, removeTempDir } from "../helpers/temp-dir.js"

describe("Logger", () => {
  it("writes log entries to session log file", async () => {
    const dir = await createTempDir("logger")
    try {
      const logger = new Logger(dir, false)
      await logger.setSession("s1")
      await logger.info("hello")
      await logger.warn("warn")
      await logger.error("error")

      const content = await readFile(path.join(dir, "s1.log"), "utf8")
      expect(content).toContain("[INFO] hello")
      expect(content).toContain("[WARN] warn")
      expect(content).toContain("[ERROR] error")
    } finally {
      await removeTempDir(dir)
    }
  })

  it("writes to stdout when console logging is enabled", async () => {
    const dir = await createTempDir("logger-console")
    try {
      const stdoutSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true)
      const logger = new Logger(dir, true)

      await logger.setSession("console")
      await logger.info("hello console")

      expect(stdoutSpy).toHaveBeenCalled()
      expect(String(stdoutSpy.mock.calls[0]?.[0])).toContain("[INFO] hello console")
    } finally {
      await removeTempDir(dir)
      vi.restoreAllMocks()
    }
  })
})
