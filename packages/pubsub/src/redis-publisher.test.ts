import { describe, expect, test } from "bun:test";
import type { RelayEvent } from "@relay/types";
import { createRedisLiveEventPublisher } from "./redis-publisher.js";

function event(id: string, sessionId: string): RelayEvent {
  return {
    id,
    sessionId,
    type: "token.streamed",
    timestamp: Date.now(),
    payload: { token: id, messageId: "m1" },
  };
}

describe("createRedisLiveEventPublisher", () => {
  test("publishes sessions concurrently while preserving session order", async () => {
    const started: string[] = [];
    const release: Array<() => void> = [];
    const redis = {
      async xAdd(_key: string, _id: string, fields: { event: string }) {
        started.push((JSON.parse(fields.event) as RelayEvent).id);
        await new Promise<void>((resolve) => release.push(resolve));
        return "1-0";
      },
    } as never;
    const publisher = createRedisLiveEventPublisher({ redis });

    publisher.publish("a", event("a1", "a"));
    publisher.publish("a", event("a2", "a"));
    publisher.publish("b", event("b1", "b"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(started).toEqual(["a1", "b1"]);
    release.splice(0).forEach((resolve) => resolve());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(started).toEqual(["a1", "b1", "a2"]);
    release.splice(0).forEach((resolve) => resolve());
    await publisher.flush();
  });

  test("publish returns before XADD completes", async () => {
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const redis = {
      xAdd: async () => {
        await blocked;
        return "1-0";
      },
    } as never;
    const publisher = createRedisLiveEventPublisher({ redis });
    publisher.publish("sess-1", event("t1", "sess-1"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    let flushed = false;
    const flush = publisher.flush().then(() => {
      flushed = true;
    });
    expect(flushed).toBe(false);
    release();
    await flush;
    expect(flushed).toBe(true);
  });
});
