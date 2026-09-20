import { describe, expect, test } from "bun:test";
import type { RelayEvent } from "@relay/types";
import {
  appReducer,
  getActivityStatusLabel,
  getAssistantReply,
  getTurnBySessionId,
  hasStreamingAssistant,
  initialAppState,
  isTurnInFlight,
  type AppState,
  type Turn,
} from "./state";

function turn(overrides: Partial<Turn> & Pick<Turn, "localId">): Turn {
  return {
    sessionId: null,
    prompt: "hello",
    messages: [],
    activity: { phase: "idle", label: null },
    status: "sending",
    seenEventIds: new Set(),
    streamConnected: false,
    ...overrides,
  };
}

function withTurns(state: AppState, turns: Turn[]): AppState {
  return { ...state, turns };
}

describe("turn helpers", () => {
  test("isTurnInFlight reflects sending and running", () => {
    expect(isTurnInFlight(turn({ localId: "a", status: "sending" }))).toBe(true);
    expect(isTurnInFlight(turn({ localId: "a", status: "running" }))).toBe(true);
    expect(isTurnInFlight(turn({ localId: "a", status: "complete" }))).toBe(false);
  });

  test("getActivityStatusLabel returns thinking and tool labels", () => {
    expect(
      getActivityStatusLabel({ phase: "thinking", label: "thinking" }),
    ).toBe("thinking");
    expect(
      getActivityStatusLabel({ phase: "tool", label: "reading files" }),
    ).toBe("reading files");
    expect(getActivityStatusLabel({ phase: "idle", label: null })).toBeNull();
  });

  test("hasStreamingAssistant detects streaming assistant messages", () => {
    expect(
      hasStreamingAssistant([
        { id: "1", role: "assistant", content: "hi", streaming: true, timestamp: 1 },
      ]),
    ).toBe(true);
    expect(
      hasStreamingAssistant([
        { id: "1", role: "assistant", content: "hi", timestamp: 1 },
      ]),
    ).toBe(false);
  });

  test("getAssistantReply prefers latest assistant content", () => {
    const t = turn({
      localId: "a",
      messages: [
        { id: "1", role: "assistant", content: "first", timestamp: 1 },
        { id: "2", role: "assistant", content: "latest", timestamp: 2 },
      ],
    });
    expect(getAssistantReply(t)).toBe("latest");
  });

  test("getTurnBySessionId finds by session id", () => {
    const state = withTurns(initialAppState, [
      turn({ localId: "a", sessionId: "sess-1" }),
    ]);
    expect(getTurnBySessionId(state, "sess-1")?.localId).toBe("a");
    expect(getTurnBySessionId(state, "missing")).toBeUndefined();
  });
});

describe("appReducer composer flow", () => {
  test("SUBMIT_TURN prepends a local user turn", () => {
    const next = appReducer(initialAppState, {
      type: "SUBMIT_TURN",
      prompt: "hi",
      localId: "local-1",
    });
    expect(next.turns).toHaveLength(1);
    expect(next.turns[0]?.prompt).toBe("hi");
    expect(next.turns[0]?.status).toBe("sending");
    expect(next.turns[0]?.messages[0]?.local).toBe(true);
  });

  test("TURN_SET_SESSION attaches session id and marks running", () => {
    const base = appReducer(initialAppState, {
      type: "SUBMIT_TURN",
      prompt: "hi",
      localId: "local-1",
    });
    const next = appReducer(base, {
      type: "TURN_SET_SESSION",
      localId: "local-1",
      sessionId: "sess-1",
    });
    expect(next.turns[0]?.sessionId).toBe("sess-1");
    expect(next.turns[0]?.status).toBe("running");
  });

  test("TURN_SEND_FAILED records an error message", () => {
    const base = appReducer(initialAppState, {
      type: "SUBMIT_TURN",
      prompt: "hi",
      localId: "local-1",
    });
    const next = appReducer(base, {
      type: "TURN_SEND_FAILED",
      localId: "local-1",
      message: "offline",
    });
    expect(next.turns[0]?.status).toBe("error");
    expect(next.turns[0]?.messages.at(-1)?.role).toBe("error");
  });
});

describe("appReducer conversation flow", () => {
  test("OPEN_CONVERSATION hydrates placeholder when session is unknown", () => {
    const next = appReducer(initialAppState, {
      type: "OPEN_CONVERSATION",
      sessionId: "sess-1",
      prompt: "older thread",
    });
    expect(next.viewMode).toBe("conversation");
    expect(next.focusedSessionId).toBe("sess-1");
    expect(next.turns[0]?.sessionId).toBe("sess-1");
    expect(next.turns[0]?.messages).toHaveLength(0);
    expect(next.turns[0]?.status).toBe("running");
  });

  test("OPEN_CONVERSATION reuses an existing turn", () => {
    const base = withTurns(initialAppState, [
      turn({
        localId: "a",
        sessionId: "sess-1",
        status: "complete",
        messages: [
          { id: "1", role: "user", content: "hi", timestamp: 1 },
        ],
      }),
    ]);
    const next = appReducer(base, {
      type: "OPEN_CONVERSATION",
      sessionId: "sess-1",
    });
    expect(next.turns).toHaveLength(1);
    expect(next.viewMode).toBe("conversation");
  });

  test("CLOSE_CONVERSATION returns to composer", () => {
    const base: AppState = {
      ...initialAppState,
      viewMode: "conversation",
      focusedSessionId: "sess-1",
    };
    const next = appReducer(base, { type: "CLOSE_CONVERSATION" });
    expect(next.viewMode).toBe("composer");
    expect(next.focusedSessionId).toBeNull();
  });

  test("CONVERSATION_PROMPT appends a local user message", () => {
    const base: AppState = {
      ...withTurns(initialAppState, [
        turn({
          localId: "a",
          sessionId: "sess-1",
          status: "complete",
        }),
      ]),
      viewMode: "conversation",
      focusedSessionId: "sess-1",
    };
    const next = appReducer(base, {
      type: "CONVERSATION_PROMPT",
      prompt: "follow up",
      localId: "local-2",
    });
    expect(next.turns[0]?.status).toBe("running");
    expect(next.turns[0]?.messages.at(-1)).toMatchObject({
      role: "user",
      content: "follow up",
      local: true,
    });
  });
});

describe("appReducer stream lifecycle", () => {
  test("TURN_STREAM_FAILED only affects empty hydration turns", () => {
    const empty = withTurns(initialAppState, [
      turn({ localId: "a", sessionId: "sess-1", status: "running" }),
    ]);
    const failed = appReducer(empty, {
      type: "TURN_STREAM_FAILED",
      sessionId: "sess-1",
      message: "Couldn't load this conversation.",
    });
    expect(failed.turns[0]?.status).toBe("error");
    expect(failed.turns[0]?.messages[0]?.role).toBe("error");

    const hydrated = withTurns(initialAppState, [
      turn({
        localId: "a",
        sessionId: "sess-1",
        status: "running",
        messages: [{ id: "1", role: "user", content: "hi", timestamp: 1 }],
      }),
    ]);
    const unchanged = appReducer(hydrated, {
      type: "TURN_STREAM_FAILED",
      sessionId: "sess-1",
      message: "Lost connection to the agent.",
    });
    expect(unchanged.turns[0]?.status).toBe("running");
    expect(unchanged.turns[0]?.messages).toHaveLength(1);
  });

  test("TURN_STREAM_CONNECTED updates streamConnected", () => {
    const base = withTurns(initialAppState, [
      turn({ localId: "a", sessionId: "sess-1", status: "running" }),
    ]);
    const connected = appReducer(base, {
      type: "TURN_STREAM_CONNECTED",
      sessionId: "sess-1",
      connected: true,
    });
    expect(connected.turns[0]?.streamConnected).toBe(true);
  });
});

describe("appReducer event projection", () => {
  test("ignores duplicate event ids", () => {
    const base = withTurns(initialAppState, [
      turn({ localId: "a", sessionId: "sess-1", status: "running" }),
    ]);
    const event: RelayEvent = {
      id: "evt-1",
      sessionId: "sess-1",
      type: "message.started",
      timestamp: 1,
      payload: { role: "assistant", content: "hi" },
    };
    const once = appReducer(base, { type: "TURN_EVENT", sessionId: "sess-1", event });
    const twice = appReducer(once, { type: "TURN_EVENT", sessionId: "sess-1", event });
    expect(once.turns[0]?.messages).toHaveLength(1);
    expect(twice).toBe(once);
  });

  test("projects assistant streaming and completion", () => {
    const base = withTurns(initialAppState, [
      turn({ localId: "a", sessionId: "sess-1", status: "running" }),
    ]);
    const started: RelayEvent = {
      id: "m1",
      sessionId: "sess-1",
      type: "message.started",
      timestamp: 1,
      payload: { role: "assistant", content: "" },
    };
    const token: RelayEvent = {
      id: "t1",
      sessionId: "sess-1",
      type: "token.streamed",
      timestamp: 2,
      payload: { messageId: "m1", token: "hello" },
    };
    const completed: RelayEvent = {
      id: "c1",
      sessionId: "sess-1",
      type: "message.completed",
      timestamp: 3,
      payload: { messageId: "m1", role: "assistant", content: "hello" },
    };
    const done: RelayEvent = {
      id: "s1",
      sessionId: "sess-1",
      type: "session.completed",
      timestamp: 4,
      payload: { iteration: 1 },
    };

    let state = appReducer(base, { type: "TURN_EVENT", sessionId: "sess-1", event: started });
    state = appReducer(state, { type: "TURN_EVENT", sessionId: "sess-1", event: token });
    expect(state.turns[0]?.messages[0]?.content).toBe("hello");
    expect(state.turns[0]?.messages[0]?.streaming).toBe(true);

    state = appReducer(state, { type: "TURN_EVENT", sessionId: "sess-1", event: completed });
    expect(state.turns[0]?.messages[0]?.streaming).toBe(false);

    state = appReducer(state, { type: "TURN_EVENT", sessionId: "sess-1", event: done });
    expect(state.turns[0]?.status).toBe("complete");
  });

  test("confirms optimistic local user messages from the stream", () => {
    const base = withTurns(initialAppState, [
      turn({
        localId: "local-1",
        sessionId: "sess-1",
        status: "running",
        messages: [
          {
            id: "local-1",
            role: "user",
            content: "hello",
            local: true,
            timestamp: 1,
          },
        ],
      }),
    ]);
    const event: RelayEvent = {
      id: "server-user-1",
      sessionId: "sess-1",
      type: "message.started",
      timestamp: 2,
      payload: { role: "user", content: "hello" },
    };
    const next = appReducer(base, { type: "TURN_EVENT", sessionId: "sess-1", event });
    expect(next.turns[0]?.messages).toHaveLength(1);
    expect(next.turns[0]?.messages[0]?.id).toBe("server-user-1");
    expect(next.turns[0]?.messages[0]?.local).toBe(false);
  });
});
