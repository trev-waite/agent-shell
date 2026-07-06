# Best practices — `@relay/web`

**Generated:** 2026-07-01

This file reflects guidance and library versions **as of the date above**. Regenerate it (re-run the research step) if the project sits untouched for a long time or before adding a major dependency — React, Bun, and ecosystem guidance drift quickly.

## Current state

### What this app is

`@relay/web` is a **browser UI entry point** for Relay — the same architectural role as `apps/terminal`, but rendered in the DOM instead of Ink. It depends only on:

| Package | Version | Role |
|---------|---------|------|
| `react` / `react-dom` | ^19.2.7 | UI runtime ([React 19.2](https://react.dev/versions) is current stable) |
| `motion` | ^12 | Shared-layout morphs, ambient transitions |
| `@paper-design/shaders-react` | ^0.0.76 | Agent orb accent (GemSmoke + LiquidMetal) |
| `@relay/sdk` | workspace | HTTP + SSE client to the runtime server |
| `@relay/types` | workspace | Typed `RelayEvent` payloads from the SDK |

Safari 26 Liquid Glass rules and the `ChromeSafeFixed` / `Overlay` primitives are documented in [SAFARI_CHROME.md](./SAFARI_CHROME.md).

Streaming chat scroll behavior is governed by [SCROLL_ENGINEERING.md](./SCROLL_ENGINEERING.md). UI concept and review checklist: [UI_NORTH_STAR.md](./UI_NORTH_STAR.md).

It must **not** import `@relay/runtime`, `@relay/storage`, or provider packages. Execution stays in `apps/server`; this app **projects** events into UI state.

### Bun + React setup

Scaffolded with `bun init --react` and trimmed to a **static client**:

- `src/index.ts` — Bun dev server with HMR (no demo API routes; Relay API lives in `apps/server`)
- `src/frontend.tsx` — React mount + hot reload entry
- `src/client.ts` — shared `createClient()` instance
- `bun dev` — development with hot reload
- `bun run build` — static browser bundle to `dist/`

Browser env: set `BUN_PUBLIC_RELAY_URL` to override the SDK default (`http://localhost:4310`). Bun inlines `BUN_PUBLIC_*` vars at dev/build time (`bunfig.toml` + build `--env` flag).

See [Bun React guide](https://bun.com/docs/guides/ecosystem/react).

### React 19 notes

- Prefer **derived values during render** over syncing props/state in `useEffect`.
- Use `useEffect` only for **external synchronization**: SSE subscriptions, timers, DOM listeners, third-party widgets — not for transforming data you already have in props/state.
- When projecting `@relay/sdk` events, a `useReducer` (as in the terminal) or small store is usually enough before reaching for global state libraries.

Official references: [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect), [React 19 blog](https://react.dev/blog/2024/12/05/react-19).

### Vercel React best practices (optional)

Vercel publishes agent-oriented performance rules in [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) (`vercel-react-best-practices`). Relevant even for a static SPA: avoid async waterfalls, keep bundles lean, and don't fetch in effect chains when a dedicated data layer fits better.

### Relay SDK usage (when you add logic)

Follow `docs/sdk.md` in the monorepo root. Typical flow:

1. `relayClient.send({ prompt })` → `{ sessionId }`
2. `relayClient.subscribe({ sessionId, onEvent })` → live SSE
3. Project `RelayEvent` into React state; call `unsubscribe()` on unmount

The skeleton imports `./client` from `App.tsx` so the dependency is wired; no projections yet.

---

## Adding this later

### Adding routing

**When:** More than one real view (e.g. chat + settings + session list).

**Options (mid-2026):**

| Library | Version | Notes |
|---------|---------|-------|
| [React Router](https://reactrouter.com/) | 7.x | De facto standard; `createBrowserRouter` + route objects |
| [TanStack Router](https://tanstack.com/router) | 1.x | Type-safe routes; heavier setup |

**Install (React Router example):**

```bash
cd apps/web && bun add react-router-dom
```

**Minimal structure:**

```
src/
  routes/
    root.tsx      # layout + <Outlet />
    chat.tsx
  router.tsx      # createBrowserRouter([...])
  frontend.tsx    # <RouterProvider router={router} />
```

**Practices:** lazy-load route modules with `React.lazy` + `Suspense` once routes grow; keep route components thin and push Relay projection logic into hooks or reducers.

---

### Adding global state (Zustand)

**When:** Cross-cutting UI state used in unrelated parts of the tree — active session id, panel layout, theme, queue — not for server/event data that already lives in a reducer.

**Version:** [Zustand](https://github.com/pmndrs/zustand) **5.0.14** (npm)

```bash
cd apps/web && bun add zustand
```

**Pattern:**

```typescript
// src/state/session.ts
import { create } from "zustand";

interface SessionUiState {
  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;
}

export const useSessionUi = create<SessionUiState>((set) => ({
  activeSessionId: null,
  setActiveSessionId: (id) => set({ activeSessionId: id }),
}));
```

Keep stores **small and focused**. Leave message/transcript projection in a dedicated reducer unless multiple routes need the same slice.

---

### Adding a data-fetching library (TanStack Query)

**When:** You need caching, retries, staleness, or deduplication **beyond** what `@relay/sdk` SSE already gives you — e.g. REST metadata, model lists, or non-streaming endpoints.

**Do not** replace `relayClient.subscribe` with Query for the live event stream; SSE is the source of truth for agent turns.

**Version:** [@tanstack/react-query](https://tanstack.com/query) **5.x** (check npm for latest patch)

```bash
cd apps/web && bun add @tanstack/react-query
```

Wrap the app in `QueryClientProvider`. Example for `listModels()`:

```typescript
import { useQuery } from "@tanstack/react-query";
import { relayClient } from "@/client";

export function useModels() {
  return useQuery({
    queryKey: ["models"],
    queryFn: () => relayClient.listModels(),
    staleTime: 60_000,
  });
}
```

Avoid fetch waterfalls: colocate queries in the components that need them, or prefetch in route loaders when you add a router.

---

### Adding a testing setup

**When:** You add reducers, hooks, or components worth regression-testing.

**Bun test** works for pure TS (reducers, event projections) without extra deps:

```bash
bun test apps/web/src
```

For DOM components, add [@testing-library/react](https://testing-library.com/docs/react-testing-library/intro/) + [happy-dom](https://github.com/capricorn86/happy-dom) (or jsdom) and configure in `bunfig.toml` / a small test setup file. Mirror patterns from `apps/terminal/src/*.test.ts` for reducer-style tests first.

---

### Introducing a feature-folder structure

**When:** Roughly **2+ distinct features** (e.g. `chat`, `sessions`, `settings`) with multiple components each.

**Migration:** move from flat `src/components/` to:

```
src/features/chat/
  components/
  hooks/
  projections/
src/features/sessions/
  ...
```

Keep `src/client.ts` and shared primitives at `src/` root. Align feature boundaries with how `apps/terminal` splits projections — same event shapes, different renderer.

---

### Styling (Tailwind / component libraries)

Not included in the skeleton. If you add styling:

```bash
bun init --react=tailwind   # greenfield only; or follow Tailwind + Bun docs
```

Or add [shadcn/ui](https://ui.shadcn.com/) on top of Tailwind for accessible primitives. Update this doc's "Current state" table when you pick a stack.
