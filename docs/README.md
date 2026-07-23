# Documentation

Detailed guides for Relay. The [root README](../README.md) is the landing page — quick start and links live there. This folder holds the full reference.

## Suggested reading order

1. **[North Star](./north-star.md)** — Why Relay exists: invariants, seams, platform diagram
2. **[Getting Started](./getting-started.md)** — Install, run, terminal controls, sessions
3. **[Architecture](./architecture.md)** — Runtime server vs disposable clients
4. **[Relay SDK](./sdk.md)** — Build observers with `@relay/sdk`
5. **[Event Sourcing](./event-sourcing.md)** — Event model, replay, rerun, continue
6. **[Storage](./storage.md)** — SQLite schema and async persistence
7. **[Runtime API](./runtime-api.md)** — HTTP routes (contributors)
8. **[Monorepo](./monorepo.md)** — Package layout
9. **[Docker](./docker.md)** — Optional gateway + worker containers, scaling, Redis claim connections

## Reference

| Doc | When to read |
|-----|----------------|
| [Security](./security.md) | Local threat model, tool guardrails |
| [Development](./development.md) | Scripts, env vars, build and test |
| [Docker](./docker.md) | Distributed compose profile, worker scale / autoscaling plan |
| [Troubleshooting](./troubleshooting.md) | Common setup and runtime issues |
| [Performance Philosophy](./performance.md) | MVP tech choices, TTFT checklist, distributed pitfalls |

Each file is self-contained. Cross-links use relative paths so they work on GitHub and locally.
