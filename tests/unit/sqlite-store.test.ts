import { mkdir } from "node:fs/promises"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { SqliteStore } from "../../src/storage/sqlite-store.js"
import { createTempDir, removeTempDir } from "../helpers/temp-dir.js"

describe("SqliteStore", () => {
  let store: SqliteStore
  const tempDirs: string[] = []

  beforeEach(async () => {
    store = new SqliteStore(":memory:")
    await store.connect()
  })

  afterEach(async () => {
    const closable = store as unknown as {
      close?: () => Promise<void> | void
      dispose?: () => Promise<void> | void
    }

    if (typeof closable.close === "function") {
      await closable.close()
    } else if (typeof closable.dispose === "function") {
      await closable.dispose()
    }

    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()
      if (dir) {
        await removeTempDir(dir)
      }
    }
  })

  it("supports connect and save calls without throwing", async () => {
    await expect(
      store.saveMessage("chat-1", {
        role: "user",
        content: "hello",
        createdAt: new Date().toISOString()
      }, "sessions/chat-1/2026-01-02/03-04-05.md")
    ).resolves.toBeUndefined()
  })

  it("returns ready status", async () => {
    await expect(store.status()).resolves.toMatch(/^ready messages=\d+ sessions=\d+$/)
  })

  it("allows calling close before connect", async () => {
    const disconnected = new SqliteStore(":memory:")
    await expect(disconnected.close()).resolves.toBeUndefined()
  })

  it("throws when used before connect", async () => {
    const disconnected = new SqliteStore(":memory:")
    await expect(
      disconnected.saveMessage(
        "chat-1",
        {
          role: "user",
          content: "hello",
          createdAt: new Date().toISOString()
        },
        "sessions/chat-1/2026-01-02/03-04-05.md"
      )
    ).rejects.toThrow(/SQLite is not connected/)
  })

  it("creates db directory for file-backed database and supports repeated connect", async () => {
    const dir = await createTempDir("sqlite-file-db")
    tempDirs.push(dir)
    const dbDir = path.join(dir, "db")
    const dbPath = path.join(dbDir, "gateway.sqlite")
    const fileStore = new SqliteStore(dbPath)

    await expect(fileStore.connect()).resolves.toBeUndefined()
    await expect(fileStore.connect()).resolves.toBeUndefined()
    await expect(mkdir(dbDir, { recursive: false })).rejects.toMatchObject({ code: "EEXIST" })

    await fileStore.close()
  })

  it("stores and reads active session paths", async () => {
    await store.setActiveSessionPath("chat-1", "sessions/chat-1/2026-01-02/03-04-05.md")

    await expect(store.getActiveSessionPath("chat-1")).resolves.toBe(
      "sessions/chat-1/2026-01-02/03-04-05.md"
    )
    await expect(store.getActiveSessionPath("missing-chat")).resolves.toBeNull()
  })

  it("reports zero counts for a freshly connected database", async () => {
    await expect(store.status()).resolves.toBe("ready messages=0 sessions=0")
  })
})
