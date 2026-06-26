import type { EventProjector, EventSink, RelayEvent } from "@relay/types";

/**
 * Local EventSink adapter: `write()` resolves immediately; events persist serially
 * on a background chain so the emit hot path never blocks on storage.
 * Remote: swap for a distributed append-only log implementing `EventSink`.
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
