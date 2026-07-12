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
      async persist(event: RelayEvent) {
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
      async persist(event: RelayEvent) {
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

  test("flush rejects when a persist fails", async () => {
    const sink = createProjectorEventSink({
      async persist() {
        throw new Error("disk full");
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
    await expect(sink.flush()).rejects.toThrow("disk full");
  });

  test("sessions persist concurrently while preserving per-session order", async () => {
    const release: Array<() => void> = [];
    const started: string[] = [];
    const sink = createProjectorEventSink({
      async persist(event) {
        started.push(event.id);
        await new Promise<void>((resolve) => release.push(resolve));
      },
    });
    const make = (id: string, sessionId: string): RelayEvent => ({
      id,
      sessionId,
      type: "token.streamed",
      timestamp: Date.now(),
      payload: { token: id, messageId: "m1" },
    });

    void sink.write(make("a1", "a"));
    void sink.write(make("a2", "a"));
    void sink.write(make("b1", "b"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(started).toEqual(["a1", "b1"]);
    release.splice(0).forEach((resolve) => resolve());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(started).toEqual(["a1", "b1", "a2"]);
    release.splice(0).forEach((resolve) => resolve());
    await sink.flush();
  });

  test("flush errors are scoped to the session that failed", async () => {
    const sink = createProjectorEventSink({
      async persist(event) {
        if (event.sessionId === "bad") throw new Error("bad session");
      },
    });
    const make = (sessionId: string): RelayEvent => ({
      id: eventId(),
      sessionId,
      type: "token.streamed",
      timestamp: Date.now(),
      payload: { token: "x", messageId: "m1" },
    });

    void sink.write(make("bad"));
    void sink.write(make("good"));
    await expect(sink.flush("good")).resolves.toBeUndefined();
    await expect(sink.flush("bad")).rejects.toThrow("bad session");
  });
});
