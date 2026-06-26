export const isMac = process.platform === "darwin";

/** Primary modifier label for footer hints. */
export const modLabel = isMac ? "⌘" : "Ctrl";

export function modHint(key: string, shift = false): string {
  if (isMac) {
    return shift ? `⌘⇧${key.toUpperCase()}` : `⌘${key.toUpperCase()}`;
  }
  return shift ? `Ctrl+Shift+${key.toUpperCase()}` : `Ctrl+${key.toUpperCase()}`;
}
