import type { EventProjector, EventSink, RelayEvent } from "@relay/types";

export interface ProjectorEventSinkOptions {
  /** Invoked when a background persist fails (write still resolves immediately). */
  onPersistError?: (event: RelayEvent, error: unknown) => void;
  /**
   * Batch consecutive `token.streamed` events into one persist transaction.
   * Fanout stays per-token; only persistence batches. `0` disables (default).
   */
  tokenBatchSize?: number;
  /** Flush a partial token batch after this many ms (default 10 when batching). */
  tokenBatchFlushMs?: number;
}

/**
 * Local EventSink adapter: `write()` resolves immediately; events persist serially
 * on a background chain so the emit hot path never blocks on storage.
 * Persist failures are tracked — `flush()` rejects if any write in the chain failed.
 * Optional token batching coalesces high-frequency `token.streamed` writes.
 * Remote: swap for a distributed append-only log implementing `EventSink`.
 */
export function createProjectorEventSink(
  projector: EventProjector,
  opts: ProjectorEventSinkOptions = {},
): EventSink {
  type Lane = {
    chain: Promise<void>;
    persistError: unknown;
    tokenBatch: RelayEvent[];
    flushTimer: ReturnType<typeof setTimeout> | null;
  };
  const lanes = new Map<string, Lane>();
  const tokenBatchSize = opts.tokenBatchSize ?? 0;
  const tokenBatchFlushMs = opts.tokenBatchFlushMs ?? 10;
  const batchingEnabled = tokenBatchSize > 0;

  function laneFor(sessionId: string): Lane {
    let lane = lanes.get(sessionId);
    if (!lane) {
      lane = {
        chain: Promise.resolve(),
        persistError: null,
        tokenBatch: [],
        flushTimer: null,
      };
      lanes.set(sessionId, lane);
    }
    return lane;
  }

  async function persistEvents(events: RelayEvent[]): Promise<void> {
    if (events.length === 0) return;
    if (projector.persistBatch) {
      await projector.persistBatch(events);
      return;
    }
    for (const event of events) {
      await projector.persist(event);
    }
  }

  function enqueuePersist(lane: Lane, events: RelayEvent[]): void {
    if (events.length === 0) return;
    const batch = events.slice();
    const next = lane.chain.then(() => persistEvents(batch));
    lane.chain = next.catch((error) => {
      lane.persistError = error;
      const failed = batch[0]!;
      try {
        opts.onPersistError?.(failed, error);
      } catch (callbackError) {
        console.error(
          `[EventSink] onPersistError failed for event ${failed.id}:`,
          callbackError instanceof Error ? callbackError.message : callbackError,
        );
      }
      console.error(
        `[EventSink] persist failed for event ${failed.id}:`,
        error instanceof Error ? error.message : error,
      );
    });
  }

  function clearFlushTimer(lane: Lane): void {
    if (lane.flushTimer !== null) {
      clearTimeout(lane.flushTimer);
      lane.flushTimer = null;
    }
  }

  function flushTokenBatch(_sessionId: string, lane: Lane): void {
    clearFlushTimer(lane);
    if (lane.tokenBatch.length === 0) return;
    const batch = lane.tokenBatch;
    lane.tokenBatch = [];
    enqueuePersist(lane, batch);
  }

  function scheduleTokenFlush(sessionId: string, lane: Lane): void {
    if (lane.flushTimer !== null) return;
    lane.flushTimer = setTimeout(() => {
      lane.flushTimer = null;
      flushTokenBatch(sessionId, lane);
    }, tokenBatchFlushMs);
  }

  async function flushQueuedLane(sessionId: string, lane: Lane): Promise<void> {
    flushTokenBatch(sessionId, lane);
    await lane.chain;
  }

  async function flushLane(sessionId: string, lane: Lane): Promise<void> {
    while (true) {
      flushTokenBatch(sessionId, lane);
      const target = lane.chain;
      await target;
      if (lane.chain === target && lane.tokenBatch.length === 0) break;
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

      if (batchingEnabled && event.type === "token.streamed") {
        lane.tokenBatch.push(event);
        if (lane.tokenBatch.length >= tokenBatchSize) {
          flushTokenBatch(event.sessionId, lane);
        } else {
          scheduleTokenFlush(event.sessionId, lane);
        }
        return Promise.resolve();
      }

      // Non-token events must observe prior tokens in order.
      flushTokenBatch(event.sessionId, lane);
      enqueuePersist(lane, [event]);
      return Promise.resolve();
    },
    async flushQueued(sessionId: string): Promise<void> {
      const lane = lanes.get(sessionId);
      if (lane) await flushQueuedLane(sessionId, lane);
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
