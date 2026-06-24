import { describe, expect, test } from "bun:test";
import type { RelayEvent } from "@relay/types";
import { uiReducer, initialState } from "./state.js";

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
    expect(once.seenEventIds).toContain("dup-1");

    const twice = uiReducer(once, { type: "EVENT", event });
    expect(twice.messages).toHaveLength(1);
    expect(twice).toBe(once);
  });
});
