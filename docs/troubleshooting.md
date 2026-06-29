# Troubleshooting

| Issue | Fix |
|-------|-----|
| `GEMINI_API_KEY environment variable is required` | Ensure `.env` is at repo root with `GEMINI_API_KEY=...` (no spaces around `=`). Restart the server after editing. |
| `Invalid task configuration` / Turbo TUI error on `dev:server` | Use the current `dev:server` script (direct Bun, not Turbo) or upgrade/pull latest |
| Port already in use | Change `RELAY_PORT` in `.env` and set `RELAY_URL` to match |
| Can't type in terminal UI | Use `bun run dev:terminal` in its own terminal — Ink needs a direct TTY |
| Stream shows **standby** | Normal before your first prompt |
| Stream shows **disconnected** | Start runtime with `bun run dev:server` first; header status dot turns green when ready |
| Trace/metrics overlay blocks typing | Overlays stay open while you type; press Esc to dismiss |
| Chat won't scroll / Fn+↑ scrolls terminal | Use **↑↓** (line, empty prompt), **Ctrl+U/D** (page), **Ctrl+A/E** (top/bottom). See [Getting Started — Chat scroll](./getting-started.md#chat-scroll). |
| Queued message not sending | Wait for the current turn to finish (status shows DONE), or use `/new` to cancel and reset |
