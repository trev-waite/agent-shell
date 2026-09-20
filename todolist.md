# Relay — Follow-up TODO

Open work only. Design docs live in [docs/](docs/README.md).

## High

- [ ] **Headless runtime CLI** — Thin `relay exec --prompt "..."` entrypoint that runs `@relay/runtime` without HTTP (scripts/CI).

## Web

- [ ] **Connection failure** — Keep the “Hello There.” screen. On input focus/click (and keyboard), turn Send into a soft red ×; restore Send when the connection returns. Accessible status, no banner.

- [ ] **Stop / Retry** — Stop active runs; Retry failed sends without duplicating a running task. Preserve draft and session.

- [ ] **Readable responses** — Markdown, fenced code, copy; keep streaming stable and sanitize.

- [ ] **Mobile layout** — Sessions panel offscreen and clipped input settings at 390px.

## Architecture

- [ ] **Share HTTP route behavior** — Deduplicate local server vs gateway routing/SSE; inject adapters; start with the event-stream join contract.

- [ ] **Connection vs execution state** — Dropped observers reconnect; runtime keeps running. One owner for reconnect policy (`useTurnFleet` vs SDK).

- [ ] **Batch frontend stream updates** — Coalesce token updates per frame; flush terminal events immediately; avoid cloning a growing event-ID set per token.

- [ ] **Replay durability contract** — Document live-first crash-loss window vs observer reconnect; measure large-history replay before cursors/pagination.

## Platform

- [ ] **Auth seam** — `AuthContext` on routes; optional SDK `getToken()`. No-op locally.

- [ ] **Session metadata** — Optional `ownerId` / `tenantId` / `workspaceId` (nullable locally).

- [ ] **CheckpointStore / ArtifactStore** — Interfaces exist; checkpoints still go through events + `snapshots`.

- [ ] **Slim gateway runtime imports** — Let gateway import projections/sanitize/checkpoint without pulling providers/AI SDK.

- [ ] **Worker autoscaling** — KEDA Redis Streams (or HPA on lag); gateway stays ×1. See [docker.md](docs/docker.md#scaling-workers).

- [ ] **OpenTelemetry** — Optional `@ai-sdk/otel` + collector behind `RELAY_TELEMETRY=1` for ops tracing (complements `usage.updated`, does not replace the event log).

- [ ] **Ephemeral execution** — In-memory store wiring for tests and throwaway runs.

## Later

- [ ] **Native runtime rewrite** — Rust/Go executor once interfaces stabilize; SDK unchanged.

- [ ] **Temporal DurableExecutor** — Alternative to the queue worker handoff.

- [ ] **Multi-provider routing** — Beyond Gemini; registry already partially in place.

- [ ] **Profile before more hot-path work** — Measure event throughput and SQLite write pressure first.
