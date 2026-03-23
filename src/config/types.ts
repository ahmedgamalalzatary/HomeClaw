import { z } from "zod"

export interface GatewayConfig {
  provider: ProviderConfig;
  whatsapp: WhatsAppConfig;
  commands: CommandsConfig;
  heartbeat: HeartbeatConfig;
  storage: StorageConfig;
  logging: LoggingConfig;
  hotReload: HotReloadConfig;
}

export interface ProviderConfig {
  name: string;
  apiKey: string;
  primaryModel: string;
  fallbackModels: string[];
  params: ProviderParams;
}

export interface ProviderParams {
  temperature: number;
  topP: number;
  maxOutputTokens: number;
}

export interface WhatsAppConfig {
  driver: "baileys";
  mode: "dm_only";
  authPath: string;
  textOnly: boolean;
}

export interface CommandsConfig {
  enabled: string[];
  unknownCommandBehavior: "ignore";
}

export interface HeartbeatConfig {
  enabled: boolean;
  intervalMinutes: number;
}

export interface StorageConfig {
  sessionsDir: string;
  memoryDir: string;
  sqlitePath: string;
  vector: VectorConfig;
}

export interface VectorConfig {
  engine: "sqlite-vec";
  enabled: boolean;
  indexSource: "chat_messages";
  triggerMode: "bot_action_only";
}

export interface LoggingConfig {
  dir: string;
  mode: "session_split";
  output: Array<"file" | "console">;
  metadataOnly: boolean;
}

export interface HotReloadConfig {
  enabled: boolean;
  files: string[];
}

export const GatewayConfigSchema: z.ZodType<GatewayConfig> = z.object({
  provider: z.object({
    name: z.string().min(1),
    apiKey: z.string().min(1),
    primaryModel: z.string().min(1),
    fallbackModels: z.array(z.string()),
    params: z.object({
      temperature: z.number(),
      topP: z.number(),
      maxOutputTokens: z.number().int().positive()
    })
  }),
  whatsapp: z.object({
    driver: z.literal("baileys"),
    mode: z.literal("dm_only"),
    authPath: z.string().min(1),
    textOnly: z.boolean()
  }),
  commands: z.object({
    enabled: z.array(z.string()),
    unknownCommandBehavior: z.literal("ignore")
  }),
  heartbeat: z.object({
    enabled: z.boolean(),
    intervalMinutes: z.number().positive()
  }),
  storage: z.object({
    sessionsDir: z.string().min(1),
    memoryDir: z.string().min(1),
    sqlitePath: z.string().min(1),
    vector: z.object({
      engine: z.literal("sqlite-vec"),
      enabled: z.boolean(),
      indexSource: z.literal("chat_messages"),
      triggerMode: z.literal("bot_action_only")
    })
  }),
  logging: z.object({
    dir: z.string().min(1),
    mode: z.literal("session_split"),
    output: z.array(z.union([z.literal("file"), z.literal("console")])),
    metadataOnly: z.boolean()
  }),
  hotReload: z.object({
    enabled: z.boolean(),
    files: z.array(z.string())
  })
})
