import { describe, expect, it } from "vitest"
import {
  buildRetryPlan,
  DEFAULT_DELAYS_MS,
  DEFAULT_MAX_ATTEMPTS
} from "../../src/core/retry-policy.js"
import type { ProviderConfig } from "../../src/config/types.js"

function buildProvider(): ProviderConfig {
  return {
    name: "google",
    apiKey: "x",
    primaryModel: "model-a",
    fallbackModels: ["model-b", "model-c"],
    params: {
      temperature: 0.2,
      topP: 1,
      maxOutputTokens: 512
    },
  }
}

describe("buildRetryPlan", () => {
  it("builds plan from internal defaults", () => {
    const plan = buildRetryPlan(buildProvider())
    expect(plan).toEqual([
      { model: "model-a", delayMs: DEFAULT_DELAYS_MS[0] },
      { model: "model-b", delayMs: DEFAULT_DELAYS_MS[1] },
      { model: "model-c", delayMs: DEFAULT_DELAYS_MS[2] }
    ])
    expect(plan).toHaveLength(DEFAULT_MAX_ATTEMPTS)
    expect(plan.every((attempt) => typeof attempt.model === "string" && attempt.model.length > 0))
      .toBe(true)
  })

  it("reuses last model and delay when overrides exceed configured arrays", () => {
    const plan = buildRetryPlan(buildProvider(), {
      maxAttempts: 4,
      delaysMs: [10]
    })
    expect(plan).toEqual([
      { model: "model-a", delayMs: 10 },
      { model: "model-b", delayMs: 10 },
      { model: "model-c", delayMs: 10 },
      { model: "model-c", delayMs: 10 }
    ])
  })

  it("clamps maxAttempts of 0 to 1", () => {
    const plan = buildRetryPlan(buildProvider(), { maxAttempts: 0 })
    expect(plan).toHaveLength(1)
    expect(plan[0]?.model).toBe("model-a")
  })

  it("repeats primary model for all attempts when no fallbacks configured", () => {
    const provider: ProviderConfig = {
      ...buildProvider(),
      fallbackModels: []
    }
    const plan = buildRetryPlan(provider, { maxAttempts: 3 })
    expect(plan).toEqual([
      { model: "model-a", delayMs: DEFAULT_DELAYS_MS[0] },
      { model: "model-a", delayMs: DEFAULT_DELAYS_MS[1] },
      { model: "model-a", delayMs: DEFAULT_DELAYS_MS[2] }
    ])
  })

  it("falls back to zero delay when overrides provide an empty list", () => {
    const plan = buildRetryPlan(buildProvider(), {
      maxAttempts: 2,
      delaysMs: []
    })

    expect(plan).toEqual([
      { model: "model-a", delayMs: 0 },
      { model: "model-b", delayMs: 0 }
    ])
  })

  it("clamps undefined delay values to zero", () => {
    const plan = buildRetryPlan(buildProvider(), {
      maxAttempts: 1,
      delaysMs: [undefined as unknown as number]
    })

    expect(plan).toEqual([{ model: "model-a", delayMs: 0 }])
  })
})
