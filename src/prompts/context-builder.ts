import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ChatMessage } from "../types/chat.js";
import { isMissingFileError } from "../tools/errors.js";

const CORE_FILES = ["AGENTS.md", "SOUL.md", "TOOLS.md", "USER.md"] as const;

async function safeRead(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (isMissingFileError(error)) {
      return "";
    }
    throw error
  }
}

export async function buildBaseContext(workspaceDir: string): Promise<ChatMessage[]> {
  const messages: ChatMessage[] = [];

  for (const file of CORE_FILES) {
    const content = await safeRead(path.join(workspaceDir, file));
    if (!content.trim()) {
      continue;
    }
    messages.push({
      role: "system",
      content: `File: ${file}\n${content}`,
      createdAt: new Date().toISOString()
    });
  }

  return messages;
}

export async function buildHeartbeatContext(
  workspaceDir: string
): Promise<ChatMessage[]> {
  const base = await buildBaseContext(workspaceDir);
  const heartbeat = await safeRead(path.join(workspaceDir, "HEARTBEAT.md"));

  if (heartbeat.trim()) {
    base.push({
      role: "system",
      content: `File: HEARTBEAT.md\n${heartbeat}`,
      createdAt: new Date().toISOString()
    });
  }

  return base;
}
