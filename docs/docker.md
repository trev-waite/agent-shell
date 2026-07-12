# Distributed Docker profile

Relay’s default DX is still local: `bun run dev:server` (one process, SQLite, `127.0.0.1`).

Docker is an additive **distributed profile**: gateway + N workers + Redis Streams + Postgres.

## Threat model (honest)

- Workspace mounts are **not** a sandbox — same light tool guardrails as local (`file.read` / allowlisted `shell.exec`).
- Gateway binds `0.0.0.0` inside the compose network. Do not expose without an auth seam.
- `GEMINI_API_KEY` is injected on **workers only** (via `.env` / compose `env_file`).

## Quick start

```bash
# Ensure .env has GEMINI_API_KEY
docker compose up --build --scale worker=3
```

Point web/terminal at `http://localhost:4310` (`RELAY_URL` / `BUN_PUBLIC_RELAY_URL`).

Optional host workspace mount for tools:

```bash
RELAY_WORKSPACE=/path/to/project docker compose up --build --scale worker=2
```

## Services

| Service | Role |
|---------|------|
| `gateway` | HTTP/SSE, session create + enqueue, store reads |
| `worker` | Claim tasks, run ReActLoop, publish live events |
| `redis` | Leases, task stream, live event streams |
| `postgres` | Shared durable event log |

Each worker runs up to four sessions concurrently by default. Set
`WORKER_CONCURRENCY` to tune that bound for provider quotas and available memory.

## Image

Single Bun image (`docker/Dockerfile`), two commands:

- `bun apps/gateway/src/index.ts`
- `bun apps/worker/src/index.ts`
