import { EventEmitter } from "node:events";
import type { EventHandler, LiveEventPublisher, RelayEvent } from "@relay/types";
import type { RedisClientType } from "redis";
import { eventStreamKey } from "./keys.js";

export interface RedisLiveEventPublisherOptions {
  redis: RedisClientType;
  /** Max stream length per session (approximate trimming). */
  maxlen?: number;
}

/**
 * Redis Streams-backed LiveEventPublisher for workers.
 * publish() queues XADD asynchronously so Redis RTT never stalls emit.
 * subscribe() is in-process only; gateways use createSessionLiveBroker() for Redis.
 */
export function createRedisLiveEventPublisher(
  opts: RedisLiveEventPublisherOptions,
): LiveEventPublisher & {
  flush(sessionId?: string): Promise<void>;
  readAfter(sessionId: string, afterStreamId: string, count?: number): Promise<RelayEvent[]>;
} {
  const { redis } = opts;
  const maxlen = opts.maxlen ?? 10_000;

  const local = new Map<string, EventEmitter>();
  const publishChains = new Map<string, Promise<void>>();

  function getLocal(sessionId: string): EventEmitter {
    let emitter = local.get(sessionId);
    if (!emitter) {
      emitter = new EventEmitter();
      emitter.setMaxListeners(100);
      local.set(sessionId, emitter);
    }
    return emitter;
  }

  return {
    publish(sessionId: string, event: RelayEvent): void {
      getLocal(sessionId).emit("event", event);

      const chain = publishChains.get(sessionId) ?? Promise.resolve();
      const next = chain
        .then(async () => {
          await redis.xAdd(
            eventStreamKey(sessionId),
            "*",
            { event: JSON.stringify(event) },
            {
              TRIM: {
                strategy: "MAXLEN",
                strategyModifier: "~",
                threshold: maxlen,
              },
            },
          );
        })
        .catch((err) => {
          console.error(
            `[pubsub] XADD failed for session ${sessionId}:`,
            err instanceof Error ? err.message : err,
          );
        });
      publishChains.set(sessionId, next);
    },

    subscribe(sessionId: string, handler: EventHandler): () => void {
      const emitter = getLocal(sessionId);
      const onEvent = (event: RelayEvent) => handler(event);
      emitter.on("event", onEvent);
      return () => {
        emitter.off("event", onEvent);
      };
    },

    async flush(sessionId?: string): Promise<void> {
      if (sessionId !== undefined) {
        const chain = publishChains.get(sessionId);
        if (chain) {
          await chain;
          if (publishChains.get(sessionId) === chain) publishChains.delete(sessionId);
        }
        return;
      }
      await Promise.all(publishChains.values());
      publishChains.clear();
    },

    async readAfter(
      sessionId: string,
      afterStreamId: string,
      count = 500,
    ): Promise<RelayEvent[]> {
      const rows = await redis.xRange(
        eventStreamKey(sessionId),
        afterStreamId === "0-0" ? "-" : `(${afterStreamId}`,
        "+",
        { COUNT: count },
      );
      const events: RelayEvent[] = [];
      for (const row of rows) {
        const raw = row.message.event;
        if (typeof raw === "string") {
          events.push(JSON.parse(raw) as RelayEvent);
        }
      }
      return events;
    },
  };
}

/**
 * Gateway SessionLiveBroker: one Redis stream poller per session, fan-out to
 * many SSE handlers. Avoids N Redis connections per SSE client.
 *
 * Callers should subscribe BEFORE replaying from the durable store, buffer
 * live events, then merge/dedupe by event.id (ULID).
 */
export function createSessionLiveBroker(redis: RedisClientType): {
  subscribe(sessionId: string, handler: EventHandler): {
    ready: Promise<void>;
    unsubscribe: () => void;
  };
  close(): Promise<void>;
} {
  type Entry = {
    handlers: Set<EventHandler>;
    ready: Promise<void>;
    stop: () => void;
  };
  const sessions = new Map<string, Entry>();

  function startPoller(
    sessionId: string,
    handlers: Set<EventHandler>,
  ): { ready: Promise<void>; stop: () => void } {
    let stopped = false;
    const reader = redis.duplicate();
    let markReady!: () => void;
    let markFailed!: (error: unknown) => void;
    const ready = new Promise<void>((resolve, reject) => {
      markReady = resolve;
      markFailed = reject;
    });
    const poll = async () => {
      await reader.connect();
      // Replay the retained live window. Starting at "$" or a captured latest ID
      // can lose an event that reached Redis just before its Postgres write.
      let lastId = "0-0";
      markReady();
      while (!stopped) {
        try {
          const result = await reader.xRead(
            { key: eventStreamKey(sessionId), id: lastId },
            { BLOCK: 2_000, COUNT: 100 },
          );
          if (!result || result.length === 0) continue;
          for (const stream of result) {
            for (const message of stream.messages) {
              lastId = message.id;
              const raw = message.message.event;
              if (typeof raw !== "string") continue;
              const event = JSON.parse(raw) as RelayEvent;
              for (const handler of [...handlers]) {
                handler(event);
              }
            }
          }
        } catch (err) {
          if (stopped) break;
          console.error(
            `[SessionLiveBroker] XREAD failed for ${sessionId}:`,
            err instanceof Error ? err.message : err,
          );
          await new Promise((r) => setTimeout(r, 500));
        }
      }
    };
    void poll().catch((err) => {
      markFailed(err);
      if (!stopped) {
        console.error(
          `[SessionLiveBroker] poller failed for ${sessionId}:`,
          err instanceof Error ? err.message : err,
        );
      }
    });
    return {
      ready,
      stop: () => {
        stopped = true;
        reader.destroy();
      },
    };
  }

  return {
    subscribe(sessionId: string, handler: EventHandler) {
      let entry = sessions.get(sessionId);
      if (!entry) {
        const handlers = new Set<EventHandler>();
        const { ready, stop } = startPoller(sessionId, handlers);
        entry = { handlers, ready, stop };
        sessions.set(sessionId, entry);
      }
      entry.handlers.add(handler);

      const unsubscribe = () => {
        const current = sessions.get(sessionId);
        if (!current) return;
        current.handlers.delete(handler);
        if (current.handlers.size === 0) {
          current.stop();
          sessions.delete(sessionId);
        }
      };
      return { ready: entry.ready, unsubscribe };
    },

    async close(): Promise<void> {
      for (const entry of sessions.values()) entry.stop();
      sessions.clear();
    },
  };
}
