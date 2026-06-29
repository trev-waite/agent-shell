import { describe, expect, test } from "bun:test";
import type { RelayEvent } from "@relay/types";
import { deriveSessionStatus } from "./session.js";

describe("deriveSessionStatus", () => {
  test("maps CANCELLED error code to cancelled status", () => {
    const events: RelayEvent[] = [
      {
        id: "1",
        sessionId: "s",
        type: "message.started",
        timestamp: Date.now() - 1000,
        payload: { role: "user", content: "hi" },
      },
      {
        id: "2",
        sessionId: "s",
        type: "error",
        timestamp: Date.now(),
        payload: { code: "CANCELLED", message: "Cancelled by user" },
      },
    ];

    expect(deriveSessionStatus(events)).toBe("cancelled");
  });

  test("returns completed when session.completed is the last terminal event", () => {
    const events: RelayEvent[] = [
      {
        id: "1",
        sessionId: "s",
        type: "message.started",
        timestamp: Date.now() - 5000,
        payload: { role: "user", content: "hi" },
      },
      {
        id: "2",
        sessionId: "s",
        type: "session.completed",
        timestamp: Date.now() - 1000,
        payload: { iteration: 1 },
      },
    ];

    expect(deriveSessionStatus(events)).toBe("completed");
  });

  test("returns running when a new user turn started after session.completed", () => {
    const events: RelayEvent[] = [
      {
        id: "1",
        sessionId: "s",
        type: "message.started",
        timestamp: Date.now() - 10_000,
        payload: { role: "user", content: "first" },
      },
      {
        id: "2",
        sessionId: "s",
        type: "session.completed",
        timestamp: Date.now() - 8000,
        payload: { iteration: 1 },
      },
      {
        id: "3",
        sessionId: "s",
        type: "message.started",
        timestamp: Date.now() - 1000,
        payload: { role: "user", content: "follow-up" },
      },
    ];

    expect(deriveSessionStatus(events)).toBe("running");
  });
});
