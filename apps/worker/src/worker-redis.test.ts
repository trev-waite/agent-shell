import { describe, expect, test } from "bun:test";
import type { RelayEvent } from "@relay/types";
import { claimNextTask } from "@relay/dispatch";
import { createRedisLiveEventPublisher } from "@relay/pubsub";
import {
  bindWorkerRedis,
  CLAIM_BLOCK_MS,
  createWorkerRedisClients,
} from "./worker-redis.js";

function token(id: string): RelayEvent {
  return {
    id,
    sessionId: "sess-1",
    timestamp: 1,
    type: "token.streamed",
    payload: { token: id, messageId: "m1" },
  };
}

function createSerialRedis(log: string[]) {
  let queue = Promise.resolve();
  let releaseBlock!: () => void;
  const blocked = new Promise<void>((resolve) => {
    releaseBlock = resolve;
  });

  const run = <T>(op: string, fn: () => Promise<T>): Promise<T> => {
    const next = queue.then(() => {
      log.push(op);
      return fn();
    });
    queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };

  return {
    releaseBlock: () => releaseBlock(),
    duplicate() {
      return createSerialRedis(log);
    },
    connect: async () => {},
    xReadGroup: () => run("xReadGroup", () => blocked.then(() => [])),
    xAutoClaim: () =>
      run("xAutoClaim", async () => ({ nextId: "0-0", messages: [], deletedMessages: [] })),
    xAdd: async () => run("xAdd", async () => "1-0"),
    xClaim: async () => run("xClaim", async () => []),
    xAck: async () => run("xAck", async () => 1),
    eval: async () => run("eval", async () => 1),
  };
}

describe("worker Redis split", () => {
  test("createWorkerRedisClients uses a duplicated claim client", async () => {
    const log: string[] = [];
    const redis = createSerialRedis(log);
    const clients = await createWorkerRedisClients(redis as never);
    expect(clients.workRedis).toBe(redis);
    expect(clients.claimRedis).not.toBe(redis);
    expect(CLAIM_BLOCK_MS).toBe(5_000);
  });

  test("rejects wiring claim and live work onto the same client", () => {
    const redis = createSerialRedis([]);
    expect(() =>
      bindWorkerRedis({ workRedis: redis as never, claimRedis: redis as never }),
    ).toThrow(/separate connection/);
  });

  test("claim BLOCK and live XADD / heartbeat / ack use different clients", async () => {
    const workLog: string[] = [];
    const claimLog: string[] = [];
    const workRedis = createSerialRedis(workLog);
    const claimRedis = createSerialRedis(claimLog);
    const ops = bindWorkerRedis({
      workRedis: workRedis as never,
      claimRedis: claimRedis as never,
    });

    const claiming = ops.claimNext("worker-1", 5_000);
    const publisher = ops.createLivePublisher();
    publisher.publish("sess-1", token("t1"));
    await publisher.flush("sess-1");
    await ops.heartbeat("worker-1", "1-0", "task-1", "sess-1");
    await ops.ack("1-0");

    expect(claimLog).toEqual(["xReadGroup"]);
    expect(workLog).toContain("xAdd");
    expect(workLog).toContain("xClaim");
    expect(workLog).toContain("xAck");
    expect(workLog).not.toContain("xReadGroup");
    expect(claimLog).not.toContain("xAdd");

    workRedis.releaseBlock();
    claimRedis.releaseBlock();
    await claiming;
  });

  test("live XADD finishes while claim is blocked on the other client", async () => {
    const workRedis = createSerialRedis([]);
    const claimRedis = createSerialRedis([]);
    const ops = bindWorkerRedis({
      workRedis: workRedis as never,
      claimRedis: claimRedis as never,
    });

    const claiming = ops.claimNext("worker-1");
    const publisher = ops.createLivePublisher();
    publisher.publish("sess-1", token("t1"));

    let published = false;
    const flushed = publisher.flush("sess-1").then(() => {
      published = true;
    });
    await Promise.race([flushed, new Promise((resolve) => setTimeout(resolve, 50))]);
    expect(published).toBe(true);

    claimRedis.releaseBlock();
    await claiming;
  });
});

describe("shared Redis client anti-pattern", () => {
  test("XADD on the claim client waits until BLOCK returns", async () => {
    const redis = createSerialRedis([]);
    const claiming = claimNextTask(redis as never, "worker-1", 5_000);
    const publisher = createRedisLiveEventPublisher({ redis: redis as never });
    publisher.publish("sess-1", token("t1"));

    let published = false;
    const flushed = publisher.flush("sess-1").then(() => {
      published = true;
    });
    await Promise.race([flushed, new Promise((resolve) => setTimeout(resolve, 50))]);
    expect(published).toBe(false);

    redis.releaseBlock();
    await claiming;
    await flushed;
    expect(published).toBe(true);
  });
});
