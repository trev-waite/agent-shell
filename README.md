# Relay (Agent Shell)

A **local-first execution runtime** for AI agents with a terminal-native UI.

Relay is an event-sourced execution runtime — not a chatbot framework, cloud orchestration platform, or web application. Everything runs locally. The event log is the system of record; the terminal UI is a disposable projection.

## What Relay Is

```
┌─────────────────────────────────────────────────────────────┐
│                     Process 2: Terminal                      │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Ink 7 UI (apps/terminal)                           │    │
│  │  ChatPanel · TracePanel · MetricsPanel              │    │
│  └──────────────────────┬──────────────────────────────┘    │
│                         │ @relay/sdk (SSE)                   │
└─────────────────────────┼───────────────────────────────────┘
                          │ localhost only
┌─────────────────────────┼───────────────────────────────────┐
│                         ▼                                      │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Fastify Server (apps/server)                       │    │
│  └──────────────────────┬──────────────────────────────┘    │
│                         │                                      │
│  ┌──────────┐  ┌────────▼────────┐  ┌──────────────────┐     │
│  │ providers│  │ runtime         │  │ storage          │     │
│  │ (Gemini) │  │ ReActLoop       │  │ SQLite + Drizzle │     │
│  └──────────┘  └─────────────────┘  └──────────────────┘     │
│                     Process 1: Runtime Server                  │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

**Prerequisites:** [Bun](https://bun.sh) 1.3+, Node 24.16+

```bash
# Install dependencies
bun install

# Configure environment (must live at monorepo root)
cp .env.example .env
# Edit .env and set GEMINI_API_KEY

# Terminal 1 — start runtime server
bun run dev:server

# Terminal 2 — start Ink UI
bun run dev:terminal
```

Type a prompt and press Enter. Press Esc or Ctrl+C to exit the UI — the runtime server keeps running.

### Replay a previous session

```bash
bun run apps/terminal/src/index.tsx --session <session-id>
```

## Monorepo Structure

```
apps/
  terminal/      ← Ink 7 CLI UI (depends only on @relay/sdk)
  server/        ← Fastify runtime server

packages/
  runtime/       ← execution engine (no HTTP)
  providers/     ← Gemini LLM adapter
  storage/       ← bun:sqlite event store + Drizzle schema
  tools/         ← file.read, shell.exec implementations
  tool-registry/ ← tool abstraction layer
  sdk/           ← runtime client (SSE transport)
  types/         ← shared event + system types
```

Internal packages use the workspace protocol: `"@relay/sdk": "workspace:*"`

Turborepo manages build ordering, dev parallelization, and typechecking only — not distributed execution.

## Two-Process Model

| Process | Role | Survives UI exit? |
|---------|------|-------------------|
| Runtime server | Source of truth, executes agent loop, persists events | Yes |
| Ink terminal | Stateless event subscriber, renders projections | Disposable |

Multiple terminals can attach to the same runtime simultaneously. Restarting the UI reconnects via SSE with `Last-Event-ID` support.

## Event Sourcing

Every state change is an **append-only, immutable event**:

| Field | Description |
|-------|-------------|
| `id` | ULID (sortable, unique) |
| `sessionId` | Execution container |
| `type` | Event kind |
| `timestamp` | Epoch milliseconds |
| `payload` | Typed event data |

**Event types:** `message.started`, `token.streamed`, `tool.started`, `tool.completed`, `checkpoint.saved`, `cost.updated`, `message.completed`, `error`

Session status (`idle`, `running`, `paused`, `completed`, `failed`, `cancelled`) is **derived from events only** — never stored as authoritative state.

### Replay vs Rerun

| | Replay | Rerun |
|---|--------|-------|
| **What** | Stream historical events from SQLite | Re-execute from a checkpoint |
| **Re-executes LLM?** | No | Yes (future) |
| **MVP status** | Implemented | Defined, not implemented |
| **Use case** | UI reconnect, audit, crash recovery view | Resume work after failure |

Replay reconstructs state **only from events**. No hidden state. Kill the server, restart it, replay a session — the transcript matches exactly.

## SQLite as Execution Store

SQLite (via `bun:sqlite` + Drizzle ORM) is the **execution store**, not an analytics store.

| Table | Purpose |
|-------|---------|
| `events` | Append-only source of truth |
| `sessions` | Session metadata |
| `messages` | Projection (written after `message.completed`) |
| `tool_calls` | Projection (from tool events) |
| `snapshots` | Checkpoint payloads |

Messages are never written directly by the loop or tools — only projected by the runtime after `message.completed`.

## Runtime API

```typescript
runtime.execute({ prompt })   // Start new session
runtime.replay({ sessionId }) // Stream historical events (read-only)
runtime.cancel({ sessionId }) // Abort in-flight execution
runtime.subscribe({ sessionId }) // Live event fanout
runtime.rerun()               // Throws NotImplementedError (future)
```

## SDK

```typescript
import { createClient } from "@relay/sdk";

const client = createClient({ baseUrl: "http://localhost:4310" });

const { sessionId } = await client.send({ prompt: "List files here" });

client.subscribe({
  sessionId,
  onEvent: (event) => console.log(event.type),
});
```

## Security

- API keys and secrets are never exposed to the LLM
- Tool inputs/outputs are sanitized before storage and before LLM context
- Events are safe to replay in any environment
- `shell.exec` is allowlisted: `pwd`, `ls`, `cat` only

## Performance Philosophy

Relay intentionally uses **TypeScript + Bun** for the MVP runtime.

**Why this is acceptable:**

1. **LLM latency dominates** — A typical Gemini round-trip is 500ms–5s. Runtime overhead (event persistence, SSE fanout, projection) is microseconds to low milliseconds. Optimizing the runtime before measuring LLM cost is premature.

2. **Architecture clarity first** — Event sourcing, replay correctness, and provider abstraction matter more than raw throughput at MVP scale.

3. **Event sourcing is the core abstraction** — The append-only event log decouples execution from UI, storage, and transport. This boundary is what enables future native rewrites (Rust/Go) if event throughput becomes a bottleneck — without changing the external contract.

4. **Portability** — TypeScript runs on Bun and Node 24. The runtime package has no HTTP dependency. Storage, providers, and loops are independently replaceable.

5. **Measure before refactoring** — Do not prematurely optimize. Profile when event throughput exceeds local SQLite write capacity or SSE fanout becomes measurable.

## Development

```bash
bun run build       # Build all packages
bun run typecheck   # Type-check all packages
bun run dev         # Start server + terminal in parallel
bun run db:migrate  # Run Drizzle migrations
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GEMINI_API_KEY` | — | Google Gemini API key (required) |
| `GEMINI_MODEL` | `gemini-3.1-flash-lite` | Gemini model ID |
| `RELAY_PORT` | `4310` | Runtime server port |
| `RELAY_DB_PATH` | `./data/relay.db` | SQLite database path |
| `RELAY_URL` | `http://localhost:4310` | SDK connection URL |

`.env` must be at the **monorepo root** (`agent-shell/.env`), not inside `apps/server/`. When using `bun run dev:server`, Turbo runs from `apps/server` — the dev scripts load `../../.env` automatically.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `GEMINI_API_KEY environment variable is required` | Ensure `.env` is at repo root with `GEMINI_API_KEY=...` (no spaces around `=`). Restart the server after editing. |
| Port already in use | Change `RELAY_PORT` in `.env` and set `RELAY_URL` to match |
| Can't type in terminal UI | Use `bun run dev:terminal` (not via turbo) — Ink needs a direct TTY for keyboard input |
| Stream shows **standby** | Normal before your first prompt |
| Stream shows **disconnected** | Start runtime with `bun run dev:server` first; Metrics panel shows **Server: online** when ready |

## License

MIT
