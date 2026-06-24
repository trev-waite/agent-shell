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
});
