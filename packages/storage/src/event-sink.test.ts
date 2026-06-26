import { describe, expect, test } from "bun:test";
import type { RelayEvent } from "@relay/types";
import { createProjectorEventSink } from "./event-sink.js";

function eventId(): string {
  return crypto.randomUUID();
}

describe("createProjectorEventSink", () => {
  test("write returns before persist runs on the next microtask", () => {
    const log: string[] = [];
    const sink = createProjectorEventSink({
      persist(event: RelayEvent) {
        log.push(event.id);
      },
    });

    const event: RelayEvent = {
      id: eventId(),
      sessionId: "sess-1",
      type: "token.streamed",
      timestamp: Date.now(),
      payload: { token: "a", messageId: "msg-1" },
    };

    void sink.write(event);
    expect(log).toHaveLength(0);
  });

  test("flush waits for all queued writes", async () => {
    const log: RelayEvent[] = [];
    const sink = createProjectorEventSink({
      persist(event: RelayEvent) {
        log.push(event);
      },
    });

    const events: RelayEvent[] = [
      {
        id: eventId(),
        sessionId: "sess-1",
        type: "message.started",
        timestamp: Date.now(),
        payload: { role: "user", content: "hi" },
      },
      {
        id: eventId(),
        sessionId: "sess-1",
        type: "token.streamed",
        timestamp: Date.now(),
        payload: { token: "x", messageId: "msg-1" },
      },
    ];

    for (const event of events) {
      void sink.write(event);
    }

    expect(log).toHaveLength(0);
    await sink.flush();
    expect(log).toEqual(events);
  });
});
