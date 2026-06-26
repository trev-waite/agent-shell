import { EventEmitter } from "node:events";
import type { EventHandler, LiveEventPublisher, RelayEvent } from "@relay/types";

/** Local adapter — in-process EventEmitter. Remote: `packages/pubsub` (Redis/NATS). */
export function createLocalLiveEventPublisher(): LiveEventPublisher {
  const bus = new EventEmitter();
  bus.setMaxListeners(100);

  return {
    publish(sessionId: string, event: RelayEvent): void {
      bus.emit(`session:${sessionId}`, event);
    },
    subscribe(sessionId: string, handler: EventHandler): () => void {
      const listener = (event: RelayEvent) => handler(event);
      bus.on(`session:${sessionId}`, listener);
      return () => bus.off(`session:${sessionId}`, listener);
    },
  };
}
