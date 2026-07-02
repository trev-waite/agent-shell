# Monorepo

```
apps/
  terminal/      ← Ink 7 CLI UI (depends only on @relay/sdk)
  web/           ← Browser React UI (depends only on @relay/sdk)
  server/        ← Fastify runtime server

packages/
  runtime/       ← execution engine + seams/local adapters (no HTTP)
  providers/     ← Gemini LLM adapter (AI SDK v7 transport)
  storage/       ← bun:sqlite store + local EventSink adapter
  tools/         ← file.read, shell.exec implementations
  tool-registry/ ← tool abstraction layer
  sdk/           ← runtime client (SSE transport)
  types/         ← events, storage, and seam interfaces (`seams.ts`)
```

Internal packages use the workspace protocol: `"@relay/sdk": "workspace:*"`

Turborepo manages build ordering, dev parallelization, and typechecking — not distributed execution.
