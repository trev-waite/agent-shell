# UI north star — `@relay/web`

One page to review any UI change against. Detail lives in linked docs; this is the contract.

---

## Principle

**The conversation is the product.** Everything else — agent work, chrome, navigation — should stay quiet until the reader asks for it.

---

## 1. Conversation

| Do | Don't |
|----|--------|
| User messages as soft bubbles; assistant as plain text | Avatars, timestamps, role labels, chat chrome |
| One accent color (`--accent`) for motion and focus affordances | Gradients, badges, or decorative color everywhere |
| Token-driven spacing, radii, surfaces | Magic numbers, one-off colors |
| Fluid motion on entry (morph, spring) | Bouncy loaders, typing dots, “AI is thinking” banners |
| Sentence-case, human copy | Uppercase micro-labels, marketing lead lines |

**Home → composer:** the input pill stays centered. On send, the user message lifts above the pill (shared-layout morph); the agent reply appears compact beneath it (~3 lines). Prior turns fade into a queue below the active turn. Each composer send starts a new session (one-and-done rapid-fire). Tap any turn to open the full transcript with a bottom-dock input for follow-ups.

---

## 2. Agent work

Agent activity is **in the stream**, not on top of it — but still easy to ignore.

| State | Treatment |
|-------|-----------|
| **Thinking** | Small inline text where the reply will land; soft left-to-right shine |
| **Tools** | Muted left-border block: tool name + **~3 lines** of output; tap **Show more** to expand |
| **Running tool** | Same block, clamped preview or “Running…” — no expand until complete |
| **Streaming reply** | Plain assistant text; thinking hidden once tokens arrive |

Tool blocks use `--text-secondary` / monospace at small size. They must not dominate the transcript.

The dither sphere on the input pill is the **only** persistent animated accent during a turn.

---

## 3. Scroll

**Never move the reader against their intent.**

Full rules: [SCROLL_ENGINEERING.md](./SCROLL_ENGINEERING.md). Summary:

1. No default auto-scroll — follow only at the **live edge**
2. New user turn → placed **near top** with prior context visible
3. Stream grows **off-screen** when the reader has scrolled away
4. **Jump to latest** only when agent content exists below and the reader isn’t at the bottom
5. Selection, keyboard, and scroll-up break follow mode

---

## 4. Chrome & navigation

| Pattern | Use |
|---------|-----|
| `ChromeSafeFixed` | Bottom dock, fixed bars |
| `Overlay` | Side drawers (sessions left, settings right) |
| Edge handles | Top of screen; swipe from edge on mobile |

Sessions: **horizontal agent carousel** (proximity scroll on web, swipe on mobile) → flat thread list for the selected agent only (no per-model sections).

Settings: same drawer pattern as sessions — no corner popovers.

Panels fully **unmount** when closed (Safari Liquid Glass).

---

## 5. Review checklist

Before shipping UI:

- [ ] Does this add noise to the transcript?
- [ ] Can the reader ignore it while reading an older turn?
- [ ] Does scroll respect live-edge / follow mode?
- [ ] Mobile-safe (safe areas, touch targets, no blocked inputs)?
- [ ] Uses tokens and existing primitives — no new one-off patterns?

---

## Related docs

- [SCROLL_ENGINEERING.md](./SCROLL_ENGINEERING.md) — scroll rules 1–15
- [SAFARI_CHROME.md](./SAFARI_CHROME.md) — fixed UI & overlays
- [BEST_PRACTICES.md](./BEST_PRACTICES.md) — stack, SDK, project setup
