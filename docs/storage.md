# Storage

SQLite (via `bun:sqlite` + Drizzle ORM) is the **execution store**, not an analytics store. The server auto-creates tables on startup.

**Local only — not in git:** the database lives at `RELAY_DB_PATH` (default `./data/relay.db`). The `data/` directory and all `*.db` / WAL files are listed in `.gitignore` and are never pushed to GitHub. Each developer (and each machine) gets its own event log.

| Table | Purpose |
|-------|---------|
| `events` | Append-only source of truth |
| `sessions` | Session metadata |
| `messages` | Projection (written after `message.completed`) |
| `tool_calls` | Projection (from tool events) |
| `snapshots` | Checkpoint payloads |

Messages are never written directly by the loop or tools — only projected by the runtime after `message.completed`.

**Async persistence (`EventSink` seam):** The runtime fans out events to live observers before writing to storage. `createProjectorEventSink()` in `@relay/storage` is the local adapter — `write()` returns immediately; events persist serially on a background chain. The loop calls `flush()` when a session finishes so durability is guaranteed before the session goes idle.

See also: [North Star — seams](./north-star.md#what-is-a-seam), [Event Sourcing](./event-sourcing.md)
