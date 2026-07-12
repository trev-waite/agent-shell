import { describe, expect, test } from "bun:test";
import { createRedisSessionCoordinator } from "./redis-coordinator.js";

describe("Redis cancellation routing", () => {
  test("publishes directly for an owned session without leaving a cancel flag", async () => {
    const published: Array<[string, string]> = [];
    const redis = {
      eval: async () => ["owner", "worker-1"],
      publish: async (channel: string, message: string) => {
        published.push([channel, message]);
        return 1;
      },
    } as never;
    const coordinator = createRedisSessionCoordinator({ redis });

    await coordinator.routeCancel("sess-1");

    expect(published).toEqual([["relay:cancel:worker-1", "sess-1"]]);
  });

  test("does not publish when cancellation is attached to a queued task", async () => {
    let published = false;
    const redis = {
      eval: async () => ["queued", "task-1"],
      publish: async () => { published = true; return 1; },
    } as never;
    const coordinator = createRedisSessionCoordinator({ redis });

    await coordinator.routeCancel("sess-1");

    expect(published).toBe(false);
  });

  test("consumes cancellation only for the matching task generation", async () => {
    const calls: string[] = [];
    const redis = {
      get: async () => "task-1",
      eval: async (_script: string, opts: { arguments: string[] }) => {
        calls.push(opts.arguments[0]!);
        return opts.arguments[0] === "task-1" ? 1 : 0;
      },
    } as never;
    const coordinator = createRedisSessionCoordinator({ redis });

    expect(await coordinator.consumeCancelRequest("sess-1", "old-task")).toBe(false);
    expect(await coordinator.consumeCancelRequest("sess-1", "task-1")).toBe(true);
    expect(await coordinator.isCancelRequestedForTask("sess-1", "old-task")).toBe(false);
    expect(await coordinator.isCancelRequestedForTask("sess-1", "task-1")).toBe(true);
    expect(calls).toEqual(["old-task", "task-1"]);
  });
});
