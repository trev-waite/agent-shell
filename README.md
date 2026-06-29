# Relay (Agent Shell)

A **local-first execution runtime** for AI agents with a terminal-native UI — event-sourced, not a chatbot wrapper. The event log is the system of record; the terminal is a disposable projection.

Relay owns agent loop state, streams events to observers, and persists an append-only record — with every boundary defined as a **swappable seam** (local adapters today, remote adapters later).

> The runtime runs. Clients watch. Storage records. None of them need each other to function.

See [North Star](./docs/north-star.md) for design intent, invariants, and the [platform seams diagram](./docs/north-star.md#platform-seams).

## Quick Start

**Prerequisites:** [Bun](https://bun.sh) 1.3+, Node 24.16+

```bash
bun install
cp .env.example .env   # set GEMINI_API_KEY at monorepo root
```

Run in **two terminals**:

```bash
bun run dev:server    # Terminal 1 — runtime at http://127.0.0.1:4310
bun run dev:terminal  # Terminal 2 — Ink UI (needs a real TTY)
```

Type a prompt and press Enter. Use **/** for commands (`/model`, `/session`, `/new`, `/help`). Press **Ctrl+O** or **Tab** for the model picker; **/help** lists all keyboard shortcuts.

Full setup, terminal controls, multi-turn sessions, replay, and checkpoint resume: [Getting Started](./docs/getting-started.md)

## Documentation

| Topic | Description |
|-------|-------------|
| [North Star](./docs/north-star.md) | Design intent, invariants, seams, platform diagram |
| [Getting Started](./docs/getting-started.md) | Install, run, terminal controls, sessions, replay |
| [Architecture](./docs/architecture.md) | Two-process model, client vs server |
| [Relay SDK](./docs/sdk.md) | `@relay/sdk` — HTTP + SSE client for any observer |
| [Event Sourcing](./docs/event-sourcing.md) | Event model, replay vs rerun vs continue |
| [Storage](./docs/storage.md) | SQLite schema, async `EventSink` persistence |
| [Runtime API](./docs/runtime-api.md) | HTTP routes and server-side composition |
| [Monorepo](./docs/monorepo.md) | Package layout and workspace structure |
| [Security](./docs/security.md) | Local-first threat model and tool guardrails |
| [Development](./docs/development.md) | Build, test, scripts, environment variables |
| [Troubleshooting](./docs/troubleshooting.md) | Common issues and fixes |
| [Performance Philosophy](./docs/performance.md) | Why TypeScript + Bun for the MVP |

## License

MIT
