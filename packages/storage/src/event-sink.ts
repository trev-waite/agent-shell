import type { EventProjector, EventSink, RelayEvent } from "@relay/types";

/**
 * Async persistence adapter: `write()` resolves immediately; events are persisted
 * serially on a background chain so the emit hot path never blocks on storage.
 */
export function createProjectorEventSink(projector: EventProjector): EventSink {
  let chain = Promise.resolve();

  return {
    write(event: RelayEvent): Promise<void> {
      const next = chain.then(() => {
        projector.persist(event);
      });
      chain = next.catch(() => {});
      return Promise.resolve();
    },
    flush(): Promise<void> {
      return chain;
    },
  };
}
