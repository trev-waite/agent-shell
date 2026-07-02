import type { ReactNode } from "react";

/**
 * The only sanctioned way to render position:fixed UI in this app.
 *
 * Safari 26 Liquid Glass derives its toolbar tint from `background-color` /
 * `backdrop-filter` on fixed or sticky elements near the viewport edges — so
 * the fixed wrapper here is guaranteed transparent, and all visuals (the
 * `surface` slot) are rendered on a position:absolute child, which Safari's
 * tinting algorithm ignores. Safe-area padding is built into the wrapper.
 *
 * Do not write raw `position: fixed` in components; compose this instead.
 * See apps/web/docs/SAFARI_CHROME.md.
 */
export function ChromeSafeFixed({
  edge,
  surface,
  children,
  className,
}: {
  edge: "bottom";
  /** Visual layer (background, gradient, blur) — rendered as absolute child. */
  surface?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`chrome-fixed chrome-fixed-${edge}${className ? ` ${className}` : ""}`}
    >
      {surface !== undefined && (
        <div className="chrome-fixed-surface" aria-hidden="true">
          {surface}
        </div>
      )}
      <div className="chrome-fixed-content">{children}</div>
    </div>
  );
}
