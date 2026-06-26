# Architecture

**Two processes** for daily use — runtime server + disposable terminal. **One process** inside the server today: Fastify, local seam adapters, and `@relay/runtime` all run together. See [Platform seams](./north-star.md#platform-seams) for the distributed target.

```
┌─────────────────────────────────────────────────────────────┐
│                     Process 2: Terminal                      │
│  Ink UI (apps/terminal)  ── @relay/sdk (HTTP + SSE) ───────┼──┐
└─────────────────────────────────────────────────────────────┘  │
                          localhost only                           │
┌─────────────────────────────────────────────────────────────┐  │
│              Process 1: Runtime Server (apps/server)         │◄─┘
│                                                              │
│  Fastify ──► DurableExecutor ──► @relay/runtime (ReActLoop) │
│                  │                    │                      │
│                  │         SessionCoordinator (local adapter)  │
│                  │         LiveEventPublisher (local adapter)  │
│                  │         EventSink (local adapter) ──► SQLite │
│                  └── providers (Gemini) · tools (local FS)  │
└─────────────────────────────────────────────────────────────┘
```

## Two-process model

| Process | Role | Survives UI exit? |
|---------|------|-------------------|
| Runtime server | Source of truth, executes agent loop, persists events | Yes |
| Ink terminal | Stateless event subscriber, renders projections | Disposable |

Multiple terminals can attach to the same runtime simultaneously. Restarting the UI reconnects via SSE with `Last-Event-ID` support.

**Client vs server:** Anything that renders UI or tooling talks to the runtime through [`@relay/sdk`](./sdk.md). The server owns execution, persistence, and secrets. Clients only project events.
