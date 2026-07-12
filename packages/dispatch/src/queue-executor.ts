import type {
  DurableExecutor,
  ExecutionStatus,
  ExecutionTask,
  SessionCoordinator,
  SessionStatus,
} from "@relay/types";
import type { RedisClientType } from "redis";
import { ulid } from "ulid";
import {
  IDEMPOTENCY_KEY_PREFIX,
  TASK_GROUP,
  TASK_STREAM_KEY,
  idempotencyKey,
  sessionAdmissionKey,
} from "./keys.js";

export { TASK_GROUP, TASK_STREAM_KEY, IDEMPOTENCY_KEY_PREFIX, idempotencyKey };

const DEFAULT_IDEMPOTENCY_TTL_MS = 86_400_000;
const DEFAULT_RUNNING_TTL_MS = 60_000;
const DEFAULT_ADMISSION_TTL_MS = 600_000;
const DEFAULT_RECLAIM_IDLE_MS = 30_000;

const RESERVE_SESSION_LUA = `
if redis.call("EXISTS", KEYS[1]) == 1 or redis.call("EXISTS", KEYS[2]) == 1 then
  return 0
end
redis.call("SET", KEYS[2], ARGV[1], "PX", ARGV[2])
return 1
`;

const RELEASE_IF_VALUE_LUA = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`;

const CLAIM_IDEMPOTENCY_LUA = `
local current = redis.call("GET", KEYS[1])
if current == "completed" then return 0 end
if current == "running" then return 0 end
redis.call("SET", KEYS[1], "running", "PX", ARGV[1])
return 1
`;

const RENEW_IDEMPOTENCY_LUA = `
if redis.call("GET", KEYS[1]) == "running" then
  return redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
return 0
`;

const RENEW_ADMISSION_LUA = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("PEXPIRE", KEYS[1], ARGV[2])
end
return 0
`;

export interface QueueDurableExecutorOptions {
  redis: RedisClientType;
  coordinator: SessionCoordinator;
  /** Used by getStatus when no runtime is present on the gateway. */
  getSessionStatus?: (sessionId: string) => SessionStatus | Promise<SessionStatus>;
  idempotencyTtlMs?: number;
  /** Maximum time a task may wait in the stream before admission expires. */
  admissionTtlMs?: number;
}

export interface ClaimedTask {
  streamId: string;
  task: ExecutionTask;
}

/**
 * Gateway-side DurableExecutor: enqueues tasks onto a Redis Stream and routes
 * cancel via SessionCoordinator. Does not run ReActLoop.
 */
export function createQueueDurableExecutor(
  opts: QueueDurableExecutorOptions,
): DurableExecutor {
  const { redis, coordinator } = opts;

  return {
    async execute(task: ExecutionTask): Promise<{ sessionId: string }> {
      if (task.kind === "execute" && !task.sessionId) {
        throw new Error("sessionId is required for queue execute");
      }
      if ((task.kind === "continue" || task.kind === "rerun") && !task.sessionId) {
        throw new Error(`sessionId is required for ${task.kind}`);
      }
      if ((task.kind === "execute" || task.kind === "continue") && !task.prompt) {
        throw new Error(`prompt is required for ${task.kind}`);
      }

      const payload: ExecutionTask = {
        ...task,
        idempotencyKey: task.idempotencyKey ?? ulid(),
      };

      const admitted = await reserveSessionTask(
        redis,
        payload.sessionId!,
        payload.idempotencyKey!,
        opts.admissionTtlMs,
      );
      if (!admitted) {
        throw new Error("Session is already queued or running");
      }

      try {
        await ensureTaskGroup(redis);
        await redis.xAdd(TASK_STREAM_KEY, "*", {
          task: JSON.stringify(payload),
        });
      } catch (err) {
        await releaseSessionTask(redis, payload.sessionId!, payload.idempotencyKey!);
        throw err;
      }

      return { sessionId: payload.sessionId! };
    },

    async cancel(sessionId: string): Promise<void> {
      await coordinator.routeCancel(sessionId);
    },

    async getStatus(sessionId: string): Promise<ExecutionStatus> {
      const owner = await coordinator.resolveOwner(sessionId);
      const status = opts.getSessionStatus
        ? await opts.getSessionStatus(sessionId)
        : owner !== null
          ? "running"
          : "idle";
      return {
        sessionId,
        status,
        active: owner !== null,
        ...(owner !== null ? { workerId: owner } : {}),
      };
    },
  };
}

export async function ensureTaskGroup(redis: RedisClientType): Promise<void> {
  try {
    await redis.xGroupCreate(TASK_STREAM_KEY, TASK_GROUP, "0", {
      MKSTREAM: true,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes("BUSYGROUP")) {
      throw err;
    }
  }
}

/**
 * Claim the next task for a worker consumer group member.
 * Returns null on timeout / empty.
 */
export async function claimNextTask(
  redis: RedisClientType,
  consumerId: string,
  blockMs = 5_000,
  reclaimIdleMs = DEFAULT_RECLAIM_IDLE_MS,
): Promise<ClaimedTask | null> {
  await ensureTaskGroup(redis);

  const reclaimed = await redis.xAutoClaim(
    TASK_STREAM_KEY,
    TASK_GROUP,
    consumerId,
    reclaimIdleMs,
    "0-0",
    { COUNT: 1 },
  );
  const reclaimedMessage = reclaimed.messages.find((message) => message !== null);
  if (reclaimedMessage) {
    return parseClaimedTask(redis, reclaimedMessage);
  }

  const result = await redis.xReadGroup(
    TASK_GROUP,
    consumerId,
    { key: TASK_STREAM_KEY, id: ">" },
    { COUNT: 1, BLOCK: blockMs },
  );

  if (!result || result.length === 0) {
    return null;
  }

  const stream = result[0];
  if (!stream || stream.messages.length === 0) {
    return null;
  }

  return parseClaimedTask(redis, stream.messages[0]!);
}

async function parseClaimedTask(
  redis: RedisClientType,
  message: { id: string; message: Record<string, string> },
): Promise<ClaimedTask | null> {
  const raw = message.message.task;
  if (typeof raw !== "string") {
    await redis.xAck(TASK_STREAM_KEY, TASK_GROUP, message.id);
    return null;
  }

  try {
    const task = JSON.parse(raw) as ExecutionTask;
    return { streamId: message.id, task };
  } catch {
    // A malformed entry can never succeed on retry and must not poison the PEL.
    await redis.xAck(TASK_STREAM_KEY, TASK_GROUP, message.id);
    return null;
  }
}

export async function ackTask(
  redis: RedisClientType,
  streamId: string,
): Promise<void> {
  await redis.xAck(TASK_STREAM_KEY, TASK_GROUP, streamId);
}

/**
 * Returns true if this idempotency key was newly claimed (should run).
 * Returns false if already processed (duplicate delivery).
 */
export async function claimIdempotencyKey(
  redis: RedisClientType,
  key: string,
  ttlMs = DEFAULT_RUNNING_TTL_MS,
): Promise<boolean> {
  const result = await redis.eval(CLAIM_IDEMPOTENCY_LUA, {
    keys: [idempotencyKey(key)],
    arguments: [String(ttlMs)],
  });
  return result === 1;
}

export async function heartbeatTask(
  redis: RedisClientType,
  consumerId: string,
  streamId: string,
  idempotencyId?: string,
  sessionId?: string,
  runningTtlMs = DEFAULT_RUNNING_TTL_MS,
  admissionTtlMs = DEFAULT_ADMISSION_TTL_MS,
): Promise<void> {
  await redis.xClaim(
    TASK_STREAM_KEY,
    TASK_GROUP,
    consumerId,
    0,
    streamId,
  );
  if (idempotencyId) {
    await redis.eval(RENEW_IDEMPOTENCY_LUA, {
      keys: [idempotencyKey(idempotencyId)],
      arguments: [String(runningTtlMs)],
    });
    if (sessionId) {
      await redis.eval(RENEW_ADMISSION_LUA, {
        keys: [sessionAdmissionKey(sessionId)],
        arguments: [idempotencyId, String(admissionTtlMs)],
      });
    }
  }
}

export type IdempotencyState = "running" | "completed" | null;

export async function getIdempotencyState(
  redis: RedisClientType,
  key: string,
): Promise<IdempotencyState> {
  const value = await redis.get(idempotencyKey(key));
  return value === "running" || value === "completed" ? value : null;
}

export async function completeIdempotencyKey(
  redis: RedisClientType,
  key: string,
  ttlMs = DEFAULT_IDEMPOTENCY_TTL_MS,
): Promise<void> {
  await redis.set(idempotencyKey(key), "completed", { PX: ttlMs });
}

export async function releaseIdempotencyKey(
  redis: RedisClientType,
  key: string,
): Promise<void> {
  await redis.eval(RELEASE_IF_VALUE_LUA, {
    keys: [idempotencyKey(key)],
    arguments: ["running"],
  });
}

export async function reserveSessionTask(
  redis: RedisClientType,
  sessionId: string,
  taskId: string,
  ttlMs = DEFAULT_ADMISSION_TTL_MS,
): Promise<boolean> {
  const result = await redis.eval(RESERVE_SESSION_LUA, {
    keys: [`relay:lease:${sessionId}`, sessionAdmissionKey(sessionId)],
    arguments: [taskId, String(ttlMs)],
  });
  return result === 1;
}

export async function releaseSessionTask(
  redis: RedisClientType,
  sessionId: string,
  taskId: string,
): Promise<void> {
  await redis.eval(RELEASE_IF_VALUE_LUA, {
    keys: [sessionAdmissionKey(sessionId)],
    arguments: [taskId],
  });
}
