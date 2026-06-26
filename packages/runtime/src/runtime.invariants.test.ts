import { describe, expect, test } from "bun:test";
import { ulid } from "ulid";
import type { RelayEvent, ExecutionStore, EventSink } from "@relay/types";
import type { LLMProvider } from "@relay/providers";
import { createToolRegistry } from "@relay/tool-registry";
import { createTestCloudDeps } from "./test-support/cloud-deps.js";
import { Runtime } from "./runtime.js";

function createMockStore(initial: RelayEvent[] = []): ExecutionStore {
  const log: RelayEvent[] = [...initial];
  return {
    createSession(prompt: string) {
      return { id: "sess-1", prompt, createdAt: Date.now() };
    },
    getSession(sessionId: string) {
      if (sessionId !== "sess-1") return null;
      return { id: sessionId, prompt: "test prompt", createdAt: Date.now() };
    },
    listSessions() {
      return [{ id: "sess-1", prompt: "test prompt", createdAt: Date.now() }];
    },
    events: {
      append(event: RelayEvent) {
        log.push(event);
      },
      getBySession() {
        return [...log];
      },
      getLastEventId() {
        return log.length > 0 ? log[log.length - 1]!.id : null;
      },
    },
  };
}

function createMockEventSink(store: ExecutionStore, persistDelayMs = 0): EventSink {
  let chain = Promise.resolve();
  return {
    write(event: RelayEvent): Promise<void> {
      const next = chain.then(async () => {
        if (persistDelayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, persistDelayMs));
        }
        store.events.append(event);
      });
      chain = next.catch(() => {});
      return Promise.resolve();
    },
    flush(): Promise<void> {
      return chain;
    },
  };
}

function createStreamingProvider(
  onStream?: (onToken: (token: string) => void) => void,
): LLMProvider {
  return {
    async stream(opts) {
      const onToken = opts.onToken ?? (() => {});
      if (onStream) {
        onStream(onToken);
      } else {
        onToken("hello");
      }
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

async function waitForSessionIdle(
  runtime: Runtime,
  sessionId: string,
  timeoutMs = 2000,
): Promise<void> {
  const start = Date.now();
  while (runtime.isSessionActive(sessionId)) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Session ${sessionId} did not finish within ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe("Runtime invariants", () => {
  test("token callback returns before persistence completes", async () => {
    const store = createMockStore();
    const fanoutLog: string[] = [];
    const persistLog: string[] = [];
    let chain = Promise.resolve();

    const eventSink: EventSink = {
      write(event: RelayEvent): Promise<void> {
        const next = chain.then(async () => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          store.events.append(event);
          persistLog.push(event.type);
        });
        chain = next.catch(() => {});
        return Promise.resolve();
      },
      flush(): Promise<void> {
        return chain;
      },
    };

    const cloud = createTestCloudDeps();
    const runtime = new Runtime({
      store,
      eventSink,
      sessionCoordinator: cloud.sessionCoordinator,
      livePublisher: cloud.livePublisher,
      provider: createStreamingProvider((onToken) => {
        onToken("hello");
        expect(fanoutLog).toContain("token.streamed");
        expect(persistLog).not.toContain("token.streamed");
      }),
      toolRegistry: createToolRegistry(),
    });

    const unsubscribe = runtime.onSessionEvent("sess-1", (event) => {
      fanoutLog.push(event.type);
    });

    await runtime.execute({ prompt: "hi" });
    await waitForSessionIdle(runtime, "sess-1");
    await eventSink.flush();
    unsubscribe();

    expect(persistLog).toContain("token.streamed");
    const completed = store.events.getBySession("sess-1").find(
      (event) => event.type === "message.completed",
    );
    expect(completed).toBeDefined();
  });

  test("unsubscribing an observer does not cancel execution", async () => {
    const store = createMockStore();
    let releaseStream: (() => void) | undefined;
    const streamGate = new Promise<void>((resolve) => {
      releaseStream = resolve;
    });

    const cloud = createTestCloudDeps();
    const runtime = new Runtime({
      store,
      eventSink: createMockEventSink(store),
      sessionCoordinator: cloud.sessionCoordinator,
      livePublisher: cloud.livePublisher,
      provider: {
        async stream(opts) {
          await streamGate;
          opts.onToken?.("partial");
          return {
            text: "partial",
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
      },
      toolRegistry: createToolRegistry(),
    });

    await runtime.execute({ prompt: "hi" });
    expect(runtime.isSessionActive("sess-1")).toBe(true);

    const unsubscribe = runtime.onSessionEvent("sess-1", () => {});
    unsubscribe();

    releaseStream!();
    await waitForSessionIdle(runtime, "sess-1");

    expect(runtime.isSessionActive("sess-1")).toBe(false);
    const completed = store.events.getBySession("sess-1").find(
      (event) => event.type === "message.completed",
    );
    expect(completed?.payload).toMatchObject({
      role: "assistant",
      content: "partial",
    });
  });

  test("multiple observers receive the same live events", async () => {
    const store = createMockStore();
    const observerA: string[] = [];
    const observerB: string[] = [];

    const cloud = createTestCloudDeps();
    const runtime = new Runtime({
      store,
      eventSink: createMockEventSink(store),
      sessionCoordinator: cloud.sessionCoordinator,
      livePublisher: cloud.livePublisher,
      provider: {
        async stream(opts) {
          await new Promise((resolve) => setTimeout(resolve, 20));
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
      },
      toolRegistry: createToolRegistry(),
    });

    const unsubA = runtime.onSessionEvent("sess-1", (event) => {
      observerA.push(event.type);
    });
    const unsubB = runtime.onSessionEvent("sess-1", (event) => {
      observerB.push(event.type);
    });

    await runtime.execute({ prompt: "hi" });
    await waitForSessionIdle(runtime, "sess-1");
    unsubA();
    unsubB();

    const tokenEventsA = observerA.filter((type) => type === "token.streamed");
    const tokenEventsB = observerB.filter((type) => type === "token.streamed");

    expect(tokenEventsA.length).toBeGreaterThan(0);
    expect(tokenEventsA).toEqual(tokenEventsB);
  });
});
