import { appendFile, mkdir, readFile, rename, stat } from "node:fs/promises"
import path from "node:path"
import type { ChatMessage } from "../types/chat.js"
import { isMissingFileError } from "../tools/errors.js"

export class SessionStore {
  constructor(
    private readonly sessionsDir: string,
    private readonly memoryDir: string
  ) { }

  buildSessionPath(chatId: string, date = new Date()): string {
    const safeChatId = this.sanitizeChatId(chatId)
    const y = date.getUTCFullYear()
    const m = String(date.getUTCMonth() + 1).padStart(2, "0")
    const d = String(date.getUTCDate()).padStart(2, "0")
    const h = String(date.getUTCHours()).padStart(2, "0")
    const min = String(date.getUTCMinutes()).padStart(2, "0")
    const s = String(date.getUTCSeconds()).padStart(2, "0")
    return path.join(
      this.sessionsDir,
      safeChatId,
      `${y}-${m}-${d}`,
      `${h}-${min}-${s}.md`
    )
  }

  async appendMessage(sessionPath: string, message: ChatMessage): Promise<void> {
    await mkdir(path.dirname(sessionPath), { recursive: true })
    const safeContent = this.serializeContent(message.content)
    const block = `\n## ${message.role} (${message.createdAt})\n${safeContent}\n`
    await appendFile(sessionPath, block, "utf8")
  }

  async getMessages(sessionPath: string): Promise<ChatMessage[]> {
    let raw: string
    try {
      raw = await readFile(sessionPath, "utf8")
    } catch (error) {
      if (isMissingFileError(error)) {
        return []
      }
      throw error
    }

    const messages: ChatMessage[] = []
    const sectionPattern = /(?:^|\n)## (system|user|assistant) \(([^)]+)\)\n([\s\S]*?)(?=\n## (?:system|user|assistant) \(|$)/g

    for (const match of raw.matchAll(sectionPattern)) {
      const role = match[1] as ChatMessage["role"]
      const createdAt = match[2]
      const content = this.deserializeContent(match[3] ?? "")

      if (!role || !createdAt) {
        continue
      }

      messages.push({
        role,
        content,
        createdAt
      })
    }
    return messages
  }

  async moveSessionToMemory(sessionPath: string): Promise<string> {
    const targetDir = this.memoryDir
    await mkdir(targetDir, { recursive: true })

    let target = ""
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const candidate = path.join(targetDir, `${this.buildMemoryFileId()}.md`)
      try {
        await stat(candidate)
      } catch (error) {
        if (isMissingFileError(error)) {
          target = candidate
          break
        }
        throw error
      }
    }
    if (!target) {
      throw new Error("Failed to allocate unique memory file id after 10 attempts.")
    }

    await rename(sessionPath, target)
    return target
  }

  private buildMemoryFileId(): string {
    const now = new Date()
    const y = now.getUTCFullYear()
    const m = String(now.getUTCMonth() + 1).padStart(2, "0")
    const d = String(now.getUTCDate()).padStart(2, "0")
    const h = String(now.getUTCHours()).padStart(2, "0")
    const min = String(now.getUTCMinutes()).padStart(2, "0")
    const s = String(now.getUTCSeconds()).padStart(2, "0")
    return `${y}${m}${d}${h}${min}${s}`
  }

  private serializeContent(content: string): string {
    return content
      .split("\n")
      .map((line) => `  ${line}`)
      .join("\n")
  }

  private deserializeContent(content: string): string {
    return content
      .split("\n")
      .map((line) => (line.startsWith("  ") ? line.slice(2) : line))
      .join("\n")
      .trim()
  }

  private sanitizeChatId(chatId: string): string {
    return chatId.replaceAll(/[^a-zA-Z0-9._-]/g, "_")
  }
}

