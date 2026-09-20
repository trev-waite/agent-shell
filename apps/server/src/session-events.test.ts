import { afterEach, describe, expect, test } from "bun:test";
import Fastify from "fastify";
import { get } from "node:http";
import type { EventHandler, ExecutionStore, RelayEvent } from "@relay/types";
import {
  createRuntime, createLocalLiveEventPublisher, createLocalSessionCoordinator,
} from "@relay/runtime";
import { createProjectorEventSink } from "@relay/storage";
import { createToolRegistry } from "@relay/tool-registry";
import { registerSessionEventRoute } from "./session-events.js";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
}
function event(id: string): RelayEvent {
  return { id, sessionId: "session-1", timestamp: 1, type: "token.streamed", payload: { messageId: "m1", token: id } };
}
const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup();
  cleanups.length = 0;
});
async function listen(source: Parameters<typeof registerSessionEventRoute>[1]) {
  const app = Fastify();
  registerSessionEventRoute(app, source);
  const url = await app.listen({ host: "127.0.0.1", port: 0 });
  cleanups.push(() => app.close());
  return url;
}
async function open(url: string, headers: Record<string, string> = {}) {
  const abort = new AbortController();
  cleanups.push(() => abort.abort());
  const response = await fetch(`${url}/sessions/session-1/events`, { headers, signal: abort.signal });
  const reader = response.body!.getReader();
  let buffer = "";
  const decoder = new TextDecoder();
  return {
    abort: () => abort.abort(),
    async next(): Promise<RelayEvent> {
      while (true) {
        const end = buffer.indexOf("\n\n");
        if (end >= 0) {
          const frame = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const data = frame.split("\n").find((line) => line.startsWith("data: "));
          if (data) return JSON.parse(data.slice(6)) as RelayEvent;
          continue;
        }
        const { value, done } = await reader.read();
        if (done) throw new Error("Stream ended before expected event");
        buffer += decoder.decode(value, { stream: true });
      }
    },
  };
}

describe("session events over HTTP", () => {
  test("joins queued persistence, replay and live events exactly once, then resumes by cursor", async () => {
    const handlers = new Set<EventHandler>();
    const log = [event("01")];
    const queuedStarted = deferred();
    const releaseQueued = deferred();
    cleanups.push(releaseQueued.resolve);
    let firstQueued = true;
    const replayCursors: Array<string | undefined> = [];
    const source = {
      subscribe(_id: string, handler: EventHandler) {
        handlers.add(handler);
        return () => { handlers.delete(handler); };
      },
      async flushQueued() {
        if (!firstQueued) return;
        firstQueued = false;
        queuedStarted.resolve();
        await releaseQueued.promise;
        // 02 was published before subscription but not yet stored.
        log.push(event("02"), event("03"));
      },
      async *replay(options: { afterEventId?: string }) {
        replayCursors.push(options.afterEventId);
        const snapshot = log.filter((e) => !options.afterEventId || e.id > options.afterEventId);
        for (const e of snapshot) yield e;
      },
    };
    const url = await listen(source);
    const client = await open(url);
    await queuedStarted.promise;
    for (const handler of handlers) { handler(event("03")); handler(event("04")); }
    releaseQueued.resolve();
    expect((await client.next()).id).toBe("01");
    expect((await client.next()).id).toBe("02");
    expect((await client.next()).id).toBe("03");
    expect((await client.next()).id).toBe("04");
    for (const handler of handlers) handler(event("05"));
    expect((await client.next()).id).toBe("05");
    client.abort();
    const resumed = await open(url, { "Last-Event-ID": "02" });
    expect((await resumed.next()).id).toBe("03");
    expect(replayCursors).toEqual([undefined, "02"]);
  });

  test("live tokens during flushQueued are not held until persist goes idle", async () => {
    const handlers = new Set<EventHandler>();
    const queuedStarted = deferred();
    const stillStreaming = deferred();
    cleanups.push(stillStreaming.resolve);
    const source = {
      subscribe(_id: string, handler: EventHandler) {
        handlers.add(handler);
        return () => { handlers.delete(handler); };
      },
      async flushQueued() {
        queuedStarted.resolve();
        await stillStreaming.promise;
      },
      async *replay() {
        yield event("01");
      },
    };
    const url = await listen(source);
    const client = await open(url);
    await queuedStarted.promise;
    for (const handler of handlers) handler(event("live"));
    stillStreaming.resolve();
    expect((await client.next()).id).toBe("01");
    expect((await client.next()).id).toBe("live");
  });

  test("disconnect during replay immediately releases the live subscription", async () => {
    const enteredReplay = deferred();
    const releaseReplay = deferred();
    const unsubscribed = deferred();
    cleanups.push(releaseReplay.resolve);
    let replayFinished = false;
    const url = await listen({
      subscribe: () => unsubscribed.resolve,
      async *replay() {
        enteredReplay.resolve();
        await releaseReplay.promise;
        replayFinished = true;
        yield event("01");
      },
    });
    const request = get(`${url}/sessions/session-1/events`);
    cleanups.push(() => { request.destroy(); });
    await new Promise<void>((resolve, reject) => {
      request.once("response", () => resolve());
      request.once("error", reject);
    });
    await enteredReplay.promise;
    request.destroy();
    await unsubscribed.promise;
    expect(replayFinished).toBe(false);
    releaseReplay.resolve();
  });

  test("queued persist failure still closes transport and releases the subscription", async () => {
    const unsubscribed = deferred();
    const url = await listen({
      subscribe: () => unsubscribed.resolve,
      flushQueued: async () => { throw new Error("storage unavailable"); },
      async *replay() { yield event("01"); },
    });
    await expect(open(url).then((client) => client.next())).rejects.toThrow();
    await unsubscribed.promise;
  });

  test("two observers receive real runtime events; disconnect does not cancel execution", async () => {
    const log: RelayEvent[] = [];
    const providerStarted = deferred();
    const finishProvider = deferred();
    const store: ExecutionStore = {
      async createSession(prompt) { return { id: "session-1", prompt, createdAt: 1 }; },
      async getSession(id) { return { id, prompt: "hello", createdAt: 1 }; },
      async listSessions() { return []; },
      events: {
        async append(e) { log.push(e); },
        async getBySession(_id, after) {
          const index = after ? log.findIndex((e) => e.id === after) : -1;
          return log.slice(index + 1);
        },
        async getLastEventId() { return log.at(-1)?.id ?? null; },
      },
    };
    const sink = createProjectorEventSink({ persist: (e) => store.events.append(e) }, { tokenBatchSize: 32 });
    const runtime = createRuntime({
      store, eventSink: sink,
      livePublisher: createLocalLiveEventPublisher(),
      sessionCoordinator: createLocalSessionCoordinator(),
      toolRegistry: createToolRegistry(),
      provider: {
        async stream(options) {
          options.onToken?.("first");
          providerStarted.resolve();
          await finishProvider.promise;
          options.onToken?.("last");
          return { text: "firstlast", toolCalls: [], inputTokens: 1, outputTokens: 2 };
        },
        async complete() { return "done"; },
        async embed() { return []; },
      },
    });
    const url = await listen({
      subscribe: (id, handler) => runtime.onSessionEvent(id, handler),
      replay: (options) => runtime.replay(options),
      flushQueued: (id) => sink.flushQueued?.(id) ?? Promise.resolve(),
    });
    cleanups.push(finishProvider.resolve);
    const a = await open(url);
    const b = await open(url);
    await runtime.execute({ prompt: "hello" });
    await providerStarted.promise;
    const firstA = await a.next();
    expect(await b.next()).toEqual(firstA);
    a.abort();
    expect(runtime.isSessionActive("session-1")).toBe(true);
    finishProvider.resolve();
    let last = await b.next();
    while (last.type !== "session.completed") last = await b.next();
    await sink.flush("session-1");
    expect(log.some((e) => e.type === "session.completed")).toBe(true);
    expect(log.some((e) => e.type === "error" && e.payload.code === "CANCELLED")).toBe(false);
  });
});
