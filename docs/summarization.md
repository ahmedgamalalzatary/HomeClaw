# Claw Gateway Codebase Summary

Verified against the current codebase on 2026-03-23.

## 1. Architecture Summary

The current system is a Node.js worker that connects WhatsApp DMs to a Google Generative AI client.

Runtime flow:

1. `BaileysClient` receives a DM text message.
2. `Gateway` checks for a slash command.
3. For normal messages, `Gateway`:
- loads the active session path from memory or SQLite
- reads prior history from the markdown session file
- appends the new user message to markdown and SQLite
- loads base workspace context from `workspace/AGENTS.md`, `SOUL.md`, `TOOLS.md`, and `USER.md`
- calls the AI client with retries/fallback models
- appends the assistant reply to markdown and SQLite
- sends the reply back through WhatsApp

Important implementation notes:

- Markdown session files are the live history source used for AI context.
- SQLite stores active session pointers and full message rows, but there is no search API yet.
- Heartbeat, vector memory, workspace tooling, checkpoints, and web access are only partial scaffolds or are not built.

## 2. Current Directory Layout

```text
.
├── .github/
│   └── workflows/
│       ├── ci.yml
│       ├── deploy.yml
│       └── live-smoke.yml
├── docs/
│   ├── Checklist.md
│   ├── Features.md
│   ├── phases.md
│   └── summarization.md
├── scripts/
│   ├── count-lines.ps1
│   └── count-lines.sh
├── src/
│   ├── commands/
│   │   ├── handlers.ts
│   │   └── router.ts
│   ├── config/
│   │   ├── loader.ts
│   │   └── types.ts
│   ├── core/
│   │   ├── gateway.ts
│   │   ├── logger.ts
│   │   └── retry-policy.ts
│   ├── heartbeat/
│   │   └── scheduler.ts
│   ├── integrations/
│   │   ├── ai/
│   │   │   ├── client.ts
│   │   │   └── google-client.ts
│   │   └── whatsapp/
│   │       ├── baileys-client.ts
│   │       ├── baileys-parser.ts
│   │       └── client.ts
│   ├── prompts/
│   │   └── context-builder.ts
│   ├── storage/
│   │   ├── heartbeat-store.ts
│   │   ├── session-store.ts
│   │   ├── sqlite-store.ts
│   │   └── vector-store.ts
│   ├── tools/
│   │   ├── errors.ts
│   │   └── workspace-guard.ts
│   ├── types/
│   │   └── chat.ts
│   └── index.ts
├── tests/
│   ├── contract/
│   │   └── baileys-parser.test.ts
│   ├── helpers/
│   │   └── temp-dir.ts
│   ├── integration/
│   │   └── gateway.test.ts
│   ├── live/
│   │   └── google-live.test.ts
│   └── unit/
│       ├── baileys-client.test.ts
│       ├── config-loader.test.ts
│       ├── context-builder.test.ts
│       ├── google-client.test.ts
│       ├── handlers.test.ts
│       ├── heartbeat-scheduler.test.ts
│       ├── heartbeat-store.test.ts
│       ├── logger.test.ts
│       ├── retry-policy.test.ts
│       ├── router.test.ts
│       ├── session-store.test.ts
│       ├── sqlite-store.test.ts
│       ├── vector-store.test.ts
│       └── workspace-guard.test.ts
├── workspace/
│   ├── Memory/
│   │   └── .gitkeep
│   ├── AGENTS.md
│   ├── HEARTBEAT.md
│   ├── SOUL.md
│   ├── TOOLS.md
│   └── USER.md
├── AGENTS.md
├── Dockerfile
├── README.md
├── config.json
├── docker-compose.yml
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── vitest.live.config.ts
```

## 3. File-Level Summary

### Root and Infra

- `package.json`: scripts for dev, build, start, typecheck, and test layers.
- `config.json`: runtime provider, WhatsApp, command, heartbeat, storage, logging, and hot-reload settings.
- `Dockerfile`: single-stage Node 22 Alpine build that installs dependencies and runs `npm start`.
- `docker-compose.yml`: single `gateway` service with UTC timezone and mounted runtime directories.
- `vitest.config.ts`: main test runner config with `70/70` coverage thresholds.
- `vitest.live.config.ts`: live smoke runner config.

### Bootstrap and Core

- `src/index.ts`: loads config, creates logger/clients/stores, starts gateway, enables config watch, starts heartbeat timer.
- `src/core/gateway.ts`: central coordinator for command handling, session lookup, message persistence, context assembly, AI retry flow, and WhatsApp replies.
- `src/core/retry-policy.ts`: builds the current retry plan from internal defaults or injected test overrides.
- `src/core/logger.ts`: session-scoped file logger with optional console mirroring.

### Commands

- `src/commands/router.ts`: recognizes slash commands only when the text starts with `/`.
- `src/commands/handlers.ts`: pure string formatters for `/status`, `/ping`, and `/new`.

### Config

- `src/config/types.ts`: TypeScript interfaces and Zod schema for runtime config.
- `src/config/loader.ts`: reads config and watches `config.json` for changes.

### AI Integration

- `src/integrations/ai/client.ts`: provider contract.
- `src/integrations/ai/google-client.ts`: Google Generative AI implementation that converts chat messages into a single text prompt.

### WhatsApp Integration

- `src/integrations/whatsapp/client.ts`: transport contract.
- `src/integrations/whatsapp/baileys-parser.ts`: text extraction helpers for Baileys message payloads.
- `src/integrations/whatsapp/baileys-client.ts`: QR auth, DM filtering, deduplication, mark-as-read, presence updates, sendText, and reconnect behavior.

### Prompt Context

- `src/prompts/context-builder.ts`: loads `AGENTS.md`, `SOUL.md`, `TOOLS.md`, and `USER.md` for normal messages; also exposes a heartbeat helper that appends `HEARTBEAT.md`.

### Storage

- `src/storage/session-store.ts`: builds per-chat session paths, appends markdown message blocks, reads markdown history, and moves finished sessions to memory files.
- `src/storage/sqlite-store.ts`: creates the SQLite schema, stores active session paths, and persists full message rows.
- `src/storage/heartbeat-store.ts`: helper for heartbeat markdown output paths and append writes. Present but not used by the runtime.
- `src/storage/vector-store.ts`: placeholder enabled/disabled wrapper only.

### Tools and Helpers

- `src/tools/errors.ts`: small error helpers used by config/session logic.
- `src/tools/workspace-guard.ts`: path boundary helper. Present, but not wired into runtime behavior.
- `src/types/chat.ts`: chat domain types for message flow.

### Tests

- `tests/unit/**`: focused unit coverage for core utilities and adapters.
- `tests/integration/gateway.test.ts`: end-to-end gateway behavior with fake AI and WhatsApp clients.
- `tests/contract/baileys-parser.test.ts`: text extraction coverage for Baileys payload shapes.
- `tests/live/google-live.test.ts`: live Google connectivity smoke test.

## 4. Verified Gaps

- `npm run typecheck` passes.
- `npm test` passes.
- Heartbeat runtime behavior is only logging.
- Coverage thresholds are `70/70`, not `80/80`.
- There is no active search API, compaction flow, vector retrieval, workspace tool runtime, checkpointing, or web integration.
