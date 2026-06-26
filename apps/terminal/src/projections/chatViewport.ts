import type { ChatMessage } from "../state.js";

/** Blank rows between conversation turns. */
export const TURN_GAP_ROWS = 2;

export function gapBeforeMessage(messages: ChatMessage[], index: number): number {
  if (index === 0) return 0;
  const msg = messages[index]!;
  const prev = messages[index - 1];
  if (msg.role === "user" && (prev?.role === "assistant" || prev?.role === "error")) {
    return TURN_GAP_ROWS;
  }
  return 1;
}
