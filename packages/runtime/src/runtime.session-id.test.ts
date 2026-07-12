import { describe, expect, test } from "bun:test";
import type { RelayEvent, ExecutionStore, EventSink } from "@relay/types";
import type { LLMProvider } from "@relay/providers";
import { createToolRegistry } from "@relay/tool-registry";
import { createTestSeamDeps } from "./test-support/seam-deps.js";
import { Runtime } from "./runtime.js";

function createMockStore(): ExecutionStore & { sessions: Map<string, { id: string; prompt: string; createdAt: number }> } {
  const log: RelayEvent[] = [];
  const sessions = new Map<string, { id: string; prompt: string; createdAt: number }>();
  return {
    sessions,
    async createSession(prompt: string) {
      const session = { id: crypto.randomUUID(), prompt, createdAt: Date.now() };
      sessions.set(session.id, session);
      return session;
    },
    async getSession(sessionId: string) {
      return sessions.get(sessionId) ?? null;
    },
    async listSessions() {
      return [...sessions.values()];
    },
    events: {
      async append(event: RelayEvent) {
        log.push(event);
      },
      async getBySession() {
        return [...log];
      },
      async getLastEventId() {
        return log.length > 0 ? log[log.length - 1]!.id : null;
      },
    },
  };
}

function createMockEventSink(store: ExecutionStore): EventSink {
  let chain = Promise.resolve();
  return {
    write(event: RelayEvent): Promise<void> {
      const next = chain.then(() => store.events.append(event));
      chain = next.catch(() => {});
      return Promise.resolve();
    },
    flush(): Promise<void> {
      return chain;
    },
  };
}

function createStreamingProvider(): LLMProvider {
  return {
    async stream(opts) {
      opts.onToken?.("hello");
      return {
        text: "hello",
        toolCalls: [],
        inputTokens: 1,
        outputTokens: 1,
      };
    },
    async complete() {
      return "done";
    },
    async embed() {
      return [0];
    },
  };
}

describe("Runtime.execute pre-assigned sessionId", () => {
  test("uses existing session when sessionId is provided", async () => {
    const store = createMockStore();
    const session = await store.createSession("precreated");
    const seams = createTestSeamDeps();
    const runtime = new Runtime({
      store,
      eventSink: createMockEventSink(store),
      ...seams,
      provider: createStreamingProvider(),
      toolRegistry: createToolRegistry(),
    });

    const sessionId = await runtime.execute({
      prompt: "run me",
      sessionId: session.id,
    });
    expect(sessionId).toBe(session.id);
    expect(store.sessions.size).toBe(1);

    await new Promise((r) => setTimeout(r, 50));
  });

  test("rejects unknown sessionId", async () => {
    const store = createMockStore();
    const seams = createTestSeamDeps();
    const runtime = new Runtime({
      store,
      eventSink: createMockEventSink(store),
      ...seams,
      provider: createStreamingProvider(),
      toolRegistry: createToolRegistry(),
    });

    await expect(
      runtime.execute({ prompt: "x", sessionId: "missing" }),
    ).rejects.toThrow("Session not found");
  });

  test("records a durable terminal event when cancelled before dequeue", async () => {
    const store = createMockStore();
    const seams = createTestSeamDeps();
    const runtime = new Runtime({
      store,
      eventSink: createMockEventSink(store),
      ...seams,
      provider: createStreamingProvider(),
      toolRegistry: createToolRegistry(),
    });

    await runtime.recordQueuedCancellation("sess-queued");

    const events = await store.events.getBySession("sess-queued");
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("error");
    expect(events[0]?.payload.code).toBe("CANCELLED");
  });

  test("reports a persistence failure to the durable worker", async () => {
    const store = createMockStore();
    const session = await store.createSession("persist test");
    const seams = createTestSeamDeps();
    const runtime = new Runtime({
      store,
      eventSink: {
        async write() {},
        async flush() {
          throw new Error("postgres unavailable");
        },
      },
      ...seams,
      provider: createStreamingProvider(),
      toolRegistry: createToolRegistry(),
    });

    await runtime.execute({ prompt: "run", sessionId: session.id });
    await expect(runtime.waitForSession(session.id)).rejects.toThrow(
      "postgres unavailable",
    );
  });
});

describe("SessionCoordinator lease renewal", () => {
  test("renewLease extends ownership for the same worker", async () => {
    const { sessionCoordinator } = createTestSeamDeps();
    expect(await sessionCoordinator.acquireLease("s1", "w1", 50)).toBe(true);
    expect(await sessionCoordinator.renewLease("s1", "w1", 5_000)).toBe(true);
    expect(await sessionCoordinator.renewLease("s1", "w2", 5_000)).toBe(false);
    await new Promise((r) => setTimeout(r, 60));
    // After original TTL would have expired, renew should have kept it alive
    // (we renewed with 5s). Another worker still cannot acquire.
    expect(await sessionCoordinator.acquireLease("s1", "w2", 5_000)).toBe(false);
    expect(await sessionCoordinator.resolveOwner("s1")).toBe("w1");
  });

  test("a renewal error stops execution before ownership can expire", async () => {
    const store = createMockStore();
    const session = await store.createSession("lease test");
    const seams = createTestSeamDeps();
    const runtime = new Runtime({
      store,
      eventSink: createMockEventSink(store),
      sessionCoordinator: {
        ...seams.sessionCoordinator,
        async renewLease() {
          throw new Error("redis unavailable");
        },
      },
      livePublisher: seams.livePublisher,
      provider: {
        async stream(opts) {
          return new Promise<never>((_, reject) => {
            opts.signal?.addEventListener("abort", () => reject(new Error("aborted")), {
              once: true,
            });
          });
        },
        async complete() {
          return "done";
        },
        async embed() {
          return [0];
        },
      },
      toolRegistry: createToolRegistry(),
      sessionLeaseTtlMs: 15,
    });

    await runtime.execute({ prompt: "run", sessionId: session.id });
    await runtime.waitForSession(session.id);

    const errors = (await store.events.getBySession(session.id)).filter(
      (event) => event.type === "error",
    );
    expect(errors.map((event) => event.payload.code)).toEqual(["OWNERSHIP_LOST"]);
    expect(runtime.isSessionActive(session.id)).toBe(false);
  });
});
