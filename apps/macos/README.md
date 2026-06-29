# Relay Mac

Native Swift macOS 26 client for Relay. Consumes the existing HTTP+SSE API — no changes to server, runtime, SDK, or terminal.

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

The chat transcript uses AppKit `NSScrollView` with a `ScrollEngine` state machine implementing follow-mode / detached reading. See the plan appendix for the 15-rule QA checklist.

## Future (Phase 3 scaffolds)

- `Infrastructure/ServerManager.swift` — bundled server lifecycle
- `Infrastructure/OnboardingStore.swift` — API key onboarding
- `Infrastructure/DistributionInfo.swift` — signing/distribution metadata
