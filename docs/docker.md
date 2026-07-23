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

## Performance notes

- **Local Bun** (`dev:server`) avoids Redis/Postgres hops; still the simplest path for day-to-day UI work. See [performance.md](./performance.md) for a TTFT baseline checklist.
- **Hybrid (loop 1 below) is the fast distributed DX** — same architecture as full Docker without image rebuilds; prefer it while coding gateway/worker.
- Avoid host workspace bind mounts on macOS when measuring tool I/O (`docker-compose.workspace.yml`); virtiofs mounts add latency.
- Set `RELAY_TRACE_TIMING=1` on gateway/worker to log enqueue → claim → first live/SSE hops.
- **Worker Redis connections:** each worker opens **two** clients to the same Redis:
  - `claimRedis` — blocking `XREADGROUP` / reclaim only (dispatcher)
  - `redis` — leases, heartbeats, ack, live-event `XADD` (shared by up to `WORKER_CONCURRENCY` in-flight sessions)
  
  Never put blocking claim and live `XADD` on one connection: `node-redis` queues other commands behind `BLOCK`, which stalls tokens by up to the claim timeout (~5s) and can leave session admission held (clients see `409` “already queued or running”).

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

Point clients at `http://localhost:4310`. Hybrid Bun workers use the same dual-Redis pattern as the container image.

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

## Scaling workers

Workers are a **stateless claim pool** on one Redis consumer group (`relay-workers` / stream `relay:tasks`). More replicas ⇒ more claimers ⇒ higher throughput. Gateway stays at **1**.

### Manual scale (Compose / local)

```bash
docker compose up -d --scale worker=5
```

Tune density per replica with `WORKER_CONCURRENCY` (default `4`). Caps:

| Limit | Why |
|-------|-----|
| Postgres connections | Roughly `workers × pool max (10) + gateway` must stay under `max_connections` (compose default `100`) |
| Worker memory | Compose `mem_limit: 1g` per worker × concurrency under tool-heavy runs |
| Gemini RPM/TPM | Often the real ceiling before CPU/Redis |

You do **not** add Redis connections per ReAct loop. Each worker keeps **two** connections (claim + everything else); scale out with **more worker processes**, not more sockets on one process.

### Production autoscaling (planned)

Target shape: Kubernetes (or ECS) with **KEDA** (or HPA + custom metrics) on the **worker** Deployment only.

```
Clients → Gateway×1 → Redis Streams (relay:tasks)
                         ↓
              Worker Deployment (KEDA / HPA)
                         ↓
                      Postgres
```

| Piece | Choice |
|-------|--------|
| What scales | Worker Deployment / service |
| Primary metric | Redis Streams lag / pending for group `relay-workers` (not CPU alone — workers are often LLM-bound) |
| Suggested stack | **KEDA Redis Streams scaler** (or Prometheus lag → HPA) |
| Floor / ceiling | `minReplicas ≥ 1` (or 2 for HA); `maxReplicas` capped by Postgres pool budget + provider quotas |
| Stabilization | Scale up in tens of seconds; scale down slowly (minutes) so short LLM spikes don’t thrash |
| Drain | Stop claiming → finish in-flight → release leases (reclaim covers crashed workers) |

Do **not** HPA the gateway until multi-gateway SSE / sticky live fanout exists. Tracked in [todolist.md](../todolist.md).

## Services

| Service | Role | Image target |
|---------|------|--------------|
| `gateway` | HTTP/SSE, session create + enqueue, store reads | `gateway` |
| `worker` | Claim tasks, run ReActLoop, publish live events | `worker` |
| `redis` | Leases, task stream, live event streams | `redis:8.8-alpine` (`mem_limit: 256m`) |
| `postgres` | Shared durable event log | `postgres:18-alpine` (`mem_limit: 512m`) |

Each worker runs up to four sessions concurrently by default (`mem_limit: 1g` in compose). Set
`WORKER_CONCURRENCY` to tune that bound for provider quotas and available memory. Gateway is capped
at `512m`. Postgres ships with modest Desktop-oriented settings (`shared_buffers=128MB`,
`max_connections=100`).

Gateway has a compose healthcheck against `GET /health` (Redis `PING` + cheap `SELECT 1`).

### Upgrading Postgres 17 → 18

Postgres 18 images store data under `/var/lib/postgresql/18/docker` and expect the volume mount at
`/var/lib/postgresql` (not `/var/lib/postgresql/data`). Compose already mounts `relay_pg` there.

**Dev volumes:** easiest path is a fresh volume (data loss OK for local relay DB):

```bash
docker compose down
docker volume rm agent-shell_relay_pg   # name may vary; check `docker volume ls`
docker compose up -d postgres
```

**Keeping data:** run official `pg_upgrade` with both major images and a mount on
`/var/lib/postgresql` — see the [Postgres Docker upgrade notes](https://github.com/docker-library/postgres/issues/37).
A major bump alone will not match local Bun TTFT; treat it as hygiene + I/O improvements.

## Images

One Dockerfile, two build targets (`oven/bun:1.3.14-alpine`), both run as non-root `relay`:

| Target | Contains | Install filter |
|--------|----------|----------------|
| `gateway` | `apps/gateway` + HTTP/queue packages | `--filter @relay/gateway` |
| `worker` | `apps/worker` + runtime/tools/providers | `--filter @relay/worker` |

Neither image ships web, terminal, server, or `@relay/sdk`. Workspace `package.json`
stubs for those apps exist only so `bun install --frozen-lockfile` can see the full
lockfile graph.

Compose infra pins: `redis:8.8-alpine`, `postgres:18-alpine`.

### Follow-up: slim the gateway further

Gateway still copies `@relay/providers` because `@relay/runtime` re-exports the ReAct loop
(and thus depends on providers). Split a thin helper surface (projections / sanitize /
checkpoint helpers) so the gateway image can drop the AI SDK — tracked in `todolist.md`.
