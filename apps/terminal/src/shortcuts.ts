/**
 * Canonical keyboard shortcuts for the Ink TUI.
 * Verified on macOS Terminal.app — use Control (^), not Command (⌘).
 * Letter keys are mnemonic where possible: S session, T theme, U/D page, A/E top/bottom, B scrollbar.
 * Model picker uses Ctrl+O (works reliably in macOS Terminal.app).
 */

export function keyboardHelp(): string {
  return [
    "Ctrl+O or Tab — model picker",
    "Ctrl+S — session panel (trace + metrics)",
    "Ctrl+T — cycle theme",
    "Esc — close overlay, or exit",
    "Ctrl+C — quit",
    "Scroll: ↑↓ line (empty prompt) · Ctrl+U/D page · Ctrl+A/E top/bottom · Ctrl+B scrollbar",
  ].join(" · ");
}

export function fullHelp(slashCommandsLine: string): string {
  return `${slashCommandsLine}\n${keyboardHelp()}`;
}
