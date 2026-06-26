# Getting Started

**Prerequisites:** [Bun](https://bun.sh) 1.3+, Node 24.16+

```bash
# Install dependencies
bun install

# Configure environment (must live at monorepo root)
cp .env.example .env
# Edit .env and set GEMINI_API_KEY
```

Run the runtime and UI in **two terminals** (recommended):

```bash
# Terminal 1 — runtime server (loads .env, watches for changes)
bun run dev:server

# Terminal 2 — Ink UI (needs a real TTY for keyboard input)
bun run dev:terminal
```

| Script | What it runs |
|--------|----------------|
| `bun run dev:server` | Fastify runtime at `http://127.0.0.1:4310` |
| `bun run dev:terminal` | Ink chat UI (connects via `@relay/sdk`) |
| `bun run dev` | Both via Turborepo — terminal input may not work; prefer two terminals |

Type a prompt and press Enter. Follow-up messages continue the same conversation (full history is sent to the model). Use **/** for a command palette (`/model`, `/trace`, `/metrics`, `/new`, `/help`). Press **Tab** or **⌘O** (Ctrl+O on Linux) to open the model picker. If the agent is still replying, your next message is **queued** and shown above the input bar until it sends. Tool activity appears inline under your message; open **/trace** or **/metrics** for full detail in overlay panels above the input. Press **Esc** to close overlays, then exit; **Ctrl+C** quits immediately.

## Terminal controls

| Key | Action |
|-----|--------|
| Enter | Send prompt (works with trace/metrics overlays open) |
| `/` | Slash command palette — `/model`, `/trace`, `/metrics`, `/theme`, `/new`, `/help` |
| Tab / ⌘O (Ctrl+O) | Open model picker overlay |
| ↑↓ | Navigate slash palette or model list |
| ←→ | Switch provider tab (model picker) |
| `]` / `[` | Expand / collapse focused trace item (trace overlay) |
| ⌘⇧T / ⌘⇧M | Toggle trace / metrics overlay |
| Esc | Close top overlay, or exit when none open |
| Ctrl+C | Exit terminal (server keeps running) |

## Multi-turn conversations

The terminal keeps one **session** alive across prompts. The first message calls `POST /sessions`; follow-ups call `POST /sessions/:id/messages`, which loads the latest checkpoint and appends your new user message to the ReAct loop history.

Use **`/new`** to clear the UI, cancel any in-flight work on the current session, and start a fresh session on the next send. Model and theme preferences are preserved.

While the agent is thinking, streaming, or running tools, additional prompts are **queued** (highlighted above the input) and sent automatically when the current turn finishes.

**Token cost grows with history** — Each follow-up reloads the latest checkpoint and sends the full conversation (system prompt, tools, and all prior user/assistant/tool messages) to the model. Input tokens and cost per turn increase as the thread gets longer; header metrics show cumulative session spend. Use `/new` when you no longer need prior context.

## Replay a previous session

```bash
bun run apps/terminal/src/index.tsx --session <session-id>
```

## Resume from a checkpoint

After a failed or cancelled run, re-execute from the last saved checkpoint (or a specific one):

```bash
# List checkpoints for a session
curl http://127.0.0.1:4310/sessions/<session-id>/checkpoints

# Resume from latest checkpoint (same session id)
curl -X POST http://127.0.0.1:4310/sessions/<session-id>/rerun

# Resume from a specific checkpoint
curl -X POST http://127.0.0.1:4310/sessions/<session-id>/rerun \
  -H 'Content-Type: application/json' \
  -d '{"checkpointId":"<checkpoint-id>"}'
```

Then attach with the terminal replay command above, or use `client.rerun()` + `client.subscribe()` from the SDK.

## Continue a conversation (follow-up message)

Send another user message on an existing session without starting over:

```bash
curl -X POST http://127.0.0.1:4310/sessions/<session-id>/messages \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"What did I just ask?"}'
```

The runtime restores the latest checkpoint, appends the new user message, and runs the ReAct loop with full prior context. Returns `{ sessionId }` (same id).

See also: [Event Sourcing](./event-sourcing.md#replay-vs-rerun-vs-continue), [SDK](./sdk.md), [Troubleshooting](./troubleshooting.md)
