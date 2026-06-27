import { describe, expect, test } from "bun:test";
import type { ChatMessage } from "./state.js";
import {
  computeChatMaxRows,
  computeChromeRows,
  estimateContentRows,
  selectChatViewport,
  truncateContentFromTop,
  wrapLineCount,
} from "./projections/chatViewport.js";

function msg(
  overrides: Partial<ChatMessage> & Pick<ChatMessage, "id" | "role" | "content">,
): ChatMessage {
  return {
    timestamp: 1,
    streaming: false,
    ...overrides,
  };
}

const layout = {
  mode: "wide" as const,
  columns: 100,
  rows: 36,
  showTraceJson: true,
  metricsColumns: 3 as const,
  showSessionId: true,
};

describe("chatViewport", () => {
  test("wrapLineCount splits long lines by width", () => {
    expect(wrapLineCount("hello", 10)).toBe(1);
    expect(wrapLineCount("hello world!", 5)).toBe(3);
  });

  test("estimateContentRows counts blank lines", () => {
    expect(estimateContentRows("a\n\nb", 20)).toBe(3);
  });

  test("computeChatMaxRows reserves chrome for input and footer", () => {
    const chrome = {
      serverOffline: false,
      notice: null,
      queueCount: 0,
      hasOverlay: false,
    };
    const chromeRows = computeChromeRows(chrome);
    expect(chromeRows).toBeGreaterThan(10);
    expect(computeChatMaxRows(layout, chrome)).toBe(layout.rows - chromeRows);
  });

  test("selectChatViewport keeps recent messages when history overflows", () => {
    const messages: ChatMessage[] = [
      msg({ id: "1", role: "user", content: "short", timestamp: 1 }),
      msg({
        id: "2",
        role: "assistant",
        content: "x".repeat(4000),
        timestamp: 2,
      }),
    ];

    const viewport = selectChatViewport(messages, 8, layout.columns, [], null, layout);
    expect(viewport.startIndex).toBeGreaterThan(0);
    expect(viewport.hiddenMessageCount).toBeGreaterThan(0);
  });

  test("truncateContentFromTop keeps the tail of long content", () => {
    const truncated = truncateContentFromTop("line one\nline two\nline three", 10, 2);
    expect(truncated).toContain("line three");
    expect(truncated.startsWith("…")).toBe(true);
  });
});
