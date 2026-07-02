# Scroll Engineering — Streaming Chat

**Principle:** Never move the reader against their intent.

These rules govern how `@relay/web` handles conversation scroll, streaming updates, and transcript navigation. Full reference for implementers and agents working on chat UI.

---

## Core contract

### 1. Move only when the reader asked to move

If someone is reading, don't pull them somewhere else. Auto-scroll should never be the default.

### 2. Follow only while they're following

If they're at the live edge, keep the stream in view. If they scroll away, leave them there.

### 3. Every interaction is intent

Scrolling is not the only signal. Selecting text, using the keyboard, opening a link, or searching should all stop the interface from moving.

---

## Turn layout

### 4. Start a new turn near the top of the viewport

This gives the new turn somewhere it can be read from the beginning.

### 5. Then stream in the answer

The streaming answer can then grow into the available space.

### 6. Keep part of the previous conversation in context

Enough of the previous turn should remain visible so the reader knows where they are.

---

## Off-screen streaming

### 7. Let new content arrive offscreen

The conversation can keep streaming without changing what the reader is looking at.

### 8. Show what's happening out of view

Make it clear when a response is still streaming or when new messages have arrived.

### 9. Make it easy to return to the latest reply

A **Jump to latest** action should bring the reader back and resume following.

---

## Navigation & persistence

### 10. Let people jump anywhere in the conversation

Long threads need message links, search, unread markers, and direct navigation.

### 11. Reopen where the reader left off

A saved conversation should open at the last meaningful turn — usually the last user message, not the absolute bottom.

### 12. Keep the reader's place when layout changes

Images load. Markdown expands. Code blocks render. Older messages appear above. None of that should make the reader lose their place.

---

## Interruptions & scale

### 13. Handle interruptions without stealing position

Stopping, retrying, regenerating, branching, or errors should not unexpectedly move the conversation.

### 14. Stay responsive in long threads

Streaming text, markdown, code, images, and long history should still feel responsive.

### 15. Be accessible without the noise

Keep the transcript navigable, preserve keyboard focus, and announce important events at a comfortable pace.

---

## Implementation notes

| Concern | Where it lives |
|---------|----------------|
| Scroll container | `.conversation` in `src/styles/components.css` |
| Message list | `src/components/Conversation.tsx` |
| Streaming state | `streaming` flag on `ChatMessage` in `src/state.ts` |

**Follow mode** is the central abstraction: track whether the reader is pinned to the live edge (`isFollowing`). Only auto-scroll when `isFollowing` is true. Any deliberate reader action clears it; **Jump to latest** restores it.

**New-turn placement** (rules 4–6): on `USER_PROMPT`, scroll the new user message to ~top of viewport with previous context visible — not `scrollIntoView({ block: "end" })` on every token.

**Layout stability** (rule 12): prefer `overflow-anchor: auto` on the scroll container; for dynamic content (images, code blocks), record scroll anchor or use `ResizeObserver` to compensate height deltas above the viewport.

See also [UI_NORTH_STAR.md](./UI_NORTH_STAR.md), [BEST_PRACTICES.md](./BEST_PRACTICES.md), and [SAFARI_CHROME.md](./SAFARI_CHROME.md).
