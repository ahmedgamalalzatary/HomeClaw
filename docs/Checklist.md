# Claw Gateway Checklist

Verified against the current codebase on 2026-03-23.

Only behaviors that exist in the current implementation are checked.

## Verification Snapshot

- [x] `npm run typecheck` passes.
- [x] `npm test` is fully green.

## Phase 1: Foundation

- [x] Node 22 + TypeScript project.
- [x] Dev/prod scripts (`dev`, `build`, `start`, `typecheck`).
- [x] Runtime paths are configured and created lazily as needed (`data`, `logs`, `sessions`, `memory`, `db`, `workspace`).
- [x] Dockerfile + docker-compose baseline.
- [x] UTC runtime env in compose.

## Phase 2: Base Runtime Contract

- [x] Worker process shape (no HTTP admin server).
- [x] Single-container runtime model.
- [x] No OpenAI-compatible API surface in MVP code.
- [x] No rate limit behavior implemented.
- [x] No allowlist behavior implemented.

## Phase 3: WhatsApp Transport (Baileys)

- [x] Baileys integration exists.
- [x] Multi-file auth state at `data/whatsapp`.
- [x] QR auth in terminal.
- [x] DM-only inbound filtering.
- [x] Text extraction for root, extended, ephemeral, and view-once text messages.
- [x] Non-text inbound messages are ignored.
- [x] Inbound messages are marked as read before processing when possible.
- [x] Presence updates are sent during message handling and before reply send.
- [x] Duplicate inbound WhatsApp message IDs are deduplicated.
- [x] Reconnect loop exists with exponential backoff, jitter, and a ~30s max delay.

## Phase 4: Google Provider Wiring

- [x] Google provider client integrated.
- [x] API key read from `config.json`.
- [x] Primary model read from config.
- [x] Fallback models read from config.
- [x] Generation params (`temperature`, `topP`, `maxOutputTokens`) read from config.
- [x] No explicit AI timeout policy in code.

## Phase 5: Core MVP Message Loop

- [x] Receive WhatsApp message in gateway.
- [x] Persist inbound user message to session markdown before AI call.
- [x] Persist inbound user message to SQLite before AI call.
- [x] Load base workspace context from `AGENTS.md`, `SOUL.md`, `TOOLS.md`, and `USER.md`.
- [x] Send prompt to AI model.
- [x] Receive model response.
- [x] Minimal response normalization (`trim`, newline normalization, fallback to `empty response`).
- [x] Persist assistant message before WhatsApp send.
- [x] Send response back to WhatsApp.
- [x] Send provider error text when AI flow fails.
- [x] Keep process alive after per-message AI failure.

## Phase 6: Command Routing

- [x] Slash command parsed only when text starts with `/`.
- [x] Slash commands are case-sensitive.
- [x] Message containing slash later is treated as normal message.
- [x] Unknown slash commands are ignored.
- [x] Disabled slash commands are ignored based on `config.commands.enabled`.
- [x] `/status` command implemented.
- [x] `/status` output includes uptime, current model, fallback count, DB status, WhatsApp status, and active session path.
- [x] `/ping` command implemented with no AI call.
- [x] `/new` command implemented.
- [ ] `/ping` reports boot-time delta, not strict per-request latency.

## Phase 7: Session and Memory Files

- [x] Session files use markdown.
- [x] Session path format `sessions/<chat-id>/YYYY-MM-DD/HH-mm-ss.md` (UTC, chat id sanitized for filesystem use).
- [x] User messages appended to active session file.
- [x] Assistant messages appended to active session file.
- [x] `/new` moves the current session to `memory/<id>.md`.
- [x] Memory file id uses UTC compact timestamp format `YYYYMMDDHHmmss`.
- [x] Missing current session file during `/new` is treated as a no-op.
- [ ] Session moved to memory on compaction trigger.
- [ ] `sessions/` and `memory/` enforced as read-only for AI/tooling operations.

## Phase 8: Persistence and Source-of-Truth Rules

- [x] Inbound user message write happens before AI call.
- [x] Inbound write order in gateway code is session then SQLite.
- [x] Real SQLite persistence implemented.
- [x] One DB row per message with role (`user`/`assistant`/`system`).
- [x] SQLite stores full message text and session path for each row.
- [x] Assistant message persisted even if WhatsApp send fails.
- [x] Active session path is restored from SQLite on demand.
- [x] Runtime history for AI context is loaded from session markdown.
- [ ] SQLite is not yet used for search/history queries.
- [ ] Source preference enforcement (session-first, SQLite for search/history) is not fully implemented.
- [ ] Full state restore from DB + session contents on restart is not implemented.

## Phase 9: Retry and Fallback Policy

- [x] Retry scope is AI calls only.
- [x] Internal default max attempts is `3`.
- [x] Internal default retry delays are `5s`, `10s`, `10s`.
- [x] Current model chain is `primary -> fallback1 -> fallback2`.
- [x] No explicit AI timeout failure cutoff.
- [ ] Retry count is not read from `config.json`.
- [ ] Retry delays are not read from `config.json`.
- [ ] Exact required order (same-model retry first, then fallback1, then fallback2) is not implemented.

## Phase 10: Logging Contract

- [x] File logging.
- [x] Console logging.
- [x] Per-session log file split.
- [x] Gateway and transport operational logs exist.
- [x] Logs are not posted into WhatsApp chat flow.
- [ ] Full all-module operational logging coverage.
- [ ] API key redaction in log pipeline.

## Phase 11: Config and Hot Reload

- [x] `config.json` is runtime config source.
- [x] Zod schema validation exists for config loading.
- [x] Hot reload watcher exists for `config.json`.
- [x] Gateway config object updates at runtime.
- [ ] Runtime-wide module reconfiguration after reload.
- [ ] Explicit defaults precedence contract implementation.

## Phase 12: Prompt Context Assembly

- [x] `/workspace/AGENTS.md` exists.
- [x] `/workspace/SOUL.md` exists.
- [x] `/workspace/TOOLS.md` exists.
- [x] `/workspace/USER.md` exists.
- [x] `/workspace/HEARTBEAT.md` exists.
- [x] Core context files injected in normal AI calls.
- [x] Prompt order for normal messages is `AGENTS -> SOUL -> TOOLS -> USER -> session history -> current message`.
- [x] Missing workspace files are skipped silently.
- [x] System prompt behavior is sourced from `AGENTS.md` content.
- [x] `buildHeartbeatContext()` helper exists and appends `HEARTBEAT.md` after base context.
- [ ] Heartbeat context assembly is not wired into the runtime heartbeat flow.

## Phase 13: Heartbeat Loop

- [x] Scheduler module exists.
- [x] Interval is config-driven.
- [x] Scheduler starts when heartbeat is enabled.
- [x] Current runtime heartbeat behavior is only a log entry (`Heartbeat tick.`).
- [x] Heartbeat markdown storage helper exists.
- [ ] Heartbeat runs as separate AI no-history chat.
- [ ] Heartbeat context includes `HEARTBEAT + base workspace context`.
- [ ] `heartbeat ok` suppression rule.
- [ ] Non-`heartbeat ok` output sent to WhatsApp.
- [ ] Heartbeat output stored at `sessions/heartbeat/YYYY-MM-DD/HH-mm.md` by the runtime.

## Phase 14: Compaction and Long Context

- [ ] Token counting implemented.
- [ ] Compaction trigger at 64k tokens.
- [ ] Compress old history while keeping last user + assistant raw turns.
- [ ] Persist compaction summary to SQLite.
- [ ] Persist compaction summary to markdown history message.

## Phase 15: Vector Memory

- [x] `sqlite-vec` dependency present.
- [x] Vector config scaffold in `config.json`.
- [x] `VectorStore` scaffold exists with enabled-state reporting.
- [ ] Real vector index over chat messages.
- [ ] Retrieval path implementation.
- [ ] Retrieval gated by explicit bot/model trigger.
- [ ] Memory index file maintained as folder/file memory index with 1-2 line per-file summaries.

## Phase 16: Workspace Boundary for Tooling

- [x] Workspace guard helper exists.
- [ ] Enforcement wired through tool/file/exec runtime flows.
- [ ] Hard runtime rejection for out-of-workspace operations in tool stack.
- [ ] Skill/tool execution flow that updates `USER.md` via model actions.
- [ ] Tool surface includes `exec` and `spawn` runtime integration.
- [ ] Autonomous-task todo enforcement (`workspace/todo/todo.md` create + step updates).
- [ ] `CORE:LOCK` / `AI:OPEN` write enforcement does not exist in the runtime.

## Phase 17: Checkpointing

- [ ] 10-minute workspace checkpoint scheduler implemented.
- [ ] Immutable checkpoint artifact behavior implemented.
- [ ] Checkpoints are gateway-managed only (AI/user cannot create/update/delete).

## Phase 18: Web Access Integration

- [ ] `scrapling` integration implemented.
- [ ] Web-fetch MCP server integration implemented.
- [ ] Web-fetch context loaded only on explicit model request.

## Phase 19: Post-MVP Extensions

- [ ] OAuth auth.
- [ ] Allowlist controls.
- [ ] Additional providers/models.
- [ ] Group chat support.
- [ ] Media input support.

## Phase 20: Testing and Delivery Quality

- [x] `vitest` used as the only test framework.
- [x] Unit test suite exists.
- [x] Integration test suite exists.
- [x] Adapter contract test suite exists.
- [x] Live smoke test suite exists.
- [x] Test helper utilities exist.
- [x] `vitest.config.ts` exists.
- [x] `vitest.live.config.ts` exists.
- [x] Test scripts exist: `test`, `test:unit`, `test:integration`, `test:contract`, `test:coverage`, `test:live`.
- [x] CI check script exists: `ci:check`.
- [x] CI workflow exists for core checks.
- [x] Live smoke workflow exists.
- [x] Deploy workflow exists.
- [x] `npm run typecheck` currently passes.
- [ ] Coverage gate enforced at lines `>=80%` and branches `>=80%`.
- [ ] Current coverage gate in `vitest.config.ts` is lines `>=70%` and branches `>=70%`.
