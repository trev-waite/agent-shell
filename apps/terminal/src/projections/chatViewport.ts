import type { ActivityStatus, ChatMessage, ToolTrace } from "../state.js";
import type { ChatScrollState } from "../state.js";
import type { LayoutConfig } from "../theme.js";
import { EDGE_PADDING } from "../theme.js";
import { truncateToWidth } from "../utils/format.js";
import { tracesForTurn } from "./trace.js";

const TURN_GAP_ROWS = 2;
const INPUT_BOX_ROWS = 3;
const FOOTER_ROWS = 3;
const HEADER_ROWS = 3;
const OFFLINE_BANNER_ROWS = 2;
const FOOTER_MARGIN_ROWS = 1;
const CHAT_MARGIN_ROWS = 1;
const NOTICE_ROWS = 2;
const OVERLAY_ESTIMATE_ROWS = 8;

export interface ChatChromeOptions {
  serverOffline: boolean;
  notice: string | null;
  queueCount: number;
  hasOverlay: boolean;
}

export interface ChatViewport {
  startIndex: number;
  endIndex: number;
  hiddenMessageCount: number;
  maxRows: number;
  scrollTop: number;
  totalRows: number;
  truncateFirstMessageRows: number | null;
  truncateLastMessageRows: number | null;
}

export interface ScrollbarMetrics {
  visible: boolean;
  thumbHeight: number;
  thumbTop: number;
}

export interface ChatViewModel {
  viewport: ChatViewport;
  visibleMessages: ChatMessage[];
  lastUserIndex: number;
  showActivity: boolean;
  hasConversation: boolean;
  scrollbar: ScrollbarMetrics;
  maxScrollOffset: number;
}

export interface ContentLedgerBlock {
  index: number;
  startRow: number;
  rowCount: number;
}

export interface ContentLedger {
  blocks: ContentLedgerBlock[];
  tailActivityRows: number;
  totalRows: number;
}

export function gapBeforeMessage(messages: ChatMessage[], index: number): number {
  if (index === 0) return 0;
  const msg = messages[index]!;
  const prev = messages[index - 1];
  if (msg.role === "user" && (prev?.role === "assistant" || prev?.role === "error")) {
    return TURN_GAP_ROWS;
  }
  return 1;
}

export function computeChromeRows(chrome: ChatChromeOptions): number {
  let rows = EDGE_PADDING * 2;
  rows += HEADER_ROWS;
  if (chrome.serverOffline) rows += OFFLINE_BANNER_ROWS;
  rows += CHAT_MARGIN_ROWS;
  if (chrome.notice) rows += NOTICE_ROWS;
  rows += chrome.queueCount;
  if (chrome.queueCount > 0) rows += 1;
  if (chrome.hasOverlay) rows += OVERLAY_ESTIMATE_ROWS;
  rows += INPUT_BOX_ROWS;
  rows += FOOTER_MARGIN_ROWS;
  rows += FOOTER_ROWS;
  return rows;
}

export function computeChatMaxRows(
  layout: LayoutConfig,
  chrome: ChatChromeOptions,
): number {
  return Math.max(1, layout.rows - computeChromeRows(chrome));
}

export function messageContentWidth(role: ChatMessage["role"], columns: number): number {
  const padding = role === "user" ? 4 : 3;
  return Math.max(1, columns - padding);
}

export function clampScrollOffset(offsetFromBottom: number, maxScrollOffset: number): number {
  return Math.max(0, Math.min(maxScrollOffset, offsetFromBottom));
}

export function computeScrollTop(
  totalRows: number,
  maxRows: number,
  scroll: ChatScrollState,
): number {
  const maxScrollOffset = Math.max(0, totalRows - maxRows);
  if (scroll.followTail) {
    return maxScrollOffset;
  }
  const offset = clampScrollOffset(scroll.offsetFromBottom, maxScrollOffset);
  return Math.max(0, maxScrollOffset - offset);
}

export function computeScrollbarMetrics(
  totalRows: number,
  maxRows: number,
  scrollTop: number,
): ScrollbarMetrics {
  const overflow = totalRows - maxRows;
  if (overflow <= 0) {
    return { visible: false, thumbHeight: maxRows, thumbTop: 0 };
  }

  const thumbHeight = Math.max(1, Math.round((maxRows * maxRows) / totalRows));
  const trackRange = maxRows - thumbHeight;
  const scrollRange = overflow;
  const thumbTop =
    scrollRange > 0 ? Math.round((scrollTop / scrollRange) * trackRange) : 0;

  return { visible: true, thumbHeight, thumbTop };
}

export function buildContentLedger(
  messages: ChatMessage[],
  columns: number,
  traces: ToolTrace[],
  activity: ActivityStatus | null,
  layout: LayoutConfig,
  lastUserIndex = lastUserMessageIndex(messages),
  showActivity = shouldShowActivity(messages, activity),
): ContentLedger {
  const blocks: ContentLedgerBlock[] = [];
  let cursor = 0;

  for (let i = 0; i < messages.length; i++) {
    const rowCount = estimateMessageBlockRows(messages, i, columns, traces, activity, layout, {
      lastUserIndex,
      showActivity,
      includeGap: i > 0,
    });
    blocks.push({ index: i, startRow: cursor, rowCount });
    cursor += rowCount;
  }

  let tailActivityRows = 0;
  if (showActivity && lastUserIndex < 0 && activity !== null) {
    tailActivityRows = estimateTraceFeedRows(traces, 0, activity);
    cursor += tailActivityRows;
  }

  return { blocks, tailActivityRows, totalRows: cursor };
}

export function computeMaxScrollOffset(
  messages: ChatMessage[],
  traces: ToolTrace[],
  activity: ActivityStatus | null,
  layout: LayoutConfig,
  maxRows: number,
  contentColumns = layout.columns,
): number {
  const ledger = buildContentLedger(
    messages,
    contentColumns,
    traces,
    activity,
    layout,
  );
  return Math.max(0, ledger.totalRows - maxRows);
}

export function deriveScrollContext(
  messages: ChatMessage[],
  traces: ToolTrace[],
  activity: ActivityStatus | null,
  layout: LayoutConfig,
  maxRows: number,
  showScrollbar: boolean,
): { maxRows: number; maxScrollOffset: number } {
  const contentColumns = showScrollbar ? layout.columns - 1 : layout.columns;
  return {
    maxRows,
    maxScrollOffset: computeMaxScrollOffset(
      messages,
      traces,
      activity,
      layout,
      maxRows,
      contentColumns,
    ),
  };
}

export function buildChatViewModel(
  messages: ChatMessage[],
  traces: ToolTrace[],
  activity: ActivityStatus | null,
  layout: LayoutConfig,
  maxRows: number,
  scroll: ChatScrollState,
  contentColumns = layout.columns,
): ChatViewModel {
  const lastUserIndex = lastUserMessageIndex(messages);
  const showActivity = shouldShowActivity(messages, activity);
  const ledger = buildContentLedger(
    messages,
    contentColumns,
    traces,
    activity,
    layout,
    lastUserIndex,
    showActivity,
  );
  const maxScrollOffset = Math.max(0, ledger.totalRows - maxRows);
  const scrollTop = computeScrollTop(ledger.totalRows, maxRows, scroll);
  const viewport = selectChatViewportFromScrollTop(
    messages,
    ledger,
    scrollTop,
    maxRows,
    contentColumns,
    traces,
    activity,
    layout,
    lastUserIndex,
    showActivity,
  );

  const visibleMessages = messages.slice(viewport.startIndex, viewport.endIndex + 1);

  return {
    viewport,
    visibleMessages,
    lastUserIndex,
    showActivity,
    hasConversation: messages.length > 0 || showActivity,
    scrollbar: computeScrollbarMetrics(ledger.totalRows, maxRows, scrollTop),
    maxScrollOffset,
  };
}

export function displayMessageContent(
  msg: ChatMessage,
  columns: number,
  truncateTopRows: number | null,
  truncateBottomRows: number | null = null,
): string {
  let content = msg.content;

  if (truncateTopRows !== null) {
    content = truncateContentFromTop(content, messageContentWidth(msg.role, columns), truncateTopRows);
  }
  if (truncateBottomRows !== null) {
    content = truncateContentFromBottom(content, messageContentWidth(msg.role, columns), truncateBottomRows);
  }

  return content;
}

export function showInlineTraceForMessage(
  messages: ChatMessage[],
  index: number,
  lastUserIndex: number,
  traces: ToolTrace[],
  activity: ActivityStatus | null,
  showActivity: boolean,
): boolean {
  const msg = messages[index];
  if (!msg || msg.role !== "user" || index !== lastUserIndex) return false;
  return (
    traces.some((t) => t.startedAt >= msg.timestamp) || (showActivity && activity !== null)
  );
}

// --- viewport internals (exported for tests) ---

export function wrapLineCount(text: string, width: number): number {
  if (width < 1) return 1;
  if (text.length === 0) return 1;
  return Math.ceil(text.length / width);
}

export function estimateContentRows(content: string, width: number): number {
  if (!content) return 0;
  return content.split("\n").reduce((sum, line) => sum + wrapLineCount(line, width), 0);
}

export function selectChatViewportFromScrollTop(
  messages: ChatMessage[],
  ledger: ContentLedger,
  scrollTop: number,
  maxRows: number,
  columns: number,
  traces: ToolTrace[],
  activity: ActivityStatus | null,
  layout: LayoutConfig,
  lastUserIndex: number,
  showActivity: boolean,
): ChatViewport {
  const viewportBottom = scrollTop + maxRows;

  if (messages.length === 0) {
    return {
      startIndex: 0,
      endIndex: -1,
      hiddenMessageCount: 0,
      maxRows,
      scrollTop,
      totalRows: ledger.totalRows,
      truncateFirstMessageRows: null,
      truncateLastMessageRows: null,
    };
  }

  let startIndex = messages.length;
  let endIndex = -1;

  for (const block of ledger.blocks) {
    const blockEnd = block.startRow + block.rowCount;
    if (blockEnd <= scrollTop) continue;
    if (block.startRow >= viewportBottom) break;
    if (startIndex === messages.length) startIndex = block.index;
    endIndex = block.index;
  }

  if (startIndex === messages.length) {
    startIndex = Math.max(0, messages.length - 1);
    endIndex = messages.length - 1;
  }

  const hiddenMessageCount = startIndex;

  let truncateFirstMessageRows: number | null = null;
  const firstBlock = ledger.blocks.find((b) => b.index === startIndex);
  if (firstBlock && firstBlock.startRow < scrollTop) {
    const hiddenRows = scrollTop - firstBlock.startRow;
    const fullRows = estimateMessageBlockRows(
      messages,
      startIndex,
      columns,
      traces,
      activity,
      layout,
      { lastUserIndex, showActivity, includeGap: startIndex > 0, omitInlineTrace: true },
    );
    truncateFirstMessageRows = Math.max(1, fullRows - hiddenRows);
  }

  let truncateLastMessageRows: number | null = null;
  if (endIndex >= 0) {
    const lastBlock = ledger.blocks.find((b) => b.index === endIndex);
    if (lastBlock) {
      const blockEnd = lastBlock.startRow + lastBlock.rowCount;
      if (blockEnd > viewportBottom) {
        const visibleRows = viewportBottom - Math.max(lastBlock.startRow, scrollTop);
        truncateLastMessageRows = Math.max(1, visibleRows);
      }
    }
  }

  return {
    startIndex,
    endIndex,
    hiddenMessageCount,
    maxRows,
    scrollTop,
    totalRows: ledger.totalRows,
    truncateFirstMessageRows,
    truncateLastMessageRows,
  };
}

export function truncateContentFromTop(
  content: string,
  width: number,
  maxRows: number,
): string {
  const lines = content.split("\n");
  const kept: string[] = [];
  let used = 0;

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i] ?? "";
    const lineRows = wrapLineCount(line, width);
    if (used + lineRows > maxRows) {
      const remaining = maxRows - used;
      if (remaining > 0) {
        const chars = remaining * width;
        kept.unshift(`…${line.slice(-Math.max(0, chars - 1))}`);
      }
      break;
    }
    used += lineRows;
    kept.unshift(line);
  }

  if (kept.length === 0) {
    return truncateToWidth(content, width * maxRows);
  }

  if (kept.length < lines.length && !kept[0]?.startsWith("…")) {
    kept[0] = `…${kept[0] ?? ""}`;
  }

  return kept.join("\n");
}

export function truncateContentFromBottom(
  content: string,
  width: number,
  maxRows: number,
): string {
  const lines = content.split("\n");
  const kept: string[] = [];
  let used = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const lineRows = wrapLineCount(line, width);
    if (used + lineRows > maxRows) {
      const remaining = maxRows - used;
      if (remaining > 0) {
        const chars = remaining * width;
        kept.push(`${line.slice(0, Math.max(0, chars - 1))}…`);
      }
      break;
    }
    used += lineRows;
    kept.push(line);
  }

  if (kept.length === 0) {
    return truncateToWidth(content, width * maxRows);
  }

  if (kept.length < lines.length && !kept[kept.length - 1]?.endsWith("…")) {
    kept[kept.length - 1] = `${kept[kept.length - 1] ?? ""}…`;
  }

  return kept.join("\n");
}

function lastUserMessageIndex(messages: ChatMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") return i;
  }
  return -1;
}

function shouldShowActivity(
  messages: ChatMessage[],
  activity: ActivityStatus | null,
): boolean {
  return (
    activity !== null &&
    !messages.some((m) => m.role === "assistant" && m.streaming && m.content.length > 0)
  );
}

function estimateMessageBlockRows(
  messages: ChatMessage[],
  index: number,
  columns: number,
  traces: ToolTrace[],
  activity: ActivityStatus | null,
  layout: LayoutConfig,
  ctx: {
    lastUserIndex: number;
    showActivity: boolean;
    includeGap: boolean;
    omitInlineTrace?: boolean;
  },
): number {
  const msg = messages[index]!;
  const gap = ctx.includeGap ? gapBeforeMessage(messages, index) : 0;
  const showInlineTrace = ctx.omitInlineTrace
    ? false
    : showInlineTraceForMessage(
        messages,
        index,
        ctx.lastUserIndex,
        traces,
        activity,
        ctx.showActivity,
      );

  return (
    gap +
    estimateMessageRows(msg, columns, {
      showInlineTrace,
      traces,
      afterTimestamp: msg.timestamp,
      activity: ctx.showActivity && index === ctx.lastUserIndex ? activity : null,
      layout,
    })
  );
}

function estimateTraceFeedRows(
  traces: ToolTrace[],
  afterTimestamp: number,
  activity: ActivityStatus | null,
): number {
  const turnTraces = tracesForTurn(traces, afterTimestamp);
  let rows = 2;

  rows += turnTraces.length;
  if (activity) rows += 1;
  return rows;
}

function estimateMessageRows(
  msg: ChatMessage,
  columns: number,
  options: {
    showInlineTrace: boolean;
    traces: ToolTrace[];
    afterTimestamp: number;
    activity: ActivityStatus | null;
    layout: LayoutConfig;
  },
): number {
  let rows = 0;

  if (msg.role === "user") {
    rows += estimateContentRows(msg.content, messageContentWidth("user", columns));
    rows += 1;
  } else {
    if (msg.role === "error") rows += 1;
    if (msg.streaming) rows += 1;
    rows += estimateContentRows(msg.content, messageContentWidth("assistant", columns));
  }

  if (options.showInlineTrace) {
    rows += estimateTraceFeedRows(
      options.traces,
      options.afterTimestamp,
      options.activity,
    );
  }

  return rows;
}
