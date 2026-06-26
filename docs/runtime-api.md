# Runtime API

The server-side runtime (`@relay/runtime`) is for execution internals and contributors — not for UI clients. Use [`@relay/sdk`](./sdk.md) from anything that renders or observes.

**HTTP routes** (Fastify, `apps/server`) — mutations go through `DurableExecutor`; reads and SSE use `Runtime` directly:

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/sessions` | Start new session |
| `POST` | `/sessions/:id/messages` | Continue session with follow-up message |
| `POST` | `/sessions/:id/rerun` | Resume from checkpoint |
| `POST` | `/sessions/:id/cancel` | Cancel in-flight execution |
| `GET` | `/sessions/:id/events` | Live SSE stream |
| `GET` | `/sessions/:id/replay` | Read-only SSE replay |
| `GET` | `/sessions/:id/checkpoints` | List checkpoints |
| `GET` | `/sessions` | List sessions |
| `GET` | `/models` | Provider/model registry |
| `GET` | `/health` | Health check |

```typescript
// apps/server composition (simplified)
const executor = createLocalDurableExecutor({ runtime, coordinator, workerId });

executor.execute({ kind: "execute", prompt });           // POST /sessions
executor.execute({ kind: "continue", sessionId, prompt }); // POST /sessions/:id/messages
executor.execute({ kind: "rerun", sessionId, checkpointId }); // POST /sessions/:id/rerun
executor.cancel(sessionId);                              // POST /sessions/:id/cancel

runtime.replay({ sessionId });                           // SSE history + reconnect
runtime.onSessionEvent(sessionId, handler);            // Live SSE fanout
runtime.listCheckpoints(sessionId);
```

Local adapters live in `@relay/runtime/seams/local`: `createLocalDurableExecutor`, `createLocalSessionCoordinator`, `createLocalLiveEventPublisher`. Interfaces live in `@relay/types/seams`.
