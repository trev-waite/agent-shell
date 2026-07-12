/**
 * Optional live Redis integration tests.
 * Skipped unless REDIS_URL is set (e.g. docker compose redis on localhost:6379).
 */
import { describe, expect, test } from "bun:test";
import {
  connectRedis,
  createRedisSessionCoordinator,
} from "./redis-coordinator.js";
import { sessionAdmissionKey } from "./keys.js";

const REDIS_URL = process.env.REDIS_URL;
const describeRedis = REDIS_URL ? describe : describe.skip;

describeRedis("Redis SessionCoordinator (live)", () => {
  test("acquire / renew / release / cancel flag", async () => {
    const redis = await connectRedis(REDIS_URL!);
    const cancelled: string[] = [];
    const coordinator = createRedisSessionCoordinator({
      redis,
      onCancel: (id) => cancelled.push(id),
    });

    const sessionId = `test-${crypto.randomUUID()}`;
    const workerId = `worker-${crypto.randomUUID()}`;

    expect(await coordinator.acquireLease(sessionId, workerId, 5_000)).toBe(true);
    expect(await coordinator.acquireLease(sessionId, "other", 5_000)).toBe(false);
    expect(await coordinator.resolveOwner(sessionId)).toBe(workerId);
    expect(await coordinator.renewLease(sessionId, workerId, 5_000)).toBe(true);

    const stop = await coordinator.startCancelSubscription(workerId);
    await coordinator.routeCancel(sessionId);
    await new Promise((r) => setTimeout(r, 100));
    expect(cancelled).toContain(sessionId);
    expect(await coordinator.isCancelRequested(sessionId)).toBe(false);

    await coordinator.releaseLease(sessionId, workerId);
    expect(await coordinator.resolveOwner(sessionId)).toBeNull();

    await redis.set(sessionAdmissionKey(sessionId), "task-1", { PX: 5_000 });
    await coordinator.routeCancel(sessionId);
    expect(await coordinator.consumeCancelRequest(sessionId, "task-2")).toBe(false);
    expect(await coordinator.consumeCancelRequest(sessionId, "task-1")).toBe(true);
    expect(await coordinator.isCancelRequested(sessionId)).toBe(false);

    await stop();
    await redis.quit();
  });
});
