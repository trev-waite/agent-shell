import { createClient, type RedisClientType } from "redis";
import type { SessionCoordinator } from "@relay/types";
import {
  cancelChannel,
  cancelFlagKey,
  LEASE_KEY_PREFIX,
  leaseKey,
  sessionAdmissionKey,
} from "./keys.js";

export type { RedisClientType };

const RENEW_LUA = `
local current = redis.call("GET", KEYS[1])
if current == ARGV[1] then
  return redis.call("PEXPIRE", KEYS[1], ARGV[2])
end
return 0
`;

const RELEASE_LUA = `
local current = redis.call("GET", KEYS[1])
if current == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`;

const ROUTE_CANCEL_LUA = `
local owner = redis.call("GET", KEYS[1])
local task = redis.call("GET", KEYS[2])
if task then
  redis.call("SET", KEYS[3], task, "PX", ARGV[1])
end
if owner then return {"owner", owner} end
if task then return {"queued", task} end
return {"idle", ""}
`;

const CONSUME_CANCEL_LUA = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  redis.call("DEL", KEYS[1])
  return 1
end
return 0
`;

export interface RedisSessionCoordinatorOptions {
  redis: RedisClientType;
  /** Optional cancel handler when this process owns the worker subscription. */
  onCancel?: (sessionId: string) => void;
  /** TTL for cancel flags so late-dequeued tasks can no-op. */
  cancelFlagTtlMs?: number;
}

export interface RedisSessionCoordinator extends SessionCoordinator {
  /** Subscribe to this worker's cancel channel. Returns unsubscribe. */
  startCancelSubscription(workerId: string): Promise<() => Promise<void>>;
  /** True if a cancel was requested for the session. */
  isCancelRequested(sessionId: string): Promise<boolean>;
  /** Atomically consumes a cancel only when it targets this task generation. */
  consumeCancelRequest(sessionId: string, taskId: string): Promise<boolean>;
  /** Checks a generation-scoped cancel without consuming it. */
  isCancelRequestedForTask(sessionId: string, taskId: string): Promise<boolean>;
}

export async function connectRedis(url: string): Promise<RedisClientType> {
  const client = createClient({ url });
  client.on("error", (err) => {
    console.error("[redis]", err instanceof Error ? err.message : err);
  });
  await client.connect();
  return client as RedisClientType;
}

export function createRedisSessionCoordinator(
  opts: RedisSessionCoordinatorOptions,
): RedisSessionCoordinator {
  const { redis, onCancel } = opts;
  const cancelFlagTtlMs = opts.cancelFlagTtlMs ?? 600_000;

  return {
    async acquireLease(sessionId, workerId, ttlMs): Promise<boolean> {
      const result = await redis.set(leaseKey(sessionId), workerId, {
        NX: true,
        PX: ttlMs,
      });
      return result === "OK";
    },

    async renewLease(sessionId, workerId, ttlMs): Promise<boolean> {
      const result = await redis.eval(RENEW_LUA, {
        keys: [leaseKey(sessionId)],
        arguments: [workerId, String(ttlMs)],
      });
      return result === 1;
    },

    async releaseLease(sessionId, workerId): Promise<void> {
      await redis.eval(RELEASE_LUA, {
        keys: [leaseKey(sessionId)],
        arguments: [workerId],
      });
    },

    async resolveOwner(sessionId): Promise<string | null> {
      return redis.get(leaseKey(sessionId));
    },

    async routeCancel(sessionId): Promise<void> {
      const result = (await redis.eval(ROUTE_CANCEL_LUA, {
        keys: [
          leaseKey(sessionId),
          sessionAdmissionKey(sessionId),
          cancelFlagKey(sessionId),
        ],
        arguments: [String(cancelFlagTtlMs)],
      })) as [string, string];
      if (result[0] === "owner") {
        await redis.publish(cancelChannel(result[1]), sessionId);
        onCancel?.(sessionId);
      }
    },

    async getActiveSessions(): Promise<string[]> {
      const active: string[] = [];
      for await (const key of redis.scanIterator({
        MATCH: `${LEASE_KEY_PREFIX}*`,
        COUNT: 100,
      })) {
        const keyStr = String(key);
        if (keyStr.startsWith(LEASE_KEY_PREFIX)) {
          active.push(keyStr.slice(LEASE_KEY_PREFIX.length));
        }
      }
      return active;
    },

    async startCancelSubscription(workerId: string): Promise<() => Promise<void>> {
      const subscriber = redis.duplicate();
      await subscriber.connect();
      const channel = cancelChannel(workerId);
      await subscriber.subscribe(channel, (message) => {
        onCancel?.(message);
      });
      return async () => {
        await subscriber.unsubscribe(channel);
        await subscriber.quit();
      };
    },

    async isCancelRequested(sessionId: string): Promise<boolean> {
      const flag = await redis.get(cancelFlagKey(sessionId));
      return flag !== null;
    },

    async consumeCancelRequest(sessionId: string, taskId: string): Promise<boolean> {
      const result = await redis.eval(CONSUME_CANCEL_LUA, {
        keys: [cancelFlagKey(sessionId)],
        arguments: [taskId],
      });
      return result === 1;
    },

    async isCancelRequestedForTask(sessionId: string, taskId: string): Promise<boolean> {
      return (await redis.get(cancelFlagKey(sessionId))) === taskId;
    },
  };
}
