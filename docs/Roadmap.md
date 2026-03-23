# Home Claw Gateway Roadmap

This file tracks discussed and upcoming changes that are not fully built yet.
It is intentionally future-facing.

The remaining work is organized into three horizons:

- **Near-Term Priorities** — gaps from the current MVP that directly affect reliability, observability, or core behavior.
- **Mid-Term Features** — new runtime capabilities that require careful design before they are built.
- **Later-Stage Platform Work** — infrastructure additions that depend on mid-term features being in place.
- **Post-MVP Extensions** — scope expansions that change the product contract.

Current implementation status lives in:

- `docs/Checklist.md` — line-by-line verification of what is and is not built.
- `docs/Features.md` — structured feature summary of the current implementation.
- `docs/phases.md` — phase map with completion status for each phase.
- `docs/summarization.md` — architecture overview, directory layout, and file-level summary.

## Near-Term Priorities

### Command System

- Fix `/ping` to report true per-request latency instead of boot-time delta.

### Retry and Failure Handling

- Change the retry order to:
  - same-model retry first
  - then fallback model 1
  - then fallback model 2
- Make retry attempts and delay sequence configurable from `config.json`.
- Keep the prompt/context identical across retry attempts.
- Improve final user-facing AI failure messages with richer model/error detail.

### Heartbeat Execution

- Turn heartbeat from a timer-only log event into a real AI run.
- Build heartbeat context from:
  - `AGENTS.md`
  - `SOUL.md`
  - `TOOLS.md`
  - `USER.md`
  - `HEARTBEAT.md`
- Run heartbeat as a separate no-history chat.
- Suppress exact normalized `heartbeat ok`.
- Send any other non-empty heartbeat output to WhatsApp.
- Persist heartbeat output to `sessions/heartbeat/YYYY-MM-DD/HH-mm.md`.

### Persistence and Restore

- Strengthen the source-of-truth contract:
  - markdown session files for live conversation context
  - SQLite for search/history/index lookups
- Add explicit search/history query paths on top of SQLite.
- Improve startup restore so the gateway can recover more complete conversation state after restart.

### Config and Hot Reload

- Broaden runtime reconfiguration so hot reload can rebuild more than the in-memory gateway config.
- Runtime-wide module reconfiguration after config changes (stores, clients, etc.).
- Establish explicit defaults precedence contract.

### Logging Coverage

- Improve operational logging coverage across all modules.
- Add API key/secret redaction in log pipeline.

### Testing Quality Gate

- Upgrade coverage thresholds `80/80` in `vitest.config.ts`.

## Mid-Term Features

Mid-term features introduce new runtime capabilities that depend on the near-term reliability work being in place. These require design before building.

### Session and Memory

- Enforce `sessions/` and `memory/` as read-only for AI/tooling operations.
- Move session to memory on compaction trigger (not just `/new`).

### Long Context and Compaction

- Add token counting for the full chat context.
- Trigger compaction around `64k` tokens.
- Compress older history while keeping the latest raw user and assistant turns.
- Persist the compaction summary to both SQLite and markdown history.

### Vector Memory

- Move beyond the current scaffold into a real `sqlite-vec` retrieval layer.
- Index chat messages for semantic recall.
- Keep retrieval disabled by default.
- Only activate retrieval on explicit bot/model trigger.
- Maintain a lightweight manual memory index file with 1-2 line summaries per memory file.

### Workspace Tooling Boundary

- Enforce workspace-only file access at runtime.
- Add hard rejection for writes or file operations outside `/workspace`.
- Wire workspace guard through tool/file/exec runtime flows.
- Introduce skill/tool execution flow that updates `USER.md` via model actions.
- Introduce gateway-managed tool execution surfaces such as `exec` and `spawn`.
- Enforce autonomous-task todo tracking via `workspace/todo/todo.md`.
- Add locked-section rules such as `CORE:LOCK` / `AI:OPEN` for file write protection.

## Later-Stage Platform Work

These items depend on mid-term features being complete. They represent deeper infrastructure changes.

### Checkpointing

- Add a gateway-managed scheduler that snapshots `workspace/` every `10min`.
- Keep checkpoint artifacts immutable and gateway-owned.
- Ensure checkpoints are gateway-managed only (AI/user cannot create/update/delete).

### Web Access

- Add advanced web access support through Python `scrapling`.
- Add a web-fetch MCP server.
- Keep web-fetch context loaded only when the model explicitly requests it.

### Runtime and Infra

- Add a file-based health signal for Docker health checks.

## Post-MVP Extensions

- OAuth authentication.
- Allowlist controls editable in config.
- Additional AI providers and model families.
- Group chat support.
- Media input support.

## Notes

- This roadmap is a planning document, not a promise of implementation order.
- If a future feature gets built, move its factual current-state description into the other docs and keep this file focused on remaining work.
