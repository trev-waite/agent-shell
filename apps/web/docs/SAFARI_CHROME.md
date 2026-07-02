# Safari 26 Liquid Glass rules

Safari 26 tints its translucent chrome (status bar, URL/tab bar) by sampling
`background-color` and `backdrop-filter` from `position: fixed`/`sticky`
elements near the viewport edges, falling back to the `html`/`body`
background. It samples hidden elements too (`opacity: 0`,
`pointer-events: none`), and it ignores `theme-color` entirely.

This app encodes the rules once, so components stay compliant by default.

## Set once in the shell (do not repeat, do not undo)

- `viewport-fit=cover` in the viewport meta ([src/index.html](../src/index.html)).
- Explicit `background-color` on `html` and `body` from theme tokens — never
  transparent roots ([src/styles/base.css](../src/styles/base.css)).
- `html` stays scrollable; the scroll container is inside the `100dvh`
  `.shell`. Never set `body { overflow: hidden }`.
- Safe-area insets are composed into `--inset-*` tokens
  ([src/styles/tokens.css](../src/styles/tokens.css)).

## Build on the two primitives

- **Fixed/sticky UI** (bars, docks, toasts): use
  [`ChromeSafeFixed`](../src/components/chrome/ChromeSafeFixed.tsx). The fixed
  wrapper is transparent; visuals go in its `surface` slot (an absolute child
  Safari ignores).
- **Panels/drawers/modals**: use
  [`Overlay`](../src/components/chrome/Overlay.tsx). It fully unmounts when
  closed (equivalent to `display: none`) and blurs `[data-app-content]` at the
  source, which is the only blur that reaches the iOS keyboard accessory gap.

## Never do this

- Raw `position: fixed`/`sticky` with a `background-color` or
  `backdrop-filter` on the element itself.
- Hiding fixed overlays with `opacity: 0` / `visibility: hidden` — unmount
  them (or `display: none`) instead.
- Transparent `html`/`body` backgrounds (Safari falls back to white).
- Relying on `theme-color` for toolbar tinting.
