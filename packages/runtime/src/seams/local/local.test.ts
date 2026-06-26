import { describe, expect, test } from "bun:test";
import type { RelayEvent, ExecutionStore, EventSink } from "@relay/types";
import type { LLMProvider } from "@relay/providers";
import { createToolRegistry } from "@relay/tool-registry";
import {
  createLocalDurableExecutor,
  createLocalLiveEventPublisher,
  createLocalSessionCoordinator,
} from "./index.js";
import { Runtime } from "../../runtime.js";

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

function createMockEventSink(store: ExecutionStore): EventSink {
  let chain = Promise.resolve();
  return {
    write(event: RelayEvent): Promise<void> {
      const next = chain.then(() => {
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

function createTestRuntime(store: ExecutionStore) {
  const livePublisher = createLocalLiveEventPublisher();
  let runtime: Runtime;
  const sessionCoordinator = createLocalSessionCoordinator({
    onCancel: (sessionId) => {
      runtime.cancel({ sessionId });
    },
  });
  runtime = new Runtime({
    store,
    eventSink: createMockEventSink(store),
    sessionCoordinator,
    livePublisher,
    provider: createStreamingProvider(),
    toolRegistry: createToolRegistry(),
  });
  return runtime;
}

describe("local seam adapters", () => {
  test("SessionCoordinator rejects a second worker for the same session", async () => {
    const coordinator = createLocalSessionCoordinator();
    expect(await coordinator.acquireLease("sess-1", "worker-a", 60_000)).toBe(true);
    expect(await coordinator.acquireLease("sess-1", "worker-b", 60_000)).toBe(false);
    expect(await coordinator.resolveOwner("sess-1")).toBe("worker-a");
  });

  test("DurableExecutor delegates execute to runtime", async () => {
    const store = createMockStore();
    const runtime = createTestRuntime(store);
    const executor = createLocalDurableExecutor({
      runtime,
      coordinator: createLocalSessionCoordinator(),
      workerId: "local-worker",
    });

    const { sessionId } = await executor.execute({
      kind: "execute",
      prompt: "hello",
    });
    expect(sessionId).toBe("sess-1");

    await new Promise((resolve) => setTimeout(resolve, 50));

    const status = await executor.getStatus(sessionId);
    expect(status.active).toBe(false);
    expect(status.status).toBe("completed");
  });

  test("routeCancel invokes onCancel callback", async () => {
    const cancelled: string[] = [];
    const coordinator = createLocalSessionCoordinator({
      onCancel: (sessionId) => {
        cancelled.push(sessionId);
      },
    });

    await coordinator.routeCancel("sess-1");
    expect(cancelled).toEqual(["sess-1"]);
  });
});
