import type {
  DurableExecutor,
  ExecutionStatus,
  ExecutionTask,
  SessionCoordinator,
} from "@relay/types";
import type { Runtime } from "../../runtime.js";

export interface LocalDurableExecutorOptions {
  runtime: Runtime;
  coordinator: SessionCoordinator;
  workerId: string;
}

/** Local adapter — runs loop in-process. Remote: `packages/dispatch` (queue/Temporal). */
export function createLocalDurableExecutor(opts: LocalDurableExecutorOptions): DurableExecutor {
  const { runtime, coordinator } = opts;

  return {
    async execute(task: ExecutionTask): Promise<{ sessionId: string }> {
      switch (task.kind) {
        case "execute": {
          if (!task.prompt) {
            throw new Error("prompt is required for execute");
          }
          const sessionId = await runtime.execute({
            prompt: task.prompt,
            ...(task.sessionId !== undefined ? { sessionId: task.sessionId } : {}),
            ...(task.model !== undefined ? { model: task.model } : {}),
          });
          return { sessionId };
        }
        case "continue": {
          if (!task.sessionId) {
            throw new Error("sessionId is required for continue");
          }
          if (!task.prompt) {
            throw new Error("prompt is required for continue");
          }
          const sessionId = await runtime.continue({
            sessionId: task.sessionId,
            prompt: task.prompt,
            ...(task.model !== undefined ? { model: task.model } : {}),
          });
          return { sessionId };
        }
        case "rerun": {
          if (!task.sessionId) {
            throw new Error("sessionId is required for rerun");
          }
          const sessionId = await runtime.rerun({
            sessionId: task.sessionId,
            ...(task.checkpointId !== undefined ? { checkpointId: task.checkpointId } : {}),
            ...(task.model !== undefined ? { model: task.model } : {}),
          });
          return { sessionId };
        }
        default:
          throw new Error(`Unknown execution task kind: ${(task as ExecutionTask).kind}`);
      }
    },

    async cancel(sessionId: string): Promise<void> {
      runtime.cancel({ sessionId });
    },

    async getStatus(sessionId: string): Promise<ExecutionStatus> {
      const owner = await coordinator.resolveOwner(sessionId);
      return {
        sessionId,
        status: await runtime.getSessionStatus(sessionId),
        active: runtime.isSessionActive(sessionId),
        ...(owner !== null ? { workerId: owner } : {}),
      };
    },
  };
}
