import { describe, expect, test } from "bun:test";
import type { RelayEvent } from "@relay/types";
import { createSessionLiveBroker } from "./redis-publisher.js";

function evt(id: string): RelayEvent {
  return {
    id,
    sessionId: "sess-1",
    type: "token.streamed",
    timestamp: Date.now(),
    payload: { token: id, messageId: "m1" },
  };
}

describe("createSessionLiveBroker", () => {
  test("fans out one stream read to many handlers", async () => {
    let delivered = false;
    let destroyed = false;
    let readFrom: string | undefined;
    const reader = {
      async connect() {},
      xRead: async (stream: { id: string }) => {
        readFrom ??= stream.id;
        if (delivered) {
          await new Promise((r) => setTimeout(r, 200));
          return null;
        }
        delivered = true;
        return [
          {
            name: "relay:events:sess-1",
            messages: [
              {
                id: "1-0",
                message: { event: JSON.stringify(evt("01LIVE")) },
              },
            ],
          },
        ];
      },
      destroy() {
        destroyed = true;
      },
    };
    const redis = { duplicate: () => reader } as never;

    const broker = createSessionLiveBroker(redis);
    const a: string[] = [];
    const b: string[] = [];
    const subA = broker.subscribe("sess-1", (e) => a.push(e.id));
    const subB = broker.subscribe("sess-1", (e) => b.push(e.id));

    await subA.ready;
    await new Promise((r) => setTimeout(r, 100));
    expect(a).toContain("01LIVE");
    expect(b).toContain("01LIVE");
    expect(readFrom).toBe("0-0");
    subA.unsubscribe();
    subB.unsubscribe();
    expect(destroyed).toBe(true);
  });
});
