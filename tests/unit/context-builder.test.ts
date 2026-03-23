import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { buildBaseContext, buildHeartbeatContext } from "../../src/prompts/context-builder.js"
import { createTempDir, removeTempDir } from "../helpers/temp-dir.js"

const tempDirs: string[] = []

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      await removeTempDir(dir)
    }
  }
})

describe("context builders", () => {
  it("loads base context in expected file order", async () => {
    const dir = await createTempDir("context-base")
    tempDirs.push(dir)

    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, "AGENTS.md"), "agents", "utf8")
    await writeFile(path.join(dir, "SOUL.md"), "soul", "utf8")
    await writeFile(path.join(dir, "TOOLS.md"), "tools", "utf8")
    await writeFile(path.join(dir, "USER.md"), "user", "utf8")

    const messages = await buildBaseContext(dir)
    expect(messages.map((m) => m.role)).toEqual(["system", "system", "system", "system"])
    expect(messages[0]?.content).toContain("File: AGENTS.md")
    expect(messages[1]?.content).toContain("File: SOUL.md")
    expect(messages[2]?.content).toContain("File: TOOLS.md")
    expect(messages[3]?.content).toContain("File: USER.md")
  })

  it("silently skips missing workspace files and returns partial context", async () => {
    const dir = await createTempDir("context-partial")
    tempDirs.push(dir)

    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, "SOUL.md"), "soul only", "utf8")

    const messages = await buildBaseContext(dir)
    expect(messages).toHaveLength(1)
    expect(messages[0]?.content).toContain("File: SOUL.md")
  })

  it("adds heartbeat file as extra system context when available", async () => {
    const dir = await createTempDir("context-heartbeat")
    tempDirs.push(dir)

    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, "AGENTS.md"), "agents", "utf8")
    await writeFile(path.join(dir, "HEARTBEAT.md"), "tick", "utf8")

    const messages = await buildHeartbeatContext(dir)
    expect(messages.at(-1)?.content).toContain("File: HEARTBEAT.md")
    expect(messages.at(-1)?.content).toContain("tick")
  })

  it("rethrows non-ENOENT errors while reading workspace files", async () => {
    const dir = await createTempDir("context-broken")
    tempDirs.push(dir)

    await mkdir(path.join(dir, "AGENTS.md"), { recursive: true })

    await expect(buildBaseContext(dir)).rejects.toMatchObject({
      code: "EISDIR"
    })
  })
})
