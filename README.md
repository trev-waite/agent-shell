# Relay (Agent Shell)

A **local-first execution runtime** for AI agents with a terminal-native UI.

Relay is an event-sourced execution runtime — not a chatbot framework, cloud orchestration platform, or web application. Everything runs locally. The event log is the system of record; the terminal UI is a disposable projection.

## Contents

- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Relay SDK](#relay-sdk-relaysdk)
- [Event Sourcing](#event-sourcing)
- [Storage](#storage)
- [Runtime API](#runtime-api)
- [Monorepo](#monorepo)
- [Security](#security)
- [Development](#development)
- [Troubleshooting](#troubleshooting)
- [Performance Philosophy](#performance-philosophy)

## Quick Start

**Prerequisites:** [Bun](https://bun.sh) 1.3+, Node 24.16+

```bash
# Install dependencies
bun install

# Configure environment (must live at monorepo root)
cp .env.example .env
# Edit .env and set GEMINI_API_KEY
```

Run the runtime and UI in **two terminals** (recommended):

```bash
# Terminal 1 — runtime server (loads .env, watches for changes)
bun run dev:server

# Terminal 2 — Ink UI (needs a real TTY for keyboard input)
bun run dev:terminal
```

| Script | What it runs |
|--------|----------------|
| `bun run dev:server` | Fastify runtime at `http://127.0.0.1:4310` |
| `bun run dev:terminal` | Ink chat UI (connects via `@relay/sdk`) |
| `bun run dev` | Both via Turborepo — terminal input may not work; prefer two terminals |

Type a prompt and press Enter. Press **Tab** or **Ctrl+O** to open the **model menu** — pick a Gemini model from the dropdown (OpenAI and Claude tabs are placeholders for future providers). While the agent works, a status line appears below your message in Chat. Press Esc or Ctrl+C to exit the UI — the runtime server keeps running.

### Terminal controls

| Key | Action |
|-----|--------|
| Enter | Send prompt |
| Tab / Ctrl+O | Open model menu |
| ↑↓ | Select model (menu open) |
| ←→ | Switch provider tab (menu open) |
| Esc | Close model menu, or exit when menu is closed |
| Ctrl+C | Exit terminal (server keeps running) |

### Replay a previous session

```bash
bun run apps/terminal/src/index.tsx --session <session-id>
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Process 2: Terminal                      │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Ink 7 UI (apps/terminal)                           │    │
│  │  ChatPanel · TracePanel · MetricsPanel · ModelSelector      │    │
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

### Two-process model

| Process | Role | Survives UI exit? |
|---------|------|-------------------|
| Runtime server | Source of truth, executes agent loop, persists events | Yes |
| Ink terminal | Stateless event subscriber, renders projections | Disposable |

Multiple terminals can attach to the same runtime simultaneously. Restarting the UI reconnects via SSE with `Last-Event-ID` support.

**Client vs server:** Anything that renders UI or tooling talks to the runtime through [`@relay/sdk`](#relay-sdk-relaysdk). The server owns execution, persistence, and secrets. Clients only project events.

## Relay SDK (`@relay/sdk`)

Relay's architecture hinges on a hard line between **execution** (server) and **projection** (anything that renders). `@relay/sdk` is that line — a small, dependency-light client that speaks HTTP + SSE to the runtime and nothing else.

The Ink terminal (`apps/terminal`) is the first consumer, but it is intentionally **not special**. It imports only `@relay/sdk` and `@relay/types` (via event payloads). It never touches `@relay/runtime`, `@relay/storage`, or provider code. Swap the terminal for a TUI written in Python, a browser dashboard, or a headless log tailer — as long as it uses the SDK, it gets the same typed event stream.

```
┌──────────────────┐     send()        POST /sessions
│  Your client     │ ─────────────────►  starts execution
│  (terminal,      │
│   script, web)   │     subscribe()   GET /sessions/:id/events  (SSE, live)
│                  │ ◄─────────────────  token.streamed, tool.*, cost.updated, …
│                  │
│                  │     replay()      GET /sessions/:id/replay   (SSE, read-only)
│                  │ ◄─────────────────  full history from SQLite
└──────────────────┘
         │
         └── createClient() — fetch + SSE parser, auto-reconnect, Last-Event-ID
```

### API surface

| Method | HTTP | Purpose |
|--------|------|---------|
| `send({ prompt, model? })` | `POST /sessions` | Start a new agent session; returns `{ sessionId }` |
| `listModels()` | `GET /models` | Provider registry + model lists (Gemini today) |
| `subscribe({ sessionId, onEvent, … })` | `GET /sessions/:id/events` | Live SSE stream — tokens, tools, costs, errors |
| `replay({ sessionId, onEvent, … })` | `GET /sessions/:id/replay` | Read-only replay of persisted events, then closes |

Every `onEvent` callback receives a typed `RelayEvent` from `@relay/types` — the same shape the runtime writes to SQLite. Clients **project** events into UI state; they never mutate the log.

`subscribe` tracks `Last-Event-ID` across reconnects and retries automatically. The server replays missed events on connect, so a client that attaches after execution has already started still receives the full transcript.

### Where we use it

**`apps/terminal`** — the reference client:

1. **New prompt** — `client.send()` returns a `sessionId`, then `client.subscribe()` opens the live stream. Events flow into a React reducer (`state.ts`) that builds chat messages, tool traces, and metrics.
2. **Session replay** — `bun run apps/terminal/src/index.tsx --session <id>` calls `client.replay()` to rebuild history from the event log, then `subscribe()` to pick up anything still running.
3. **Disposable UI** — closing the terminal calls the unsubscribe function; the runtime server and SQLite log keep running untouched.

The terminal does **not** load `GEMINI_API_KEY` or any server secrets — only `RELAY_URL` (optional) to find the runtime. All LLM and tool execution stays in Process 1.

### Building your own client

```typescript
import { createClient } from "@relay/sdk";
import type { RelayEvent } from "@relay/types";

const client = createClient({
  baseUrl: process.env.RELAY_URL ?? "http://localhost:4310",
});

const { sessionId } = await client.send({ prompt: "List files in this directory" });

const stop = client.subscribe({
  sessionId,
  onConnect: () => console.log("stream live"),
  onEvent: (event: RelayEvent) => {
    switch (event.type) {
      case "token.streamed":
        process.stdout.write(event.payload.token);
        break;
      case "tool.started":
        console.log(`→ ${event.payload.toolName}`);
        break;
      case "cost.updated":
        console.log(`tokens: ${event.payload.inputTokens} in / ${event.payload.outputTokens} out`);
        break;
    }
  },
  onError: (err) => console.error("stream error", err),
});

// Later: stop(); or attach to an existing session with replay + subscribe
```

The SDK is **fetch-native** (no WebSocket library, no code generation) — it runs in Bun, Node 24+, and browsers pointed at a local runtime. If the HTTP routes don't change, every client keeps working.

Most agent frameworks couple the UI to the runtime — shared process, shared imports, shared config. Relay inverts that: the event log is canonical, the SDK is the public API, and every surface is a throwaway projection.

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

### Replay vs rerun

| | Replay | Rerun |
|---|--------|-------|
| **What** | Stream historical events from SQLite | Re-execute from a checkpoint |
| **Re-executes LLM?** | No | Yes (future) |
| **MVP status** | Implemented | Defined, not implemented |
| **Use case** | UI reconnect, audit, crash recovery view | Resume work after failure |

Replay reconstructs state **only from events**. No hidden state. Kill the server, restart it, replay a session — the transcript matches exactly.

## Storage

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

## Runtime API

The server-side runtime (`@relay/runtime`) is for execution internals and contributors — not for UI clients. Use [`@relay/sdk`](#relay-sdk-relaysdk) from anything that renders or observes.

```typescript
runtime.execute({ prompt })      // Start new session
runtime.replay({ sessionId })    // Stream historical events (read-only)
runtime.cancel({ sessionId })    // Abort in-flight execution
runtime.subscribe({ sessionId })   // Live event fanout (in-process)
runtime.rerun()                    // Throws NotImplementedError (future)
```

## Monorepo

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
  types/         ← shared event + system types, model provider registry
```

Internal packages use the workspace protocol: `"@relay/sdk": "workspace:*"`

Turborepo manages build ordering, dev parallelization, and typechecking — not distributed execution.

## Security

- Server binds `127.0.0.1` only — not exposed to the network by default
- API keys and secrets stay in the server process; clients never receive them
- Tool inputs/outputs are sanitized before storage and before LLM context
- Events are safe to replay in any environment
- `file.read` blocks path traversal and `.env` files
- `shell.exec` is allowlisted (`pwd`, `ls`, `cat` only) with a minimal spawn environment

## Development

```bash
bun run build       # Build all packages
bun run typecheck   # Type-check all packages
bun run dev:server  # Runtime only (direct Bun watch, loads root .env)
bun run dev:terminal # Ink UI only (direct Bun watch)
bun run dev         # Both via Turborepo (use two terminals instead for daily work)
bun run db:migrate  # Drizzle migrations (optional; server also auto-migrates)
```

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GEMINI_API_KEY` | — | Google Gemini API key (required, server only) |
| `GEMINI_MODEL` | `gemini-3.1-flash-lite` | Default Gemini model ID (server + terminal fallback) |
| `RELAY_PORT` | `4310` | Runtime server port |
| `RELAY_DB_PATH` | `./data/relay.db` | SQLite database path |
| `RELAY_URL` | `http://localhost:4310` | SDK connection URL (terminal / clients) |

`.env` must live at the **monorepo root** (`agent-shell/.env`), not inside `apps/server/`. `dev:server` loads it via `bun --env-file=.env`.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `GEMINI_API_KEY environment variable is required` | Ensure `.env` is at repo root with `GEMINI_API_KEY=...` (no spaces around `=`). Restart the server after editing. |
| `Invalid task configuration` / Turbo TUI error on `dev:server` | Use the current `dev:server` script (direct Bun, not Turbo) or upgrade/pull latest |
| Port already in use | Change `RELAY_PORT` in `.env` and set `RELAY_URL` to match |
| Can't type in terminal UI | Use `bun run dev:terminal` in its own terminal — Ink needs a direct TTY |
| Stream shows **standby** | Normal before your first prompt |
| Stream shows **disconnected** | Start runtime with `bun run dev:server` first; Metrics panel shows **Server: online** when ready |
| Chat shows only your message during tool use | Restart server after pulling — tool-loop message history + activity indicator fixes require latest code |

## Performance Philosophy

Relay intentionally uses **TypeScript + Bun** for the MVP runtime.

1. **LLM latency dominates** — A typical Gemini round-trip is 500ms–5s. Runtime overhead (event persistence, SSE fanout, projection) is microseconds to low milliseconds. Optimizing the runtime before measuring LLM cost is premature.

2. **Architecture clarity first** — Event sourcing, replay correctness, and provider abstraction matter more than raw throughput at MVP scale.

3. **Event sourcing is the core abstraction** — The append-only event log decouples execution from UI, storage, and transport. This boundary enables future native rewrites (Rust/Go) without changing the SDK contract.

4. **Portability** — TypeScript runs on Bun and Node 24. The runtime package has no HTTP dependency. Storage, providers, and loops are independently replaceable.

5. **Measure before refactoring** — Profile when event throughput exceeds local SQLite write capacity or SSE fanout becomes measurable.

## License

MIT
