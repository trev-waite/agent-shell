import { describe, expect, test } from "bun:test";
import {
  claimIdempotencyKey,
  completeIdempotencyKey,
  getIdempotencyState,
  heartbeatTask,
  releaseIdempotencyKey,
} from "./queue-executor.js";

describe("claimIdempotencyKey", () => {
  test("first claim succeeds; duplicate fails", async () => {
    const keys = new Map<string, string>();
    let heartbeats = 0;
    const redis = {
      eval: async (script: string, opts: { keys: string[] }) => {
        const key = opts.keys[0]!;
        if (script.includes('current == "completed"')) {
          if (keys.has(key)) return 0;
          keys.set(key, "running");
          return 1;
        }
        if (script.includes("PEXPIRE")) {
          return keys.get(key) === "running" ? 1 : 0;
        }
        if (keys.get(key) === "running") {
          keys.delete(key);
          return 1;
        }
        return 0;
      },
      set: async (key: string, value: string) => { keys.set(key, value); return "OK"; },
      get: async (key: string) => keys.get(key) ?? null,
      xClaim: async () => { heartbeats++; return []; },
    } as never;

    expect(await claimIdempotencyKey(redis, "task-1")).toBe(true);
    expect(await claimIdempotencyKey(redis, "task-1")).toBe(false);
    expect(await claimIdempotencyKey(redis, "task-2")).toBe(true);
    expect(await getIdempotencyState(redis, "task-1")).toBe("running");
    await heartbeatTask(redis, "worker-1", "1-0", "task-1", "sess-1");
    expect(heartbeats).toBe(1);
    expect(await getIdempotencyState(redis, "task-1")).toBe("running");

    await releaseIdempotencyKey(redis, "task-1");
    expect(await claimIdempotencyKey(redis, "task-1")).toBe(true);

    await completeIdempotencyKey(redis, "task-1");
    expect(await getIdempotencyState(redis, "task-1")).toBe("completed");
    expect(await claimIdempotencyKey(redis, "task-1")).toBe(false);
  });
});
