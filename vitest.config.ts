import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/live/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      reportsDirectory: "coverage",
      include: ["src/**/*.ts"],
      exclude: [
        "src/index.ts",
        "src/config/types.ts",
        "src/types/**/*.ts",
        "src/integrations/ai/client.ts",
        "src/integrations/whatsapp/client.ts"
      ],
      thresholds: {
        lines: 70,
        branches: 70
      }
    }
  }
})
