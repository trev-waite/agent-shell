# Relay — Follow-up TODO

Track deferred work, optimizations, and North Star follow-ups.

**Terminology:** A **seam** is a swappable interface boundary — see [README § What is a seam?](README.md#what-is-a-seam). **Local adapter** = today's in-process impl (`createLocal*`). **Remote adapter** = future distributed impl (`createRedis*`, `createQueue*`, …).

---

## High priority

- [ ] **Headless runtime entrypoint** — Thin CLI (e.g. `relay exec --prompt "..."`) that runs `@relay/runtime` directly without HTTP. Proves the runtime is independent of transport; useful for scripts and CI.

- [ ] **Token write batching** — Optional batching in `EventSink` for high-frequency `token.streamed` events (single SQLite transaction per N tokens or per assistant message). Fanout stays per-token; only persistence batches.

- [ ] **Server integration tests** — HTTP-level tests for SSE disconnect (client closes, execution completes), `Last-Event-ID` replay, and multi-subscriber fanout through the real Fastify server.

---

## Platform seams — structural (before infra)

- [ ] **Auth seam** — `AuthContext` on server routes; optional `headers` / `getToken()` hook on `@relay/sdk`. Can be no-op locally.

- [ ] **Session metadata** — Optional `ownerId`, `tenantId`, `workspaceId` on `Session` (nullable for local-first).

- [x] **EventSink error policy** — Persist failures tracked; `flush()` rejects; runtime logs + emits `PERSIST_FAILED` on flush failure.

- [x] **Async EventStore API** — `append(): Promise<void>`, async reads; SQLite wrapped, Postgres native.

- [ ] **Dedicated architecture doc** — Extract `docs/architecture.md` from README with North Star invariants and package dependency diagram.

---

## Distributed deployment blueprint

Reference for splitting today's monolith. **Local today:** everything in `apps/server` (one Bun process) with `seams/local` adapters. **Distributed target:** gateway + worker pods + shared infra with remote adapters.

### Who uses `@relay/sdk`

| Role | Uses SDK? | Packages instead |
|------|-----------|------------------|
| Terminal, web UI, CI scripts | **Yes** | `@relay/sdk`, `@relay/types` |
| API gateway | No | `@relay/types`, coordination/dispatch/pubsub adapters |
| Worker pods | No | `@relay/runtime`, `@relay/providers`, `@relay/tools`, adapters |
| Session coordinator | No | Library only — Redis/etcd client, not a deployable app |

**Rule:** SDK is for **observers**. Gateway and workers never import `@relay/sdk`.

### Target deployables

| Artifact | Type | Responsibility | Key `create*` calls |
|----------|------|----------------|---------------------|
| `apps/gateway` | App (evolve `apps/server`) | HTTP, SSE, auth, dispatch — **does not run ReActLoop** | `createQueueDurableExecutor`, `createRedisSessionCoordinator` (client), `createRedisLiveEventPublisher` (subscribe) |
| `apps/worker` | App (**new**, N pods) | Dequeue tasks, run loop, publish events | `createRuntime`, `createLocalDurableExecutor`, same coordinator/pubsub/storage adapters |
| `apps/terminal` | App (unchanged) | UI observer | `createClient()` from `@relay/sdk` |
| Redis / queue | Infra | Leases, task queue, live pub/sub | Not an app — shared by gateway + workers |

### SessionCoordinator — not a pod

- **Infra:** Redis, etcd, or Postgres advisory locks.
- **Code:** `packages/coordination` → `createRedisSessionCoordinator()` implements `SessionCoordinator` from `@relay/types/seams`.
- **Used by:** gateway (`resolveOwner`, `routeCancel`) and workers (`acquireLease`, `releaseLease`, `renewLease`).
- **Maps:** `sessionId → workerId` with TTL leases.

### Two `DurableExecutor` implementations (same interface)

| Side | Factory | Behavior |
|------|---------|----------|
| Gateway | `createQueueDurableExecutor()` | Create session metadata, enqueue `ExecutionTask`, return `{ sessionId }` fast |
| Worker | `createLocalDurableExecutor()` (exists today) | `runtime.execute` / `continue` / `rerun` — runs ReActLoop in-process |

Same `ExecutionTask` type (`kind`: `execute` | `continue` | `rerun`) on both sides.

### Request flow (new session)

```
Terminal  →  POST /sessions           →  Gateway
Gateway   →  executor.execute(task)   →  Queue
Worker    →  dequeue task             →  acquireLease(session, workerId)
Worker    →  local executor          →  runtime + ReActLoop
Worker    →  LiveEventPublisher       →  Redis pub/sub
Gateway   →  SSE subscribe(pub/sub)   →  Terminal
Worker    →  EventSink                →  shared DB
```

Cancel: gateway → `coordinator.routeCancel(sessionId)` → signal owning worker. Client SSE disconnect does **not** cancel.

### New packages (planned)

```
packages/
  coordination/   createRedisSessionCoordinator()
  dispatch/       createQueueDurableExecutor()
  pubsub/         createRedisLiveEventPublisher()
  storage/        remote EventSink + ExecutionStore (Postgres/S3) — extend existing
```

### Implementation checklist (distributed split)

- [x] **`apps/worker`** — Queue consumer loop; wires `createRuntime` + `createLocalDurableExecutor` + `WORKER_ID` env.
- [x] **`apps/gateway`** — Slim HTTP/SSE only; queue executor; no direct ReActLoop; subscribe-then-replay SSE.
- [x] **`packages/coordination`** — Redis-backed `SessionCoordinator`.
- [x] **`packages/dispatch`** — Redis Streams `DurableExecutor` for gateway.
- [x] **`packages/pubsub`** — Redis Streams `LiveEventPublisher` + `SessionLiveBroker`.
- [x] **Remote storage adapter** — Postgres `ExecutionStore` / `EventProjector` (async interfaces); SQLite remains for local `apps/server`.
- [x] **Docker packaging** — `docker/Dockerfile` + `docker-compose.yml` (see [docs/docker.md](docs/docker.md)).

---

## Medium priority

- [ ] **OpenTelemetry for production** — When deploying beyond local-first: add `@ai-sdk/otel`, `registerTelemetry()` in `apps/server`, wire an OTel collector/exporter (Datadog, Langfuse, Grafana, etc.), and `RELAY_TELEMETRY=1` env. Complements `usage.updated` (product UI) with cross-session ops tracing; not a replacement for the event log.

- [ ] **Implement `CheckpointStore` / `ArtifactStore`** — Interfaces exist in `@relay/types`; checkpoints today go through events + `snapshots` table. Artifact storage for large tool outputs is unimplemented.

- [ ] **Ephemeral execution mode** — Optional runtime wiring with in-memory store (no SQLite) for tests and throwaway runs.

- [x] **Coordinator-backed session status** — Gateway `getStatus` merges `deriveSessionStatus` with `resolveOwner`.

---

## Lower priority / future

- [ ] **Native runtime rewrite** — Rust/Go executor once interfaces stabilize; SDK contract stays unchanged.

- [ ] **Remote event store** — Swap SQLite for shared append-only log; see [Distributed deployment blueprint](#distributed-deployment-blueprint). `EventSink` is the seam.

- [ ] **Temporal / durable worker handoff** — Alternative to queue: Temporal-backed `DurableExecutor` on gateway; activities map to ReAct iterations.

- [ ] **Remote LiveEventPublisher** — `packages/pubsub`; Redis/NATS so any gateway pod can SSE any session. See blueprint.

- [ ] **Remote SessionCoordinator** — `packages/coordination`; Redis/etcd leases. **Not a separate app** — library + shared Redis. See blueprint.

- [ ] **Multi-provider routing** — Provider selection beyond Gemini; model registry already partially in place.

- [ ] **Profile-driven optimization** — Measure event throughput and SQLite write pressure before further hot-path work (see README Performance Philosophy).

---

## Done

### 2026-06-28 — AI SDK v7 + ReAct loop optimizations

- [x] **Upgrade to AI SDK v7** — `ai@7`, `@ai-sdk/google@4`; `instructions`, `createGoogle`, `activeTools`, reasoning passthrough.
- [x] **Optimize React loop** — Tool-schema memoization, stable instructions for implicit caching, `usage.updated` events with TTFT/tok/s/cache metrics in terminal.

### 2026-06-26 — Platform seam adapters + interface extensions

- [x] **Seam interfaces** (`@relay/types/seams`) — `DurableExecutor`, `SessionCoordinator`, `LiveEventPublisher`, `EventSink`, typed `ExecutionTask`.
- [x] **Local adapters** — `createLocal*` in `@relay/runtime/seams/local`.
- [x] **Wired in apps/server** — HTTP mutations go through `DurableExecutor`; runtime uses coordinator + live publisher.
- [x] **Platform seams diagram** — Mermaid architecture diagram in README.

### 2026-06-26 — North Star alignment

- [x] **Async persistence via `EventSink`** — Fanout before storage; `createProjectorEventSink()` in `@relay/storage`.
- [x] **Invariant tests** — Token non-blocking, observer unsubscribe, multi-observer fanout (`runtime.invariants.test.ts`).
- [x] **SSE history via `runtime.replay()`** — Server no longer reads `store.events` directly for live streams.
- [x] **Remove unused `@relay/storage` dep** from `@relay/runtime` package.
- [x] **README North Star section** — Design rule, invariants, and future seams documented.

---

## How to use this file

Add new items under the appropriate priority section. Move completed items to **Done** with a date. Link to issues or PRs when they exist.

**For agents:** grep `Distributed deployment blueprint` for the gateway/worker split. Local adapters: `packages/runtime/src/seams/local/`. Interfaces: `packages/types/src/seams.ts`. HTTP mutations use `createLocalDurableExecutor`.
