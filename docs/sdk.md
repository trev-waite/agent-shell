# Relay SDK (`@relay/sdk`)

Relay's architecture hinges on a hard line between **execution** (server) and **projection** (anything that renders). `@relay/sdk` is that line — a small, dependency-light client that speaks HTTP + SSE to the runtime and nothing else.

The Ink terminal (`apps/terminal`) is the first consumer, but it is intentionally **not special**. It imports only `@relay/sdk` and `@relay/types` (via event payloads). It never touches `@relay/runtime`, `@relay/storage`, or provider code. Swap the terminal for a TUI written in Python, a browser dashboard, or a headless log tailer — as long as it uses the SDK, it gets the same typed event stream.

```
┌──────────────────┐     send()        POST /sessions
│  Your client     │ ─────────────────►  starts execution
│  (terminal,      │     send({ sessionId })  POST /sessions/:id/messages
│   script, web)   │ ─────────────────►  continue conversation
│                  │
│                  │     subscribe()   GET /sessions/:id/events  (SSE, live)
│                  │ ◄─────────────────  token.streamed, tool.*, cost.updated, …
│                  │
│                  │     replay()      GET /sessions/:id/replay   (SSE, read-only)
│                  │ ◄─────────────────  full history from SQLite
│                  │
│                  │     rerun()         POST /sessions/:id/rerun
│                  │ ─────────────────►  resume execution from checkpoint
│                  │
│                  │     listCheckpoints() GET /sessions/:id/checkpoints
└──────────────────┘
         │
         └── createClient() — fetch + SSE parser, auto-reconnect, Last-Event-ID
```

## API surface

| Method | HTTP | Purpose |
|--------|------|---------|
| `send({ prompt, model? })` | `POST /sessions` | Start a new agent session; returns `{ sessionId }` |
| `send({ prompt, sessionId, model? })` | `POST /sessions/:id/messages` | Continue an existing session with a follow-up message; returns `{ sessionId }` |
| `listModels()` | `GET /models` | Provider registry + model lists (Gemini today) |
| `listCheckpoints(sessionId)` | `GET /sessions/:id/checkpoints` | Checkpoint ids, labels, and iteration numbers |
| `rerun({ sessionId, checkpointId?, model? })` | `POST /sessions/:id/rerun` | Resume execution from a checkpoint; returns `{ sessionId }` |
| `cancel(sessionId)` | `POST /sessions/:id/cancel` | Abort in-flight execution (no-op if idle) |
| `subscribe({ sessionId, onEvent, … })` | `GET /sessions/:id/events` | Live SSE stream — tokens, tools, costs, errors |
| `replay({ sessionId, onEvent, … })` | `GET /sessions/:id/replay` | Read-only replay of persisted events, then closes |

Every `onEvent` callback receives a typed `RelayEvent` from `@relay/types` — the same shape the runtime writes to SQLite. Clients **project** events into UI state; they never mutate the log.

`subscribe` tracks `Last-Event-ID` across reconnects and retries automatically. The server replays missed events on connect, so a client that attaches after execution has already started still receives the full transcript.

## Where we use it

**`apps/terminal`** — the reference client:

1. **New prompt** — `client.send()` returns a `sessionId`, then `client.subscribe()` opens the live stream. Events flow into a React reducer (`state.ts`) that builds chat messages, tool traces, and metrics.
2. **Follow-up prompts** — the terminal passes `sessionId` to `client.send()`, which calls `POST /sessions/:id/messages`. Chat history stays on screen; the model sees prior turns via the checkpoint.
3. **Message queue** — prompts sent while the agent is busy are queued above the input and auto-sent when the turn completes.
4. **Session replay** — `bun run apps/terminal/src/index.tsx --session <id>` calls `client.replay()` to rebuild history from the event log, then `subscribe()` to pick up anything still running.
5. **Checkpoint resume** — `client.rerun({ sessionId })` restores the ReAct loop from the latest `checkpoint.saved` snapshot and continues execution on the same session (after failure/cancel, not for normal chat).
6. **New conversation** — `/new` cancels in-flight work, clears the UI, and drops the session id; the next send starts fresh.
7. **Disposable UI** — closing the terminal calls the unsubscribe function; the runtime server and SQLite log keep running untouched.

The terminal does **not** load `GEMINI_API_KEY` or any server secrets — only `RELAY_URL` (optional) to find the runtime. All LLM and tool execution stays in Process 1.

## Building your own client

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

// Follow-up on the same session (model sees prior context)
await client.send({ sessionId, prompt: "Now summarize what you found" });

// Later: stop(); or attach to an existing session with replay + subscribe

const { checkpoints } = await client.listCheckpoints(sessionId);
if (checkpoints.length > 0) {
  await client.rerun({ sessionId }); // latest checkpoint
  // await client.rerun({ sessionId, checkpointId: checkpoints[0].checkpointId });
}
```

The SDK is **fetch-native** (no WebSocket library, no code generation) — it runs in Bun, Node 24+, and browsers pointed at a local runtime. If the HTTP routes don't change, every client keeps working.

Most agent frameworks couple the UI to the runtime — shared process, shared imports, shared config. Relay inverts that: the event log is canonical, the SDK is the public API, and every surface is a throwaway projection.
