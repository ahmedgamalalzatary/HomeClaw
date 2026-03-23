# Claw Gateway Phases

This phase map is aligned to the current codebase on 2026-03-23.
Use `docs/Checklist.md` for line-by-line status.

## Phase 1: Foundation

Status: complete

- Node 22 + TypeScript project is in place.
- Dockerfile and docker-compose exist.
- Config, workspace, logging, and storage paths are defined.

## Phase 2: Base Runtime Contract

Status: complete

- The app runs as a worker process.
- There is no HTTP admin surface.
- Single-user, no-rate-limit, no-allowlist behavior is still the current contract.

## Phase 3: WhatsApp Transport (Baileys)

Status: complete

- Baileys QR auth and multi-file auth state are implemented.
- Inbound handling is DM-only and text-only.
- Mark-as-read, presence updates, deduplication, and reconnect logic are implemented.

## Phase 4: Google Provider Wiring

Status: complete

- Google is the only live AI provider.
- Model selection and generation params come from `config.json`.
- Fallback models are supported.

## Phase 5: Core MVP Message Loop

Status: complete

- Inbound user messages are persisted before the AI call.
- Base workspace context is loaded for normal AI calls.
- Assistant replies are normalized, persisted, and sent back to WhatsApp.

## Phase 6: Command Routing

Status: complete with minor behavior gap

- `/status`, `/ping`, and `/new` are implemented.
- Slash parsing behavior matches the current MVP rules.
- Remaining gap: `/ping` is boot-time delta, not true request latency.

## Phase 7: Session and Memory Files

Status: partially complete

- Markdown session files and memory rotation on `/new` are implemented.
- Memory files use UTC compact timestamp ids.
- Per-chat session-path isolation is implemented with sanitized chat-id path segments.

## Phase 8: Persistence and Source-of-Truth Rules

Status: partially complete

- SQLite is live and stores message rows plus active session paths.
- The gateway reads prior conversation history from markdown session files.
- Search/history queries, fuller restore behavior, and a stronger source-of-truth contract are still missing.

## Phase 9: Retry and Fallback Policy

Status: partially complete

- AI-only retry exists with internal defaults.
- Current runtime order is `primary -> fallback1 -> fallback2`.
- Config-driven retry tuning and same-model retry-first behavior are not built.

## Phase 10: Logging Contract

Status: mostly complete

- File and console logging work.
- Session-scoped log files work.
- Secret redaction and broader logging coverage are still missing.

## Phase 11: Config and Hot Reload

Status: partially complete

- `config.json` is validated and watched for changes.
- The gateway replaces its in-memory config at runtime.
- Existing clients and stores are not rebuilt when config changes.

## Phase 12: Prompt Context Assembly

Status: partially complete

- Normal message context loading from workspace files is implemented.
- `HEARTBEAT.md` support exists only in a helper.
- Heartbeat context is not used by the runtime yet.

## Phase 13: Heartbeat Loop

Status: scaffold only

- The scheduler runs on a configured interval.
- The current task is only `Heartbeat tick.` logging.
- AI heartbeat generation, WhatsApp delivery, and heartbeat markdown persistence are not wired.

## Phase 14: Compaction and Long Context Control

Status: not started

- No token counting.
- No compaction trigger.
- No summary persistence.

## Phase 15: Vector Memory

Status: scaffold only

- `sqlite-vec` dependency and config are present.
- No real embeddings, index, or retrieval path exists.

## Phase 16: Workspace Boundary for Tooling

Status: helper only

- Path guard helper exists.
- There is no gateway tool runtime yet, so workspace enforcement is not active.

## Phase 17: Checkpointing

Status: not started

- No scheduler.
- No immutable checkpoint artifacts.

## Phase 18: Web Access Integration

Status: not started

- No `scrapling`.
- No web-fetch MCP integration.

## Phase 19: Post-MVP Extensions

Status: future

- OAuth, allowlists, group support, media support, and extra providers are still future work.

## Phase 20: Testing and Delivery Quality

Status: mostly complete

- Vitest unit/integration/contract/live structure is in place.
- CI, deploy, and live smoke workflows are present.
- `npm run typecheck` passes.
- `npm test` passes.
- Current gap:
- coverage threshold is `70/70`, not `80/80`
