import { describe, expect, test } from "bun:test";
import type { ChatMessage } from "./state.js";
import { initialChatScroll } from "./state.js";
import {
  DETACHED_HISTORY_BANNER_ROWS,
  buildContentLedger,
  buildChatViewModel,
  clampScrollOffset,
  computeChatMaxRows,
  computeChromeRows,
  computeScrollbarMetrics,
  computeScrollTop,
  displayMessageContent,
  estimateContentRows,
  selectChatViewportFromScrollTop,
  truncateContentFromBottom,
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

  test("buildChatViewModel keeps recent messages when history overflows", () => {
    const messages: ChatMessage[] = [
      msg({ id: "1", role: "user", content: "short", timestamp: 1 }),
      msg({
        id: "2",
        role: "assistant",
        content: "x".repeat(4000),
        timestamp: 2,
      }),
    ];

    const view = buildChatViewModel(messages, [], null, layout, 8, initialChatScroll);
    expect(view.viewport.startIndex).toBeGreaterThan(0);
    expect(view.viewport.hiddenMessageCount).toBeGreaterThan(0);
  });

  test("truncateContentFromTop keeps the tail of long content", () => {
    const truncated = truncateContentFromTop("line one\nline two\nline three", 10, 2);
    expect(truncated).toContain("line three");
    expect(truncated.startsWith("…")).toBe(true);
  });

  test("truncateContentFromBottom keeps the head of long content", () => {
    const truncated = truncateContentFromBottom("line one\nline two\nline three", 10, 2);
    expect(truncated).toContain("line one");
    expect(truncated.endsWith("…")).toBe(true);
  });

  test("displayMessageContent slices middle of a long single message", () => {
    const columns = 13;
    const width = 10;
    const lines = Array.from({ length: 20 }, (_, i) => `line-${String(i).padStart(2, "0")}`);
    const content = lines.join("\n");
    const totalRows = estimateContentRows(content, width);
    const skipRows = 5;
    const keepRows = 4;

    const result = displayMessageContent(
      msg({ id: "1", role: "assistant", content }),
      columns,
      totalRows - skipRows,
      keepRows,
    );

    expect(result).toContain("line-05");
    expect(result).toContain("line-08");
    expect(result).not.toContain("line-04");
    expect(result).not.toContain("line-09");
  });

  test("scrolled long single message shows middle content", () => {
    const content = Array.from({ length: 30 }, (_, i) => `row-${String(i).padStart(2, "0")}`).join("\n");
    const messages: ChatMessage[] = [
      msg({ id: "1", role: "assistant", content, timestamp: 1 }),
    ];
    const maxRows = 6;
    const tailView = buildChatViewModel(messages, [], null, layout, maxRows, initialChatScroll);
    const midOffset = Math.max(2, Math.floor(tailView.maxScrollOffset / 2));
    const midView = buildChatViewModel(messages, [], null, layout, maxRows, {
      followTail: false,
      offsetFromBottom: midOffset,
    });

    expect(midView.visibleMessages).toHaveLength(1);
    expect(midView.viewport.truncateFirstMessageRows).not.toBeNull();
    expect(midView.viewport.truncateLastMessageRows).not.toBeNull();
    const shown = displayMessageContent(
      midView.visibleMessages[0]!,
      layout.columns,
      midView.viewport.truncateFirstMessageRows,
      midView.viewport.truncateLastMessageRows,
    );
    expect(shown).toContain("row-");
    expect(shown).not.toBe("");
  });

  test("followTail scrollTop pins to bottom", () => {
    const messages: ChatMessage[] = [
      msg({ id: "1", role: "user", content: "a".repeat(500), timestamp: 1 }),
      msg({ id: "2", role: "assistant", content: "b".repeat(500), timestamp: 2 }),
    ];
    const ledger = buildContentLedger(messages, layout.columns, [], null, layout);
    const maxRows = 10;
    const scrollTop = computeScrollTop(ledger.totalRows, maxRows, initialChatScroll);
    expect(scrollTop).toBe(Math.max(0, ledger.totalRows - maxRows));
  });

  test("scrolling up reveals earlier messages", () => {
    const messages: ChatMessage[] = [
      msg({ id: "1", role: "user", content: "first", timestamp: 1 }),
      msg({ id: "2", role: "assistant", content: "y".repeat(800), timestamp: 2 }),
      msg({ id: "3", role: "user", content: "last", timestamp: 3 }),
    ];
    const maxRows = 8;
    const tailView = buildChatViewModel(messages, [], null, layout, maxRows, initialChatScroll);
    const scrolledView = buildChatViewModel(messages, [], null, layout, maxRows, {
      followTail: false,
      offsetFromBottom: tailView.maxScrollOffset,
    });
    expect(scrolledView.viewport.startIndex).toBeLessThan(tailView.viewport.startIndex);
    expect(scrolledView.viewport.hiddenMessageCount).toBe(0);
  });

  test("detached banner reserves rows from content budget", () => {
    const messages: ChatMessage[] = [
      msg({ id: "1", role: "user", content: "first", timestamp: 1 }),
      msg({ id: "2", role: "assistant", content: "y".repeat(800), timestamp: 2 }),
      msg({ id: "3", role: "user", content: "last", timestamp: 3 }),
    ];
    const maxRows = 10;
    const tailView = buildChatViewModel(messages, [], null, layout, maxRows, initialChatScroll);
    const scrolledView = buildChatViewModel(messages, [], null, layout, maxRows, {
      followTail: false,
      offsetFromBottom: Math.max(2, Math.floor(tailView.maxScrollOffset / 2)),
    });

    expect(scrolledView.viewport.hiddenMessageCount).toBeGreaterThan(0);
    expect(scrolledView.viewport.maxRows).toBe(maxRows - DETACHED_HISTORY_BANNER_ROWS);
  });

  test("clampScrollOffset stays within bounds", () => {
    expect(clampScrollOffset(50, 20)).toBe(20);
    expect(clampScrollOffset(-5, 20)).toBe(0);
  });

  test("computeScrollbarMetrics hides when content fits", () => {
    const metrics = computeScrollbarMetrics(5, 10, 0);
    expect(metrics.visible).toBe(false);
  });

  test("computeScrollbarMetrics positions thumb on overflow", () => {
    const metrics = computeScrollbarMetrics(100, 10, 45);
    expect(metrics.visible).toBe(true);
    expect(metrics.thumbHeight).toBeGreaterThanOrEqual(1);
    expect(metrics.thumbTop).toBeGreaterThanOrEqual(0);
    expect(metrics.thumbTop + metrics.thumbHeight).toBeLessThanOrEqual(10);
  });

  test("selectChatViewportFromScrollTop truncates at top and bottom", () => {
    const messages: ChatMessage[] = [
      msg({ id: "1", role: "user", content: "one", timestamp: 1 }),
      msg({ id: "2", role: "assistant", content: "z".repeat(1200), timestamp: 2 }),
      msg({ id: "3", role: "user", content: "three", timestamp: 3 }),
    ];
    const ledger = buildContentLedger(messages, layout.columns, [], null, layout);
    const maxRows = 6;
    const scrollTop = 3;
    const viewport = selectChatViewportFromScrollTop(
      messages,
      ledger,
      scrollTop,
      maxRows,
      layout.columns,
      [],
      null,
      layout,
      2,
      false,
    );
    expect(viewport.startIndex).toBeGreaterThanOrEqual(0);
    expect(viewport.endIndex).toBeGreaterThanOrEqual(viewport.startIndex);
  });
});
