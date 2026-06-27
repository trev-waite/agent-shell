import type { ActivityStatus, ChatMessage, ToolTrace } from "../state.js";
import type { LayoutConfig } from "../theme.js";
import { EDGE_PADDING } from "../theme.js";
import {
  truncateToWidth,
} from "../utils/format.js";
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
const HIDDEN_HISTORY_INDICATOR_ROWS = 1;

export interface ChatChromeOptions {
  serverOffline: boolean;
  notice: string | null;
  queueCount: number;
  hasOverlay: boolean;
}

export interface ChatViewport {
  startIndex: number;
  hiddenMessageCount: number;
  maxRows: number;
  truncateFirstMessageRows: number | null;
}

export interface ChatViewModel {
  viewport: ChatViewport;
  visibleMessages: ChatMessage[];
  lastUserIndex: number;
  showActivity: boolean;
  hasConversation: boolean;
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

export function buildChatViewModel(
  messages: ChatMessage[],
  traces: ToolTrace[],
  activity: ActivityStatus | null,
  layout: LayoutConfig,
  maxRows: number,
): ChatViewModel {
  const lastUserIndex = lastUserMessageIndex(messages);
  const showActivity = shouldShowActivity(messages, activity);
  const viewport = selectChatViewport(
    messages,
    maxRows,
    layout.columns,
    traces,
    activity,
    layout,
    lastUserIndex,
    showActivity,
  );

  return {
    viewport,
    visibleMessages: messages.slice(viewport.startIndex),
    lastUserIndex,
    showActivity,
    hasConversation: messages.length > 0 || showActivity,
  };
}

export function displayMessageContent(
  msg: ChatMessage,
  columns: number,
  truncateRows: number | null,
): string {
  if (truncateRows === null) return msg.content;
  return truncateContentFromTop(
    msg.content,
    messageContentWidth(msg.role, columns),
    truncateRows,
  );
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

export function selectChatViewport(
  messages: ChatMessage[],
  maxRows: number,
  columns: number,
  traces: ToolTrace[],
  activity: ActivityStatus | null,
  layout: LayoutConfig,
  lastUserIndex = lastUserMessageIndex(messages),
  showActivity = shouldShowActivity(messages, activity),
): ChatViewport {
  if (messages.length === 0) {
    return { startIndex: 0, hiddenMessageCount: 0, maxRows, truncateFirstMessageRows: null };
  }

  let tailRows = 0;
  if (showActivity && lastUserIndex < 0 && activity !== null) {
    tailRows += estimateTraceFeedRows(traces, 0, activity);
  }

  let usedRows = tailRows;
  let startIndex = messages.length;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msgRows = estimateMessageBlockRows(messages, i, columns, traces, activity, layout, {
      lastUserIndex,
      showActivity,
      includeGap: true,
    });

    const indicatorRows = startIndex < messages.length ? HIDDEN_HISTORY_INDICATOR_ROWS : 0;
    if (usedRows + msgRows + indicatorRows > maxRows && startIndex < messages.length) {
      break;
    }

    usedRows += msgRows;
    startIndex = i;
  }

  const hiddenMessageCount = startIndex;
  let budget =
    maxRows -
    (hiddenMessageCount > 0 ? HIDDEN_HISTORY_INDICATOR_ROWS : 0) -
    tailRows;

  for (let i = startIndex; i < messages.length; i++) {
    budget -= estimateMessageBlockRows(messages, i, columns, traces, activity, layout, {
      lastUserIndex,
      showActivity,
      includeGap: i !== startIndex,
    });
  }

  let truncateFirstMessageRows: number | null = null;
  if (budget < 0 && messages[startIndex]) {
    const fullRows = estimateMessageBlockRows(
      messages,
      startIndex,
      columns,
      traces,
      activity,
      layout,
      { lastUserIndex, showActivity, includeGap: false, omitInlineTrace: true },
    );
    truncateFirstMessageRows = Math.max(1, fullRows + budget);
  }

  return {
    startIndex,
    hiddenMessageCount,
    maxRows,
    truncateFirstMessageRows,
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
