# Performance Philosophy

Relay intentionally uses **TypeScript + Bun** for the MVP runtime.

1. **LLM latency dominates** — A typical Gemini round-trip is 500ms–5s. Runtime overhead (event persistence, SSE fanout, projection) is microseconds to low milliseconds. Optimizing the runtime before measuring LLM cost is premature.

2. **Architecture clarity first** — Event sourcing, replay correctness, and provider abstraction matter more than raw throughput at MVP scale.

3. **Event sourcing is the core abstraction** — The append-only event log decouples execution from UI, storage, and transport. This boundary enables future native rewrites (Rust/Go) without changing the SDK contract.

4. **Portability** — TypeScript runs on Bun and Node 24. The runtime package has no HTTP dependency. Storage, providers, and loops are independently replaceable.

5. **Measure before refactoring** — Profile when event throughput exceeds local SQLite write capacity or SSE fanout becomes measurable.

## LLM token efficiency (`@relay/providers`)

Relay uses **AI SDK v7** as the Gemini transport only — not as the agent framework. Token-oriented optimizations live in the provider adapter:

1. **Stable `instructions` prefix** — System prompt is passed via `instructions`, not as a `system` message in history. This keeps a stable prefix for Gemini implicit caching across tool-loop iterations.
2. **Tool schema memoization** — Built Zod tool schemas are cached by definition fingerprint so repeated iterations do not rebuild identical schemas.
3. **`activeTools`** — Only selected tool names are sent to the model each call (defaults to all registered tools; the loop can subset later as the registry grows).

Per-call usage and latency surface through **`usage.updated`** events (tokens, estimated cost, cache hits, TTFT, tok/s). That is the product metrics path for the terminal and any `@relay/sdk` observer. OpenTelemetry (`@ai-sdk/otel`) is deferred until production deployment — see [todolist.md](../todolist.md).
