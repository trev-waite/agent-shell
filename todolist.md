# Relay — Follow-up TODO

Track deferred work, optimizations, and North Star follow-ups.

---

## High priority

- [ ] **Headless runtime entrypoint** — Thin CLI (e.g. `relay exec --prompt "..."`) that runs `@relay/runtime` directly without HTTP. Proves the runtime is independent of transport; useful for scripts and CI.

- [ ] **Token write batching** — Optional batching in `EventSink` for high-frequency `token.streamed` events (single SQLite transaction per N tokens or per assistant message). Fanout stays per-token; only persistence batches.

- [ ] **Server integration tests** — HTTP-level tests for SSE disconnect (client closes, execution completes), `Last-Event-ID` replay, and multi-subscriber fanout through the real Fastify server.

---

## Cloud harness — structural (before infra)

- [ ] **Auth seam** — `AuthContext` on server routes; optional `headers` / `getToken()` hook on `@relay/sdk`. Can be no-op locally.

- [ ] **Session metadata** — Optional `ownerId`, `tenantId`, `workspaceId` on `Session` (nullable for local-first).

- [ ] **EventSink error policy** — Stop swallowing persist failures in `createProjectorEventSink`; log/metric and define retry or session-fail behavior.

- [ ] **Async EventStore API** — `append(): Promise<void>`, cursor/stream reads, pagination for large sessions (needed for remote stores).

- [ ] **Dedicated architecture doc** — Extract `docs/architecture.md` from README with North Star invariants and package dependency diagram.

---

## Medium priority

- [ ] **Implement `CheckpointStore` / `ArtifactStore`** — Interfaces exist in `@relay/types`; checkpoints today go through events + `snapshots` table. Artifact storage for large tool outputs is unimplemented.

- [ ] **Ephemeral execution mode** — Optional runtime wiring with in-memory store (no SQLite) for tests and throwaway runs.

- [ ] **Coordinator-backed session status** — Replace or augment `deriveSessionStatus` time heuristic with lease/heartbeat awareness for distributed setups.

---

## Lower priority / future

- [ ] **Native runtime rewrite** — Rust/Go executor once interfaces stabilize; SDK contract stays unchanged.

- [ ] **Remote event store** — Swap SQLite for a remote append-only log; `EventSink` is the seam.

- [ ] **Temporal / durable worker handoff** — Replace `createLocalDurableExecutor` with Temporal-backed implementation.

- [ ] **Remote LiveEventPublisher** — Redis/NATS pub/sub for cross-node SSE fanout.

- [ ] **Remote SessionCoordinator** — Redis/etcd leases for multi-worker session ownership.

- [ ] **Multi-provider routing** — Provider selection beyond Gemini; model registry already partially in place.

- [ ] **Profile-driven optimization** — Measure event throughput and SQLite write pressure before further hot-path work (see README Performance Philosophy).

---

## Done

### 2026-06-26 — Cloud seam stubs + interface extensions

- [x] **Extended cloud interfaces** — `DurableExecutor` (execute/continue/rerun/cancel/getStatus), `SessionCoordinator` (lease/affinity), `LiveEventPublisher`, typed `ExecutionTask`.
- [x] **Local stub implementations** — `createLocalDurableExecutor`, `createLocalSessionCoordinator`, `createLocalLiveEventPublisher` in `@relay/runtime`.
- [x] **Wired in apps/server** — HTTP mutations go through `DurableExecutor`; runtime uses coordinator + live publisher.
- [x] **Cloud layer diagram** — Mermaid architecture diagram in README.

### 2026-06-26 — North Star alignment

- [x] **Async persistence via `EventSink`** — Fanout before storage; `createProjectorEventSink()` in `@relay/storage`.
- [x] **Invariant tests** — Token non-blocking, observer unsubscribe, multi-observer fanout (`runtime.invariants.test.ts`).
- [x] **SSE history via `runtime.replay()`** — Server no longer reads `store.events` directly for live streams.
- [x] **Remove unused `@relay/storage` dep** from `@relay/runtime` package.
- [x] **README North Star section** — Design rule, invariants, and future seams documented.

---

## How to use this file

Add new items under the appropriate priority section. Move completed items to **Done** with a date. Link to issues or PRs when they exist.
