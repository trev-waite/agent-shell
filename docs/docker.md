# Distributed Docker profile

Relay’s default DX is still local: `bun run dev:server` (one process, SQLite, `127.0.0.1`).

Docker is an additive **distributed profile**: **one gateway** + **N workers** + Redis Streams + Postgres.

## Topology

```
Clients (web / terminal / SDK)
        │
        ▼
   gateway ×1          HTTP/SSE, enqueue tasks, store reads
        │
   Redis Streams
        │
   worker ×N           Claim tasks, run ReActLoop, publish events
        │
   Postgres            Shared durable event log
```

**Scale workers, not the gateway.** Do not `docker compose up --scale gateway=N` until sticky
sessions / multi-gateway live-event fanout is designed.

## Threat model (honest)

- Workspace mounts are **not** a sandbox — same light tool guardrails as local (`file.read` / allowlisted `shell.exec`).
- Gateway binds `0.0.0.0` inside the compose network. Do not expose publicly without an auth seam.
- `GEMINI_API_KEY` is injected on **workers only** (compose interpolates from host/`./.env`, not a full `env_file` dump).

## Loops

### 1. Fast local distributed (recommended while coding)

Infra in Docker; apps via Bun watch (no image rebuilds):

```bash
# Publish Redis/Postgres on localhost
docker compose -f docker-compose.yml -f docker-compose.local.yml up redis postgres

# In .env (or export):
#   REDIS_URL=redis://127.0.0.1:6379
#   RELAY_DATABASE_URL=postgres://relay:relay@127.0.0.1:5432/relay
#   GEMINI_API_KEY=...

bun run dev:gateway   # terminal 1
bun run dev:worker    # terminal 2
```

Point clients at `http://localhost:4310`.

### 2. Packaging smoke (exercise images)

Prod-shaped default — only gateway `:4310` is published; Redis/Postgres stay on the compose network:

```bash
# Ensure GEMINI_API_KEY is in the environment or project .env
docker compose up --build --scale worker=2
```

Local variant (infra ports on the host):

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build --scale worker=2
```

Optional host workspace for worker tools:

```bash
export RELAY_WORKSPACE=/path/to/project
docker compose \
  -f docker-compose.yml \
  -f docker-compose.local.yml \
  -f docker-compose.workspace.yml \
  up --build --scale worker=2
```

### 3. Prod-shaped constraints

| Rule | Why |
|------|-----|
| One gateway replica | SSE / live events are not multi-gateway-safe yet |
| Scale workers only | Throughput and isolation live on the worker pool |
| Do not publish Redis/Postgres | Default compose keeps them internal |
| API key on workers only | Gateway never needs the provider secret |
| Auth before public expose | Gateway has no auth seam yet |
| Non-root containers | Images run as user `relay` |

## Services

| Service | Role | Image target |
|---------|------|--------------|
| `gateway` | HTTP/SSE, session create + enqueue, store reads | `gateway` |
| `worker` | Claim tasks, run ReActLoop, publish live events | `worker` |
| `redis` | Leases, task stream, live event streams | `redis:8.8-alpine` |
| `postgres` | Shared durable event log | `postgres:17-alpine` |

Each worker runs up to four sessions concurrently by default (`mem_limit: 1g` in compose). Set
`WORKER_CONCURRENCY` to tune that bound for provider quotas and available memory.

Gateway has a compose healthcheck against `GET /health` (Redis + DB).

## Images

One Dockerfile, two build targets (`oven/bun:1.3.14-alpine`), both run as non-root `relay`:

| Target | Contains | Install filter |
|--------|----------|----------------|
| `gateway` | `apps/gateway` + HTTP/queue packages | `--filter @relay/gateway` |
| `worker` | `apps/worker` + runtime/tools/providers | `--filter @relay/worker` |

Neither image ships web, terminal, server, or `@relay/sdk`. Workspace `package.json`
stubs for those apps exist only so `bun install --frozen-lockfile` can see the full
lockfile graph.

Compose infra pins: `redis:8.8-alpine`, `postgres:17-alpine`.

### Follow-up: slim the gateway further

Gateway still copies `@relay/providers` because `@relay/runtime` re-exports the ReAct loop
(and thus depends on providers). Split a thin helper surface (projections / sanitize /
checkpoint helpers) so the gateway image can drop the AI SDK — tracked in `todolist.md`.
