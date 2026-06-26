import type { ColorScheme } from "../theme.js";

function detectFromColorFgBg(): ColorScheme | null {
  const value = process.env.COLORFGBG;
  if (!value) return null;
  const parts = value.split(";");
  const bg = parts.length > 1 ? parts[1] : parts[0];
  if (!bg) return null;
  const bgNum = Number(bg);
  if (Number.isNaN(bgNum)) return null;
  return bgNum <= 6 ? "dark" : "light";
}

/** Best-effort terminal background detection. Falls back to dark. */
export function detectTerminalColorScheme(): ColorScheme {
  return detectFromColorFgBg() ?? "dark";
}
