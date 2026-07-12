import { hostname } from "node:os";
import type { ReasoningLevel } from "@relay/providers";
import { createGeminiProvider } from "@relay/providers";
import {
  connectRedis,
  createRedisSessionCoordinator,
} from "@relay/coordination";
import {
  ackTask,
  claimIdempotencyKey,
  claimNextTask,
  completeIdempotencyKey,
  getIdempotencyState,
  heartbeatTask,
  releaseIdempotencyKey,
  releaseSessionTask,
} from "@relay/dispatch";
import type { ExecutionTask } from "@relay/types";
import { createRedisLiveEventPublisher } from "@relay/pubsub";
import {
  createLocalDurableExecutor,
  createRuntime,
} from "@relay/runtime";
import {
  createProjectorEventSink,
  openPostgresStorage,
} from "@relay/storage";
import { createToolRegistry } from "@relay/tool-registry";
import { registerTools } from "@relay/tools";
import {
  DEFAULT_GEMINI_MODEL,
  isGeminiModelId,
} from "@relay/types";

const REASONING_LEVELS = new Set<ReasoningLevel>([
  "minimal",
  "low",
  "medium",
  "high",
  "none",
  "provider-default",
]);

function parseGeminiReasoning(value: string | undefined): ReasoningLevel | undefined {
  if (!value) return undefined;
  if (REASONING_LEVELS.has(value as ReasoningLevel)) {
    return value as ReasoningLevel;
  }
  console.warn(`Ignoring invalid GEMINI_REASONING value: ${value}`);
  return undefined;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} environment variable is required`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const apiKey = requireEnv("GEMINI_API_KEY");
  const redisUrl = requireEnv("REDIS_URL");
  const databaseUrl = requireEnv("RELAY_DATABASE_URL");
  const workerId =
    process.env.WORKER_ID?.trim() ||
    process.env.HOSTNAME?.trim() ||
    `worker-${hostname()}-${process.pid}`;
  const workspaceDir = process.env.WORKSPACE_DIR ?? process.cwd();

  const defaultModel =
    process.env.GEMINI_MODEL && isGeminiModelId(process.env.GEMINI_MODEL)
      ? process.env.GEMINI_MODEL
      : DEFAULT_GEMINI_MODEL;
  const geminiReasoning = parseGeminiReasoning(process.env.GEMINI_REASONING);

  const redis = await connectRedis(redisUrl);
  const { store, projector, close: closeDb } = await openPostgresStorage(databaseUrl);
  const eventSink = createProjectorEventSink(projector);

  const toolRegistry = createToolRegistry();
  registerTools(toolRegistry, workspaceDir);

  const provider = createGeminiProvider({
    apiKey,
    model: defaultModel,
    ...(geminiReasoning !== undefined ? { reasoning: geminiReasoning } : {}),
  });

  const livePublisher = createRedisLiveEventPublisher({ redis });

  let runtime: ReturnType<typeof createRuntime>;
  const sessionCoordinator = createRedisSessionCoordinator({
    redis,
    onCancel: (sessionId) => {
      runtime.cancel({ sessionId });
    },
  });

  runtime = createRuntime({
    store,
    eventSink,
    sessionCoordinator,
    livePublisher,
    provider,
    toolRegistry,
    workerId,
  });

  const executor = createLocalDurableExecutor({
    runtime,
    coordinator: sessionCoordinator,
    workerId,
  });

  const stopCancel = await sessionCoordinator.startCancelSubscription(workerId);
  const configuredConcurrency = Number.parseInt(
    process.env.WORKER_CONCURRENCY ?? "4",
    10,
  );
  const concurrency = Number.isFinite(configuredConcurrency) && configuredConcurrency > 0
    ? configuredConcurrency
    : 4;

  console.log(
    `Relay worker ${workerId} ready (workspace=${workspaceDir})`,
  );

  let stopping = false;
  const activeTasks = new Set<Promise<void>>();
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    console.log("Worker shutting down…");
    await stopCancel();
    await runtime.shutdown();
    await Promise.allSettled(activeTasks);
    await livePublisher.flush?.();
    await closeDb();
    await redis.quit();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  const processTask = async (
    streamId: string,
    task: ExecutionTask,
  ): Promise<void> => {
    const taskId = task.idempotencyKey;
    if (
      task.sessionId &&
      taskId &&
      (await sessionCoordinator.isCancelRequestedForTask(task.sessionId, taskId))
    ) {
      console.log(`Skipping cancelled task for session ${task.sessionId}`);
      await runtime.recordQueuedCancellation(task.sessionId);
      await sessionCoordinator.consumeCancelRequest(task.sessionId, taskId);
      await completeIdempotencyKey(redis, taskId);
      await releaseSessionTask(redis, task.sessionId, taskId);
      await ackTask(redis, streamId);
      return;
    }

    if (taskId) {
      const claimedKey = await claimIdempotencyKey(redis, taskId);
      if (!claimedKey) {
        const state = await getIdempotencyState(redis, taskId);
        if (state === "completed") {
          console.log(`Completed duplicate task ${taskId}; acking`);
          if (task.sessionId) await releaseSessionTask(redis, task.sessionId, taskId);
          await ackTask(redis, streamId);
        }
        return;
      }
    }

    let heartbeat: ReturnType<typeof setInterval> | undefined;
    try {
      heartbeat = setInterval(() => {
        void heartbeatTask(
          redis,
          workerId,
          streamId,
          taskId,
          task.sessionId,
        ).catch((err) => {
          console.error("Task heartbeat failed:", err instanceof Error ? err.message : err);
        });
      }, 20_000);
      const { sessionId } = await executor.execute(task);
      // Close the queue-to-lease handoff race: cancellation may have been
      // generation-scoped after the first check but before lease acquisition.
      if (taskId && await sessionCoordinator.consumeCancelRequest(sessionId, taskId)) {
        runtime.cancel({ sessionId });
      }
      await runtime.waitForSession(sessionId);
      if (stopping) throw new Error("Worker stopped before task acknowledgement");
      if (taskId) await completeIdempotencyKey(redis, taskId);
      if (taskId && task.sessionId) {
        await releaseSessionTask(redis, task.sessionId, taskId);
      }
      await ackTask(redis, streamId);
    } catch (err) {
      if (taskId) await releaseIdempotencyKey(redis, taskId);
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Task ${task.kind} failed; leaving pending for retry:`, message);
    } finally {
      if (heartbeat) clearInterval(heartbeat);
    }
  };

  while (!stopping) {
    try {
      if (activeTasks.size >= concurrency) {
        await Promise.race(activeTasks);
        continue;
      }
      const claimed = await claimNextTask(redis, workerId, 5_000);
      if (!claimed) continue;
      if (stopping) break;
      const promise = processTask(claimed.streamId, claimed.task)
        .catch((err) => {
          console.error("Task processing error:", err instanceof Error ? err.message : err);
        })
        .finally(() => activeTasks.delete(promise));
      activeTasks.add(promise);
    } catch (err) {
      console.error(
        "Worker loop error:",
        err instanceof Error ? err.message : err,
      );
      await new Promise((r) => setTimeout(r, 1_000));
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : "Worker failed to start");
  process.exit(1);
});
