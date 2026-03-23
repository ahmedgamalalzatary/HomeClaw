import { describe, expect, it, vi } from "vitest"
import { GoogleAIClient } from "../../src/integrations/ai/google-client.js"
import type { ChatMessage } from "../../src/types/chat.js"

const { generateContentMock, googleGenAIMock } = vi.hoisted(() => {
  const generateContentMock = vi.fn()
  const googleGenAIMock = vi.fn(function GoogleGenAIMock() {
    return {
      models: {
        generateContent: generateContentMock
      }
    }
  })
  return {
    generateContentMock,
    googleGenAIMock
  }
})

vi.mock("@google/genai", () => ({
  GoogleGenAI: googleGenAIMock
}))

describe("GoogleAIClient", () => {
  it("returns text and model from provider response", async () => {
    generateContentMock.mockResolvedValueOnce({
      text: "ok",
      modelVersion: "gemini-version"
    })
    const client = new GoogleAIClient("k")
    const input: ChatMessage[] = [
      {
        role: "user",
        content: "Hello",
        createdAt: "2026-01-02T03:04:05.000Z"
      }
    ]

    const response = await client.complete(input, "gemini-model", {
      temperature: 0,
      topP: 1,
      maxOutputTokens: 16
    })

    expect(response).toEqual({
      text: "ok",
      model: "gemini-version"
    })
  })

  it("throws when provider returns empty text", async () => {
    generateContentMock.mockResolvedValueOnce({
      text: "   ",
      modelVersion: "gemini-version"
    })

    const client = new GoogleAIClient("k")
    const input: ChatMessage[] = [
      {
        role: "user",
        content: "Hello",
        createdAt: "2026-01-02T03:04:05.000Z"
      }
    ]

    await expect(
      client.complete(input, "gemini-model", {
        temperature: 0,
        topP: 1,
        maxOutputTokens: 16
      })
    ).rejects.toThrow(/empty response/i)
  })
})
