# Event Sourcing

Every state change is an **append-only, immutable event**:

| Field | Description |
|-------|-------------|
| `id` | ULID (sortable, unique) |
| `sessionId` | Execution container |
| `type` | Event kind |
| `timestamp` | Epoch milliseconds |
| `payload` | Typed event data |

**Event types:** `message.started`, `token.streamed`, `tool.started`, `tool.completed`, `checkpoint.saved`, `cost.updated`, `message.completed`, `error`

Session status (`idle`, `running`, `paused`, `completed`, `failed`, `cancelled`) is **derived from events only** — never stored as authoritative state.

## Replay vs rerun vs continue

| | Replay | Continue (`/messages`) | Rerun (resume) |
|---|--------|------------------------|----------------|
| **What** | Stream historical events from SQLite | Append a new user message and run the loop | Re-execute from a checkpoint |
| **Re-executes LLM?** | No | Yes | Yes |
| **New user message?** | No | Yes | No (restores mid-turn state) |
| **Use case** | UI reconnect, audit, crash recovery view | Multi-turn chat | Resume after error, cancel, or max-iterations |

**Checkpoints** are saved automatically after each tool-loop iteration (and on completion). Each `checkpoint.saved` event carries the full message history and iteration count. `continue` and `rerun` both restore from the latest checkpoint; `continue` appends a new user turn and resets the per-turn tool iteration budget, while `rerun` resumes mid-turn without re-emitting the original user message.

Replay reconstructs state **only from events**. No hidden state. Kill the server, restart it, replay a session — the transcript matches exactly.
