import type { MouseEvent } from "react";

/** Keep focus on the pill input while interacting with settings controls. */
export function keepPillInputFocused(e: MouseEvent) {
  e.preventDefault();
}

export function refocusPillInput(from: EventTarget | null) {
  const stack =
    from instanceof Element ? from.closest(".pill-stack") : null;
  stack?.querySelector<HTMLInputElement>(".pill-input")?.focus();
}
