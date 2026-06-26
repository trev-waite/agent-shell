import { describe, expect, test } from "bun:test";
import type { RelayEvent } from "@relay/types";
import { uiReducer, initialState } from "./state.js";
import { isSessionBusy } from "./stateHelpers.js";
import { buildTraceTimeline, tracesForTurn } from "./projections/trace.js";
import { buildMetricsGrid } from "./projections/metrics.js";
import { deriveFooterStatus } from "./projections/footer.js";
import { formatDuration, formatTimestamp, formatTokens } from "./utils/format.js";
import { formatHeaderUsage } from "./projections/header.js";

describe("uiReducer EVENT dedupe", () => {
  test("ignores duplicate event ids", () => {
    const event: RelayEvent = {
      id: "dup-1",
      sessionId: "s",
      type: "message.started",
      timestamp: 1,
      payload: { role: "user", content: "hello" },
    };

    const once = uiReducer(initialState, { type: "EVENT", event });
    expect(once.messages).toHaveLength(1);
    expect(once.seenEventIds.has("dup-1")).toBe(true);

    const twice = uiReducer(once, { type: "EVENT", event });
    expect(twice.messages).toHaveLength(1);
    expect(twice).toBe(once);
  });
});

describe("uiReducer timestamps and tool I/O", () => {
  test("stores message timestamp and sessionStartedAt on user message", () => {
    const event: RelayEvent = {
      id: "m1",
      sessionId: "s",
      type: "message.started",
      timestamp: 1_700_000_000_000,
      payload: { role: "user", content: "hi" },
    };

    const next = uiReducer(initialState, { type: "EVENT", event });
    expect(next.messages[0]?.timestamp).toBe(1_700_000_000_000);
    expect(next.sessionStartedAt).toBe(1_700_000_000_000);
  });

  test("stores tool input and output", () => {
    const started: RelayEvent = {
      id: "t1",
      sessionId: "s",
      type: "tool.started",
      timestamp: 100,
      payload: { toolCallId: "tc1", toolName: "query", input: { sql: "SELECT 1" } },
    };
    const completed: RelayEvent = {
      id: "t2",
      sessionId: "s",
      type: "tool.completed",
      timestamp: 200,
      payload: { toolCallId: "tc1", toolName: "query", output: { rows: 5 } },
    };

    const afterStart = uiReducer(initialState, { type: "EVENT", event: started });
    expect(afterStart.traces[0]?.input).toEqual({ sql: "SELECT 1" });

    const afterComplete = uiReducer(afterStart, { type: "EVENT", event: completed });
    expect(afterComplete.traces[0]?.output).toEqual({ rows: 5 });
    expect(afterComplete.traces[0]?.status).toBe("completed");
  });
});

describe("uiReducer UI actions", () => {
  test("cycles color scheme preference", () => {
    const dark = uiReducer(initialState, { type: "CYCLE_COLOR_SCHEME" });
    expect(dark.colorSchemePreference).toBe("dark");
    const light = uiReducer(dark, { type: "CYCLE_COLOR_SCHEME" });
    expect(light.colorSchemePreference).toBe("light");
    const auto = uiReducer(light, { type: "CYCLE_COLOR_SCHEME" });
    expect(auto.colorSchemePreference).toBe("auto");
  });

  test("sets color scheme directly", () => {
    const next = uiReducer(initialState, {
      type: "SET_COLOR_SCHEME",
      preference: "light",
    });
    expect(next.colorSchemePreference).toBe("light");
  });

  test("expands and collapses focused trace", () => {
    const withTrace = {
      ...initialState,
      traces: [
        {
          id: "tc1",
          toolName: "query",
          status: "completed" as const,
          startedAt: 1,
          completedAt: 2,
        },
      ],
    };

    const expanded = uiReducer(withTrace, { type: "EXPAND_TRACE_FOCUS" });
    expect(expanded.expandedTraceIds).toContain("tc1");

    const collapsed = uiReducer(expanded, { type: "COLLAPSE_TRACE_FOCUS" });
    expect(collapsed.expandedTraceIds).not.toContain("tc1");
  });

  test("SET_INPUT opens slash palette for / prefix", () => {
    const next = uiReducer(initialState, { type: "SET_INPUT", input: "/mo" });
    expect(next.activeOverlay).toBe("slash");
    expect(next.slashMenuIndex).toBe(0);
  });

  test("OPEN_OVERLAY and CLOSE_OVERLAY", () => {
    const opened = uiReducer(initialState, { type: "OPEN_OVERLAY", panel: "trace" });
    expect(opened.activeOverlay).toBe("trace");

    const closed = uiReducer(opened, { type: "CLOSE_OVERLAY" });
    expect(closed.activeOverlay).toBe("none");
  });

  test("TOGGLE_OVERLAY switches trace panel", () => {
    const opened = uiReducer(initialState, { type: "TOGGLE_OVERLAY", panel: "trace" });
    expect(opened.activeOverlay).toBe("trace");

    const closed = uiReducer(opened, { type: "TOGGLE_OVERLAY", panel: "trace" });
    expect(closed.activeOverlay).toBe("none");
  });

  test("SET_SESSION resets conversation on new session id", () => {
    const withMessages = {
      ...initialState,
      sessionId: "session-a",
      messages: [
        {
          id: "m1",
          role: "user" as const,
          content: "hi",
          timestamp: 1,
        },
      ],
      traces: [
        {
          id: "t1",
          toolName: "query",
          status: "completed" as const,
          startedAt: 1,
        },
      ],
      selectedModel: initialState.selectedModel,
    };

    const next = uiReducer(withMessages, { type: "SET_SESSION", sessionId: "session-b" });
    expect(next.sessionId).toBe("session-b");
    expect(next.messages).toHaveLength(0);
    expect(next.traces).toHaveLength(0);
    expect(next.selectedModel).toBe(withMessages.selectedModel);
  });

  test("SET_SESSION hydrates first session without clearing replay buffer", () => {
    const next = uiReducer(initialState, { type: "SET_SESSION", sessionId: "session-a" });
    expect(next.sessionId).toBe("session-a");
    expect(next.messages).toHaveLength(0);
    expect(next.seenEventIds.size).toBe(0);
  });

  test("SET_SESSION with same session id preserves conversation", () => {
    const withMessages = {
      ...initialState,
      sessionId: "session-a",
      lastEventId: "evt-9",
      messages: [
        {
          id: "m1",
          role: "user" as const,
          content: "hi",
          timestamp: 1,
        },
      ],
    };

    const next = uiReducer(withMessages, { type: "SET_SESSION", sessionId: "session-a" });
    expect(next).toBe(withMessages);
  });

  test("NEW_SESSION clears conversation but keeps preferences", () => {
    const active = {
      ...initialState,
      sessionId: "session-a",
      messages: [
        {
          id: "m1",
          role: "user" as const,
          content: "hi",
          timestamp: 1,
        },
      ],
      selectedModel: "gemini-3.1-flash-lite" as const,
      colorSchemePreference: "dark" as const,
      streamConnected: true,
      messageQueue: [{ id: "q-1", prompt: "queued", enqueuedAt: 1 }],
    };

    const next = uiReducer(active, { type: "NEW_SESSION" });
    expect(next.sessionId).toBeNull();
    expect(next.messages).toHaveLength(0);
    expect(next.selectedModel).toBe(active.selectedModel);
    expect(next.colorSchemePreference).toBe("dark");
    expect(next.streamConnected).toBe(false);
    expect(next.messageQueue).toHaveLength(0);
  });

  test("ENQUEUE_MESSAGE appends to the queue", () => {
    const first = uiReducer(initialState, { type: "ENQUEUE_MESSAGE", prompt: "follow up" });
    expect(first.messageQueue).toHaveLength(1);
    expect(first.messageQueue[0]?.prompt).toBe("follow up");

    const second = uiReducer(first, { type: "ENQUEUE_MESSAGE", prompt: "and another" });
    expect(second.messageQueue).toHaveLength(2);
    expect(second.messageQueue[1]?.prompt).toBe("and another");
  });

  test("REMOVE_QUEUE_HEAD and RESTORE_QUEUE_HEAD manage the queue", () => {
    const queued = uiReducer(initialState, { type: "ENQUEUE_MESSAGE", prompt: "one" });
    const withTwo = uiReducer(queued, { type: "ENQUEUE_MESSAGE", prompt: "two" });
    const head = withTwo.messageQueue[0]!;

    const removed = uiReducer(withTwo, { type: "REMOVE_QUEUE_HEAD" });
    expect(removed.messageQueue).toHaveLength(1);
    expect(removed.messageQueue[0]?.prompt).toBe("two");

    const restored = uiReducer(removed, { type: "RESTORE_QUEUE_HEAD", item: head });
    expect(restored.messageQueue).toHaveLength(2);
    expect(restored.messageQueue[0]?.prompt).toBe("one");
  });

  test("isSessionBusy is true while activity or running status is set", () => {
    expect(isSessionBusy(initialState)).toBe(false);
    expect(
      isSessionBusy({
        ...initialState,
        activity: { label: "Thinking…", phase: "thinking" },
      }),
    ).toBe(true);
    expect(
      isSessionBusy({
        ...initialState,
        metrics: { ...initialState.metrics, sessionStatus: "running" },
      }),
    ).toBe(true);
  });
});

describe("projections", () => {
  test("buildTraceTimeline includes agent start and end", () => {
    const nodes = buildTraceTimeline(
      [
        {
          id: "tc1",
          toolName: "query",
          status: "completed",
          startedAt: 100,
          completedAt: 200,
        },
      ],
      50,
      "completed",
    );
    expect(nodes[0]?.type).toBe("agent-start");
    expect(nodes[1]?.type).toBe("tool");
    expect(nodes[2]?.type).toBe("agent-end");
  });

  test("deriveFooterStatus reflects running activity", () => {
    const status = deriveFooterStatus(
      { ...initialState.metrics, sessionStatus: "running" },
      { label: "Thinking…", phase: "thinking" },
      true,
    );
    expect(status.label).toBe("RUNNING");
    expect(status.colorKey).toBe("motion");
  });

  test("buildMetricsGrid condenses for compact layout", () => {
    const cells = buildMetricsGrid(
      { ...initialState.metrics, inputTokens: 10, outputTokens: 20 },
      [],
      1000,
      2000,
      "compact",
      2000,
    );
    expect(cells.map((c) => c.id)).toEqual(["total-time", "tokens", "status", "cost"]);
  });

  test("tracesForTurn filters by timestamp", () => {
    const traces = [
      { id: "a", toolName: "old", status: "completed" as const, startedAt: 50 },
      { id: "b", toolName: "new", status: "running" as const, startedAt: 150 },
    ];
    expect(tracesForTurn(traces, 100).map((t) => t.id)).toEqual(["b"]);
  });

  test("formatHeaderUsage shows tokens and cost", () => {
    const usage = formatHeaderUsage({
      ...initialState.metrics,
      inputTokens: 1000,
      outputTokens: 243,
      totalCost: 0.003,
      currency: "USD",
    });
    expect(usage).toContain("1,243 tok");
    expect(usage).toContain("0.0030 USD");
  });
});

describe("format utils", () => {
  test("formatTimestamp and formatDuration", () => {
    const ts = new Date("2024-01-15T10:42:11").getTime();
    expect(formatTimestamp(ts)).toMatch(/10:42:11/);
    expect(formatDuration(2350)).toBe("2.35s");
    expect(formatTokens(1243)).toBe("1,243");
  });
});
