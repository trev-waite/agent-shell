import { describe, expect, test } from "bun:test";
import type { EventHandler, ExecutionStore, RelayEvent } from "@relay/types";
import { attachSessionEventStream } from "./session-event-stream.js";

function evt(id: string, sessionId = "sess-1"): RelayEvent {
  return {
    id,
    sessionId,
    type: "token.streamed",
    timestamp: Date.now(),
    payload: { token: id, messageId: "m1" },
  };
}

describe("attachSessionEventStream", () => {
  test("subscribe-first merge dedupes live events already in store replay", async () => {
    const storeEvents = [evt("01HAAA"), evt("01HAAB")];
    const store: ExecutionStore = {
      async createSession() {
        return { id: "sess-1", prompt: "x", createdAt: Date.now() };
      },
      async getSession() {
        return { id: "sess-1", prompt: "x", createdAt: Date.now() };
      },
      async listSessions() {
        return [];
      },
      events: {
        async append() {},
        async getBySession() {
          // Simulate slow durable read
          await new Promise((r) => setTimeout(r, 20));
          return storeEvents;
        },
        async getLastEventId() {
          return "01HAAB";
        },
      },
    };

    let liveHandler: EventHandler | null = null;
    const liveBroker = {
      subscribe(_sessionId: string, handler: EventHandler) {
        liveHandler = handler;
        return {
          ready: Promise.resolve(),
          unsubscribe: () => {
            liveHandler = null;
          },
        };
      },
    };

    const sent: string[] = [];
    const streamPromise = attachSessionEventStream({
      store,
      liveBroker,
      sessionId: "sess-1",
      afterId: undefined,
      sendEvent: (e) => sent.push(e.id),
      onClose: () => {},
    });

    // Live event arrives during store replay (same id as historical + new)
    await new Promise((r) => setTimeout(r, 5));
    liveHandler?.(evt("01HAAB"));
    liveHandler?.(evt("01HAAC"));

    await streamPromise;

    expect(sent).toEqual(["01HAAA", "01HAAB", "01HAAC"]);
  });

  test("client disconnect unsubscribe stops delivery (north-star)", async () => {
    const store: ExecutionStore = {
      async createSession() {
        return { id: "sess-1", prompt: "x", createdAt: Date.now() };
      },
      async getSession() {
        return { id: "sess-1", prompt: "x", createdAt: Date.now() };
      },
      async listSessions() {
        return [];
      },
      events: {
        async append() {},
        async getBySession() {
          return [evt("01HAAA")];
        },
        async getLastEventId() {
          return "01HAAA";
        },
      },
    };

    let liveHandler: EventHandler | null = null;
    let unsubscribed = false;
    const liveBroker = {
      subscribe(_sessionId: string, handler: EventHandler) {
        liveHandler = handler;
        return {
          ready: Promise.resolve(),
          unsubscribe: () => {
            unsubscribed = true;
            liveHandler = null;
          },
        };
      },
    };

    const sent: string[] = [];
    let unsubscribe: (() => void) | undefined;
    await attachSessionEventStream({
      store,
      liveBroker,
      sessionId: "sess-1",
      afterId: undefined,
      sendEvent: (e) => sent.push(e.id),
      onClose: (unsub) => {
        unsubscribe = unsub;
      },
    });

    unsubscribe?.();
    expect(unsubscribed).toBe(true);

    liveHandler?.(evt("01HAAB"));
    expect(sent).toEqual(["01HAAA"]);
  });

  test("skipDurableReplay avoids store getBySession for fresh sessions", async () => {
    let getBySessionCalls = 0;
    const store: ExecutionStore = {
      async createSession() {
        return { id: "sess-1", prompt: "x", createdAt: Date.now() };
      },
      async getSession() {
        return { id: "sess-1", prompt: "x", createdAt: Date.now() };
      },
      async listSessions() {
        return [];
      },
      events: {
        async append() {},
        async getBySession() {
          getBySessionCalls += 1;
          return [evt("01HAAA")];
        },
        async getLastEventId() {
          return null;
        },
      },
    };

    let liveHandler: EventHandler | null = null;
    const liveBroker = {
      subscribe(_sessionId: string, handler: EventHandler) {
        liveHandler = handler;
        return {
          ready: Promise.resolve(),
          unsubscribe: () => {
            liveHandler = null;
          },
        };
      },
    };

    const sent: string[] = [];
    const streamPromise = attachSessionEventStream({
      store,
      liveBroker,
      sessionId: "sess-1",
      afterId: undefined,
      skipDurableReplay: true,
      sendEvent: (e) => sent.push(e.id),
      onClose: () => {},
    });

    await new Promise((r) => setTimeout(r, 0));
    liveHandler?.(evt("01HAAC"));
    await streamPromise;

    expect(getBySessionCalls).toBe(0);
    expect(sent).toEqual(["01HAAC"]);
  });
});
