# Claw Gateway Features

This file reflects the verified current implementation as of 2026-03-23.

## Implemented Now

### Core Product

- Personal WhatsApp AI gateway running as a worker process.
- WhatsApp transport via Baileys.
- Google Generative AI provider only.
- DM-only scope.
- Text-only reply flow.
- Single-user oriented design.
- No HTTP admin server.
- No allowlist controls.
- No rate limits.

### Provider and Model Wiring

- API key, primary model, fallback models, and generation params are read from `config.json`.
- The Google client turns the full chat input into a single text prompt with `ROLE:` headers.
- Empty model output is rejected as an error.
- There is no explicit AI timeout policy.

### Inbound WhatsApp Handling

- QR auth is supported through Baileys multi-file auth state in `data/whatsapp`.
- Only direct messages are processed.
- Non-text messages are ignored.
- Text extraction supports:
- root `conversation`
- `extendedTextMessage.text`
- nested `ephemeralMessage.message`
- nested `viewOnceMessageV2.message`
- Incoming DMs are marked as read when possible.
- Presence updates are sent while processing a message and before sending a reply.
- Duplicate WhatsApp message IDs are deduplicated inside `BaileysClient`.
- Reconnect logic retries indefinitely with exponential backoff, jitter, and a max delay of about 30 seconds.

### Command System

- A slash command is recognized only when the first character is `/`.
- Commands are case-sensitive.
- Unknown commands are ignored.
- Commands can be disabled by removing them from `config.commands.enabled`.
- Implemented commands:
- `/status`
- `/ping`
- `/new`
- `/status` returns uptime, current model, fallback count, DB status, WhatsApp status, and the active session path.
- `/ping` returns `pong <boot_delta_ms> <utc_iso_timestamp>`.
- `/new` moves the current session file to memory, allocates a new active session path, and replies with `new session started`.

### Session, Memory, and SQLite Persistence

- Session transcripts are stored as markdown files under `sessions/<sanitized-chat-id>/YYYY-MM-DD/HH-mm-ss.md`.
- Session message format is:
- `## role (timestamp)`
- indented message body
- Session history for AI context is read from the markdown file, not from SQLite.
- SQLite stores:
- active session path per chat in `chat_sessions`
- full message text plus metadata in `chat_messages`
- Inbound user messages are persisted to session markdown first, then SQLite, before the AI call.
- Assistant replies are persisted to session markdown and SQLite before `sendText()`.
- `/new` moves the current session file to `memory/<YYYYMMDDHHmmss>.md`.
- On restart, the gateway can recover the active session path for a chat from SQLite.

### Prompt Context

- Normal AI calls load workspace files in this order:
- `AGENTS.md`
- `SOUL.md`
- `TOOLS.md`
- `USER.md`
- Missing workspace files are skipped silently.
- The final AI input order is:
- base workspace context
- prior session history from markdown
- current user message
- `buildHeartbeatContext()` exists and appends `HEARTBEAT.md` after the base workspace files, but the runtime does not currently use it.

### Retry, Logging, and Config Reload

- Retry policy is internal, not config-driven.
- Current default retry behavior:
- attempts: `3`
- delays: `5s`, `10s`, `10s`
- model order: `primary -> fallback1 -> fallback2`
- Final AI failure returns the last provider error message when the thrown value is an `Error`.
- Non-`Error` failures fall back to `AI call failed.`.
- Logging writes to per-session log files and optionally to console.
- Config loading is validated with Zod.
- `config.json` file changes are watched at runtime.
- Hot reload currently updates only the gateway's in-memory config object.

### Heartbeat and Other Scaffolds

- `HeartbeatScheduler` exists and starts when heartbeat is enabled.
- Current heartbeat behavior only logs `Heartbeat tick.`.
- `HeartbeatStore` exists and can build/write `sessions/heartbeat/YYYY-MM-DD/HH-mm.md` files, but it is not wired into the runtime flow.
- `VectorStore` exists only as an enabled/disabled scaffold.
- `assertWithinWorkspace()` exists as a helper, but it is not wired into any tool runtime because no tool runtime exists yet.

### Testing and Delivery

- Vitest is the only test framework in use.
- Test suites exist for unit, integration, contract, and live smoke coverage.
- GitHub Actions workflows exist for CI, deploy, and nightly live smoke.
- Current coverage thresholds in `vitest.config.ts` are `70%` lines and `70%` branches.

## Known Gaps and Current Limitations

- `/ping` reports time since gateway boot, not request latency.
- Retry count and retry delays are not configurable from `config.json`.
- The retry order does not do a same-model retry before moving to fallbacks.
- SQLite is not acting as a search layer yet. It stores message rows, but there are no search/history query APIs.
- Heartbeat does not call the AI, does not build heartbeat context at runtime, does not write heartbeat markdown output, and does not send WhatsApp notifications.
- Workspace boundary enforcement is not active in runtime flows.
- There is no `exec` or `spawn` tool surface inside the gateway.
- There is no compaction, vector retrieval, checkpointing, or web access integration yet.
- Logging does not redact secrets.
- Docker runtime does not expose a file-based health signal yet.

## Planned but Not Built

- Same-model retry before fallback models.
- Compaction at long-context thresholds.
- Vector retrieval over chat history.
- Workspace write-boundary enforcement and locked file sections.
- Autonomous task todo enforcement.
- Periodic immutable workspace checkpoints.
- Web access integration (`scrapling`, web-fetch MCP).
- Allowlist controls, OAuth, group support, and media support.
