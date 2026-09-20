import type { RedisClientType } from "@relay/coordination";
import {
  ackTask,
  claimNextTask,
  heartbeatTask,
  reclaimIdleTask,
} from "@relay/dispatch";
import { createRedisLiveEventPublisher } from "@relay/pubsub";

export const CLAIM_BLOCK_MS = 5_000;

export interface WorkerRedisClients {
  workRedis: RedisClientType;
  claimRedis: RedisClientType;
}

export async function createWorkerRedisClients(
  redis: RedisClientType,
): Promise<WorkerRedisClients> {
  const claimRedis = redis.duplicate();
  if (claimRedis === redis) {
    throw new Error("claim Redis client must be redis.duplicate(), not the work client");
  }
  await claimRedis.connect();
  return { workRedis: redis, claimRedis };
}

export function bindWorkerRedis(clients: WorkerRedisClients) {
  const { workRedis, claimRedis } = clients;
  if (workRedis === claimRedis) {
    throw new Error("claimRedis must be a separate connection");
  }

  return {
    claimNext: (workerId: string, blockMs = CLAIM_BLOCK_MS) =>
      claimNextTask(claimRedis, workerId, blockMs),
    reclaimIdle: (workerId: string) => reclaimIdleTask(claimRedis, workerId),
    heartbeat: (
      workerId: string,
      streamId: string,
      idempotencyId?: string,
      sessionId?: string,
    ) => heartbeatTask(workRedis, workerId, streamId, idempotencyId, sessionId),
    ack: (streamId: string) => ackTask(workRedis, streamId),
    createLivePublisher: () => createRedisLiveEventPublisher({ redis: workRedis }),
  };
}
