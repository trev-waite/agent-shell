# Development

```bash
bun run build       # Build all packages
bun run typecheck   # Type-check all packages
bun run test        # Invariant tests (storage, runtime, providers, terminal reducer)
bun run dev:server  # Runtime only (direct Bun watch, loads root .env)
bun run dev:terminal # Ink UI only (direct Bun watch)
bun run dev:web      # Browser React UI (Bun dev server + HMR)
bun run dev         # Both via Turborepo (use two terminals instead for daily work)
bun run db:migrate  # Drizzle migrations (optional; server also auto-migrates)
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GEMINI_API_KEY` | — | Google Gemini API key (required, server only) |
| `GEMINI_MODEL` | `gemini-3.1-flash-lite` | Default Gemini model ID (server + terminal fallback) |
| `GEMINI_REASONING` | — | Optional thinking depth: `minimal`, `low`, `medium`, `high`, `none`, or `provider-default` |
| `RELAY_PORT` | `4310` | Runtime server port |
| `RELAY_DB_PATH` | `./data/relay.db` | SQLite database path |
| `RELAY_URL` | `http://localhost:4310` | SDK connection URL (terminal / clients) |
| `RELAY_CORS_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | Comma-separated browser origins allowed to call the API from `@relay/web` (set to your dev server URL if the port differs) |

`.env` must live at the **monorepo root** (`agent-shell/.env`), not inside `apps/server/`. `dev:server` loads it via `bun --env-file=.env`.

See also: [Getting Started](./getting-started.md), [Troubleshooting](./troubleshooting.md)
