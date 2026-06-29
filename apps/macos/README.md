# Relay Mac

> **Work in progress — not production-ready.** This Mac client is an early scaffold on `main`. It connects to the local Relay server (sessions load, health checks pass), but **the chat transcript does not reliably display messages yet**. Expect rough edges; active development continues here.

Native Swift macOS 26 client for Relay. Consumes the existing HTTP+SSE API — no changes to server, runtime, SDK, or terminal.

## Known issues (WIP)

- Message bubbles often do not appear after opening a session or sending a prompt, even when the server returns events.
- Scroll-engine and AppKit/SwiftUI transcript layers are still being debugged.
- Phase 3 scaffolds (bundled server, onboarding) are not wired up.

## Requirements

- macOS 26 (Tahoe)
- Swift 6.2+ (`xcrun swift --version`)

## Build & run

```bash
# Start the Relay server (from repo root)
bun run dev

# Build and launch the Mac app (foreground window)
cd apps/macos
./run.sh
```

Or manually:

```bash
xcrun swift build -c release
.build/release/RelayMac
```

**Recommended:** use `./run.sh` — builds a `RelayMac.app` bundle and opens it. This fixes keyboard focus issues that can happen when running the raw `.build/release/RelayMac` binary from Terminal.

Or open `RelayMac.xcodeproj` in Xcode and **Product → Run** for the best dev experience (breakpoints, previews, proper app lifecycle).

## Architecture

```
RelayMac (SwiftUI + AppKit)  →  HTTP+SSE  →  apps/server
RelayKit/
  RelayModels     — Codable event types
  RelayClient     — REST + SSE client
  RelayState      — Event reducer + ScrollEngine
  RelayProjections — Metrics/footer formatting
```

## Configuration

- Server URL: defaults to `http://127.0.0.1:4310`, overridable in Settings or via `RELAY_URL` UserDefaults key
- API keys stay server-side (`GEMINI_API_KEY` in server env)

## Scroll engineering

The chat transcript targets a `ScrollEngine` follow/detached state machine. Rendering is currently SwiftUI-based while AppKit scroll integration is revisited.

## Future (Phase 3 scaffolds)

- `Infrastructure/ServerManager.swift` — bundled server lifecycle
- `Infrastructure/OnboardingStore.swift` — API key onboarding
- `Infrastructure/DistributionInfo.swift` — signing/distribution metadata
