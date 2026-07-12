import type { EventProjector, EventSink, RelayEvent } from "@relay/types";

export interface ProjectorEventSinkOptions {
  /** Invoked when a background persist fails (write still resolves immediately). */
  onPersistError?: (event: RelayEvent, error: unknown) => void;
}

/**
 * Local EventSink adapter: `write()` resolves immediately; events persist serially
 * on a background chain so the emit hot path never blocks on storage.
 * Persist failures are tracked — `flush()` rejects if any write in the chain failed.
 * Remote: swap for a distributed append-only log implementing `EventSink`.
 */
export function createProjectorEventSink(
  projector: EventProjector,
  opts: ProjectorEventSinkOptions = {},
): EventSink {
  type Lane = { chain: Promise<void>; persistError: unknown };
  const lanes = new Map<string, Lane>();

  function laneFor(sessionId: string): Lane {
    let lane = lanes.get(sessionId);
    if (!lane) {
      lane = { chain: Promise.resolve(), persistError: null };
      lanes.set(sessionId, lane);
    }
    return lane;
  }

  async function flushLane(sessionId: string, lane: Lane): Promise<void> {
    while (true) {
      const target = lane.chain;
      await target;
      if (lane.chain === target) break;
    }
    if (lane.persistError !== null) {
      const error = lane.persistError;
      lane.persistError = null;
      if (lanes.get(sessionId) === lane) lanes.delete(sessionId);
      throw error instanceof Error ? error : new Error(String(error));
    }
    if (lanes.get(sessionId) === lane) {
      lanes.delete(sessionId);
    }
  }

  return {
    write(event: RelayEvent): Promise<void> {
      const lane = laneFor(event.sessionId);
      const next = lane.chain.then(() => projector.persist(event));
      lane.chain = next.catch((error) => {
        lane.persistError = error;
        try {
          opts.onPersistError?.(event, error);
        } catch (callbackError) {
          console.error(
            `[EventSink] onPersistError failed for event ${event.id}:`,
            callbackError instanceof Error ? callbackError.message : callbackError,
          );
        }
        console.error(
          `[EventSink] persist failed for event ${event.id}:`,
          error instanceof Error ? error.message : error,
        );
        // Keep the chain alive for subsequent writes, but remember the failure.
      });
      return Promise.resolve();
    },
    async flush(sessionId?: string): Promise<void> {
      if (sessionId !== undefined) {
        const lane = lanes.get(sessionId);
        if (lane) await flushLane(sessionId, lane);
        return;
      }
      const results = await Promise.allSettled(
        [...lanes].map(([id, lane]) => flushLane(id, lane)),
      );
      const rejected = results.find(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );
      if (rejected) throw rejected.reason;
    },
  };
}
