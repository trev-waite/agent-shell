import { describe, expect, test } from "bun:test";
import type { RelayEvent } from "@relay/types";
import { readEventStream } from "./event-stream.js";
import { createClient } from "./index.js";

const event: RelayEvent = {
  id: "event-1", sessionId: "session-1", timestamp: 1,
  type: "message.started", payload: { role: "assistant", content: "hello 🌍" },
};
const encoder = new TextEncoder();
const frame = `id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`;

function response(chunks: Uint8Array[]) {
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  }));
}

describe("SSE decoding", () => {
  test("preserves events and cursors at every byte split, including UTF-8", async () => {
    const bytes = encoder.encode(frame);
    for (let split = 1; split < bytes.length; split++) {
      const received: Array<[RelayEvent, string | undefined]> = [];
      await readEventStream(response([bytes.slice(0, split), bytes.slice(split)]),
        (value, id) => received.push([value, id]));
      expect(received).toEqual([[event, event.id]]);
    }
  });

  test("handles CRLF, multiline data, comments, malformed and incomplete frames", async () => {
    const wire = `: heartbeat\r\n\r\ndata: invalid\r\n\r\nid: event-1\r\ndata: {\r\ndata: ${JSON.stringify(event).slice(1)}\r\n\r\ndata: {"incomplete": true}`;
    const received: RelayEvent[] = [];
    await readEventStream(response([...encoder.encode(wire)].map((byte) => Uint8Array.of(byte))),
      (value) => received.push(value));
    expect(received).toEqual([event]);
  });

  test("does not silently swallow consumer errors", async () => {
    await expect(readEventStream(response([encoder.encode(frame)]), () => {
      throw new Error("consumer failed");
    })).rejects.toThrow("consumer failed");
  });

  test("SDK replay and reconnect retain complete frames and Last-Event-ID", async () => {
    const next: RelayEvent = { ...event, id: "event-2" };
    let connections = 0;
    const resumes: Array<{ header: string | null; query: string | null }> = [];
    const server = Bun.serve({
      port: 0,
      fetch(request) {
        const url = new URL(request.url);
        if (url.pathname.endsWith("/replay")) {
          return response([encoder.encode(frame.slice(0, -1)), encoder.encode("\n")]);
        }
        connections++;
        if (connections === 1) {
          return response([encoder.encode(frame), encoder.encode("data: {\"partial\":")]);
        }
        resumes.push({
          header: request.headers.get("Last-Event-ID"),
          query: url.searchParams.get("after"),
        });
        return response([encoder.encode(`id: ${next.id}\ndata: ${JSON.stringify(next)}\n\n`)]);
      },
    });
    const client = createClient({ baseUrl: server.url.toString().replace(/\/$/, "") });
    let stop: (() => void) | undefined;
    try {
      const replayed: RelayEvent[] = [];
      await new Promise<void>((resolve, reject) => {
        client.replay({ sessionId: event.sessionId, onEvent: (e) => replayed.push(e), onComplete: resolve, onError: reject });
      });
      expect(replayed).toEqual([event]);
      const received: RelayEvent[] = [];
      await new Promise<void>((resolve, reject) => {
        stop = client.subscribe({
          sessionId: event.sessionId,
          onEvent(e) {
            received.push(e);
            if (e.id === next.id) { stop?.(); resolve(); }
          },
          onError: reject,
        });
      });
      expect(received).toEqual([event, next]);
      expect(resumes).toEqual([{ header: event.id, query: event.id }]);
      await Bun.sleep(1100);
      expect(connections).toBe(2);
    } finally {
      stop?.();
      await server.stop(true);
    }
  });
});
