import { describe, expect, test } from "bun:test";
import { ulid } from "ulid";
import type { RelayEvent, ExecutionStore, EventProjector } from "@relay/types";
import type { LLMProvider } from "@relay/providers";
import { createToolRegistry } from "@relay/tool-registry";
import { Runtime } from "./runtime.js";

function createMockStore(initial: RelayEvent[] = []): ExecutionStore {
  const log: RelayEvent[] = [...initial];
  return {
    createSession(prompt: string) {
      return { id: "sess-1", prompt, createdAt: Date.now() };
    },
    getSession(sessionId: string) {
      if (sessionId !== "sess-1") return null;
      return { id: sessionId, prompt: "original prompt", createdAt: Date.now() };
    },
    listSessions() {
      return [{ id: "sess-1", prompt: "original prompt", createdAt: Date.now() }];
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

function createMockProjector(store: ExecutionStore): EventProjector {
  return {
    persist(event: RelayEvent) {
      store.events.append(event);
    },
  };
}

function createMockProvider(): LLMProvider {
  return {
    async stream() {
      return {
        text: "resumed response",
        toolCalls: [],
        inputTokens: 1,
        outputTokens: 2,
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

describe("Runtime.rerun", () => {
  test("resumes from the latest checkpoint without re-emitting the user message", async () => {
    const checkpointId = "chk-resume";
    const priorEvents: RelayEvent[] = [
      {
        id: ulid(),
        sessionId: "sess-1",
        type: "checkpoint.saved",
        timestamp: Date.now(),
        payload: {
          checkpointId,
          label: "iteration-1",
          data: {
            iteration: 1,
            messages: [
              { role: "user", content: "hello" },
              { role: "assistant", content: "partial" },
            ],
          },
        },
      },
    ];

    const store = createMockStore(priorEvents);
    const runtime = new Runtime({
      store,
      projector: createMockProjector(store),
      provider: createMockProvider(),
      toolRegistry: createToolRegistry(),
    });

    const sessionId = await runtime.rerun({ sessionId: "sess-1" });
    expect(sessionId).toBe("sess-1");

    await new Promise((resolve) => setTimeout(resolve, 50));

    const allEvents = store.events.getBySession("sess-1");
    const userStarts = allEvents.filter(
      (event) => event.type === "message.started" && event.payload.role === "user",
    );
    expect(userStarts).toHaveLength(0);

    const completed = allEvents.find((event) => event.type === "message.completed");
    expect(completed?.payload).toMatchObject({
      role: "assistant",
      content: "resumed response",
    });
  });

  test("rejects rerun when session is already active", async () => {
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

    const runtime = new Runtime({
      store,
      projector: createMockProjector(store),
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

    await runtime.rerun({ sessionId: "sess-1" });
    await expect(runtime.rerun({ sessionId: "sess-1" })).rejects.toThrow(
      "Session is already running",
    );
  });
});
