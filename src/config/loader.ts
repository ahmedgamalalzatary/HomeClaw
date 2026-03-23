import { readFile } from "node:fs/promises";
import { watch } from "node:fs";
import path from "node:path";
import { type GatewayConfig, GatewayConfigSchema } from "./types.js";

function formatConfigError(error: unknown): string {
  if (typeof error !== "object" || error === null || !("issues" in error)) {
    return error instanceof Error ? error.message : String(error)
  }

  const issues = (error as { issues?: Array<{ path?: Array<string | number>; message: string }> }).issues ?? []
  if (issues.length === 0) {
    return "invalid configuration"
  }

  return issues
    .map((issue) => `${issue.path?.join(".") || "<root>"}: ${issue.message}`)
    .join("; ")
}

export class ConfigLoader {
  private readonly configPath: string;
  private current: GatewayConfig | null = null;

  constructor(configPath = "config.json") {
    this.configPath = path.resolve(configPath);
  }

  async load(): Promise<GatewayConfig> {
    const raw = await readFile(this.configPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    const validated = GatewayConfigSchema.safeParse(parsed)
    if (!validated.success) {
      throw new Error(`Invalid config: ${formatConfigError(validated.error)}`)
    }
    this.current = validated.data;
    return validated.data;
  }

  getCurrent(): GatewayConfig {
    if (!this.current) {
      throw new Error("Config has not been loaded yet.");
    }
    return this.current;
  }

  watch(onReload: (next: GatewayConfig) => Promise<void> | void): void {
    watch(this.configPath, async (eventType) => {
      if (eventType !== "change") {
        return;
      }

      try {
        const nextConfig = await this.load();
        await onReload(nextConfig);
      } catch (error) {
        const reason = error instanceof Error ? error.stack ?? error.message : String(error)
        process.stderr.write(`Config reload failed: ${reason}\n`)
      }
    });
  }
}
