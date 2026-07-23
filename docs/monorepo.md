# Monorepo

```
apps/
  terminal/      ← Ink 7 CLI UI (depends only on @relay/sdk)
  web/           ← Browser React UI (depends only on @relay/sdk)
  server/        ← Fastify local monolith (SQLite + in-process runtime)
  gateway/       ← Distributed HTTP/SSE (queue dispatch, no ReActLoop)
  worker/        ← Distributed ReAct worker (queue consumer)

packages/
  runtime/       ← execution engine + seams/local adapters (no HTTP)
  providers/     ← Gemini LLM adapter (AI SDK v7 transport)
  storage/       ← SQLite + Postgres ExecutionStore / EventSink
  tools/         ← file.read, shell.exec implementations
  tool-registry/ ← tool abstraction layer
  sdk/           ← runtime client (SSE transport)
  types/         ← events, storage, and seam interfaces (`seams.ts`)
  coordination/  ← Redis SessionCoordinator
  dispatch/      ← Redis Streams DurableExecutor (gateway)
  pubsub/        ← Redis Streams LiveEventPublisher + SessionLiveBroker
```

Internal packages use the workspace protocol: `"@relay/sdk": "workspace:*"`

Turborepo manages build ordering, dev parallelization, and typechecking — not distributed execution.

See [Docker](./docker.md) for the gateway + worker compose profile, dual Redis claim connections, and [worker scaling](./docker.md#scaling-workers).
