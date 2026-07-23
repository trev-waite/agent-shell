import { describe, expect, test } from "bun:test";
import type { SessionCoordinator } from "@relay/types";
import {
  claimNextTask,
  createQueueDurableExecutor,
  reclaimIdleTask,
} from "./queue-executor.js";

function createMemoryCoordinator(): SessionCoordinator & {
  owners: Map<string, string>;
  cancelled: string[];
} {
  const owners = new Map<string, string>();
  const cancelled: string[] = [];
  return {
    owners,
    cancelled,
    async acquireLease(sessionId, workerId) {
      if (owners.has(sessionId)) return false;
      owners.set(sessionId, workerId);
      return true;
    },
    async renewLease(sessionId, workerId) {
      return owners.get(sessionId) === workerId;
    },
    async releaseLease(sessionId, workerId) {
      if (owners.get(sessionId) === workerId) owners.delete(sessionId);
    },
    async resolveOwner(sessionId) {
      return owners.get(sessionId) ?? null;
    },
    async routeCancel(sessionId) {
      cancelled.push(sessionId);
    },
    async getActiveSessions() {
      return [...owners.keys()];
    },
  };
}

describe("createQueueDurableExecutor", () => {
  test("rejects continue when session already has an owner", async () => {
    const coordinator = createMemoryCoordinator();
    await coordinator.acquireLease("sess-1", "worker-a", 60_000);

    const enqueued: string[] = [];
    const redis = {
      eval: async () => 0,
      xAdd: async () => {
        enqueued.push("task");
        return "1-0";
      },
      xGroupCreate: async () => "OK",
    } as never;

    const executor = createQueueDurableExecutor({
      redis,
      coordinator,
    });

    await expect(
      executor.execute({
        kind: "continue",
        sessionId: "sess-1",
        prompt: "follow up",
      }),
    ).rejects.toThrow("Session is already queued or running");
    expect(enqueued).toHaveLength(0);
  });

  test("cancel routes through coordinator", async () => {
    const coordinator = createMemoryCoordinator();
    const redis = {
      xAdd: async () => "1-0",
      xGroupCreate: async () => "OK",
    } as never;

    const executor = createQueueDurableExecutor({ redis, coordinator });
    await executor.cancel("sess-9");
    expect(coordinator.cancelled).toEqual(["sess-9"]);
  });

  test("execute requires sessionId", async () => {
    const coordinator = createMemoryCoordinator();
    const redis = {
      xAdd: async () => "1-0",
      xGroupCreate: async () => "OK",
    } as never;
    const executor = createQueueDurableExecutor({ redis, coordinator });
    await expect(
      executor.execute({ kind: "execute", prompt: "hi" }),
    ).rejects.toThrow("sessionId is required");
  });

  test("atomically reserves a session before enqueueing", async () => {
    const coordinator = createMemoryCoordinator();
    const calls: string[] = [];
    const redis = {
      eval: async () => {
        calls.push("reserve");
        return 1;
      },
      xGroupCreate: async () => {
        calls.push("group");
        return "OK";
      },
      xAdd: async () => {
        calls.push("enqueue");
        return "1-0";
      },
    } as never;
    const executor = createQueueDurableExecutor({ redis, coordinator });

    await executor.execute({
      kind: "execute",
      sessionId: "sess-1",
      prompt: "hi",
      idempotencyKey: "task-1",
    });

    expect(calls).toEqual(["reserve", "group", "enqueue"]);
  });

  test("admits only one concurrent task for a session", async () => {
    const coordinator = createMemoryCoordinator();
    let reserved = false;
    const redis = {
      eval: async () => {
        if (reserved) return 0;
        reserved = true;
        return 1;
      },
      xGroupCreate: async () => "OK",
      xAdd: async () => "1-0",
    } as never;
    const executor = createQueueDurableExecutor({ redis, coordinator });
    const task = (prompt: string) =>
      executor.execute({ kind: "continue", sessionId: "sess-1", prompt });

    const results = await Promise.allSettled([task("first"), task("second")]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  });

  test("releases admission when enqueue fails", async () => {
    const coordinator = createMemoryCoordinator();
    let evalCalls = 0;
    const redis = {
      eval: async () => ++evalCalls === 1 ? 1 : 0,
      xGroupCreate: async () => "OK",
      xAdd: async () => { throw new Error("redis unavailable"); },
    } as never;
    const executor = createQueueDurableExecutor({ redis, coordinator });

    await expect(executor.execute({
      kind: "execute",
      sessionId: "sess-1",
      prompt: "hi",
      idempotencyKey: "task-1",
    })).rejects.toThrow("redis unavailable");
    expect(evalCalls).toBe(2);
  });
});

describe("claimNextTask", () => {
  test("reads the next new stream entry without reclaiming", async () => {
    let autoClaimed = false;
    const redis = {
      xAutoClaim: async () => {
        autoClaimed = true;
        return { nextId: "0-0", messages: [], deletedMessages: [] };
      },
      xReadGroup: async () => [{
        name: "relay:tasks",
        messages: [{
          id: "2-0",
          message: { task: JSON.stringify({
            kind: "execute",
            sessionId: "sess-2",
            prompt: "hi",
          }) },
        }],
      }],
    } as never;

    const claimed = await claimNextTask(redis, "worker-2", 0);
    expect(claimed?.streamId).toBe("2-0");
    expect(claimed?.task.sessionId).toBe("sess-2");
    expect(autoClaimed).toBe(false);
  });
});

describe("reclaimIdleTask", () => {
  test("reclaims an abandoned pending task from the PEL", async () => {
    const redis = {
      xAutoClaim: async () => ({
        nextId: "0-0",
        messages: [{
          id: "1-0",
          message: { task: JSON.stringify({
            kind: "execute",
            sessionId: "sess-1",
            prompt: "hi",
          }) },
        }],
        deletedMessages: [],
      }),
    } as never;

    const claimed = await reclaimIdleTask(redis, "worker-2", 1_000);
    expect(claimed?.streamId).toBe("1-0");
    expect(claimed?.task.sessionId).toBe("sess-1");
  });
});
