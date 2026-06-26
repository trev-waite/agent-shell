# Security

Relay is a **local-first dev tool** (like Cursor or Claude Code): the agent runs on your machine with broad filesystem access by design. The runtime binds `127.0.0.1` only — not exposed to the network by default. There is no auth layer in the MVP; that is acceptable for solo local use.

- API keys and secrets stay in the server process; clients never receive them
- Tool inputs/outputs are sanitized before storage and before LLM context
- Events are safe to replay in any environment
- `file.read` blocks `.env` files and path traversal via symlinks (light guardrails, not a sandbox)
- `shell.exec` is allowlisted (`pwd`, `ls`, `cat` only) with a minimal spawn environment
