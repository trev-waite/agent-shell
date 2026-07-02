/** Lines shown before the user can expand tool output. */
export const TOOL_PREVIEW_LINES = 3;
export const TOOL_PREVIEW_MAX_CHARS = 140;

export function formatToolOutput(output: unknown): string {
  if (output === null || output === undefined) return "";
  if (typeof output === "string") return output;
  try {
    return JSON.stringify(output, null, 2);
  } catch {
    return String(output);
  }
}

export function toolOutputIsExpandable(text: string): boolean {
  if (!text.trim()) return false;
  const lineCount = text.split(/\r?\n/).length;
  return lineCount > TOOL_PREVIEW_LINES || text.length > TOOL_PREVIEW_MAX_CHARS;
}
