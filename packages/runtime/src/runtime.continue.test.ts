import { describe, expect, test } from "bun:test";
import { ulid } from "ulid";
import type { RelayEvent, ExecutionStore, EventSink } from "@relay/types";
import type { LLMProvider } from "@relay/providers";
import { createToolRegistry } from "@relay/tool-registry";
import { createTestSeamDeps } from "./test-support/seam-deps.js";
import { Runtime } from "./runtime.js";

function createMockStore(initial: RelayEvent[] = []): ExecutionStore {
  const log: RelayEvent[] = [...initial];
  return {
    createSession(prompt: string) {
      return { id: "sess-1", prompt, createdAt: Date.now() };
    },
    getSession(sessionId: string) {
      if (sessionId !== "sess-1") return null;
      return { id: sessionId, prompt: "first prompt", createdAt: Date.now() };
    },
    listSessions() {
      return [{ id: "sess-1", prompt: "first prompt", createdAt: Date.now() }];
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

function createMockProvider(): LLMProvider {
  return {
    async stream() {
      return {
        text: "follow-up response",
        toolCalls: [],
        inputTokens: 3,
        outputTokens: 4,
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

describe("Runtime.continue", () => {
  test("appends a new user message and keeps prior conversation context", async () => {
    const priorEvents: RelayEvent[] = [
      {
        id: ulid(),
        sessionId: "sess-1",
        type: "checkpoint.saved",
        timestamp: Date.now(),
        payload: {
          checkpointId: "chk-1",
          label: "iteration-1",
          data: {
            iteration: 1,
            messages: [
              { role: "user", content: "hello" },
              { role: "assistant", content: "hi there" },
            ],
          },
        },
      },
    ];

    const store = createMockStore(priorEvents);
    const seams = createTestSeamDeps();
    const runtime = new Runtime({
      store,
      eventSink: createMockEventSink(store),
      sessionCoordinator: seams.sessionCoordinator,
      livePublisher: seams.livePublisher,
      provider: createMockProvider(),
      toolRegistry: createToolRegistry(),
    });

    const sessionId = await runtime.continue({
      sessionId: "sess-1",
      prompt: "what did I say?",
    });
    expect(sessionId).toBe("sess-1");

    await new Promise((resolve) => setTimeout(resolve, 50));

    const allEvents = store.events.getBySession("sess-1");
    const userStarts = allEvents.filter(
      (event) => event.type === "message.started" && event.payload.role === "user",
    );
    expect(userStarts).toHaveLength(1);
    expect(userStarts[0]?.payload).toMatchObject({
      role: "user",
      content: "what did I say?",
    });

    const completed = allEvents.find((event) => event.type === "message.completed");
    expect(completed?.payload).toMatchObject({
      role: "assistant",
      content: "follow-up response",
    });

    const latestCheckpoint = [...allEvents]
      .reverse()
      .find((event) => event.type === "checkpoint.saved");
    const data = latestCheckpoint?.payload.data as {
      messages: { role: string; content: string }[];
    };
    expect(data.messages).toHaveLength(4);
    expect(data.messages[0]).toMatchObject({ role: "user", content: "hello" });
    expect(data.messages[2]).toMatchObject({ role: "user", content: "what did I say?" });
  });

  test("rejects continue when session is already running", async () => {
    const store = createMockStore([
      {
        id: ulid(),
        sessionId: "sess-1",
        type: "checkpoint.saved",
        timestamp: Date.now(),
        payload: {
          checkpointId: "chk-1",
          data: {
            iteration: 1,
            messages: [{ role: "user", content: "hello" }],
          },
        },
      },
    ]);

    const seams = createTestSeamDeps();
    const runtime = new Runtime({
      store,
      eventSink: createMockEventSink(store),
      sessionCoordinator: seams.sessionCoordinator,
      livePublisher: seams.livePublisher,
      provider: {
        async stream() {
          await new Promise((resolve) => setTimeout(resolve, 500));
          return { text: "", toolCalls: [], inputTokens: 0, outputTokens: 0 };
        },
        async complete() {
          return "";
        },
        async embed() {
          return [];
        },
      },
      toolRegistry: createToolRegistry(),
    });

    await runtime.continue({ sessionId: "sess-1", prompt: "one" });
    await expect(runtime.continue({ sessionId: "sess-1", prompt: "two" })).rejects.toThrow(
      "Session is already running",
    );
  });

  test("rejects continue when session has no checkpoint", async () => {
    const store = createMockStore();
    const seams = createTestSeamDeps();
    const runtime = new Runtime({
      store,
      eventSink: createMockEventSink(store),
      sessionCoordinator: seams.sessionCoordinator,
      livePublisher: seams.livePublisher,
      provider: createMockProvider(),
      toolRegistry: createToolRegistry(),
    });

    await expect(
      runtime.continue({ sessionId: "sess-1", prompt: "hello" }),
    ).rejects.toThrow("No checkpoints found for session");
  });
});
