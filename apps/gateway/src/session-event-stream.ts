import type { ExecutionStore, EventHandler, RelayEvent } from "@relay/types";

export interface LiveBroker {
  subscribe(sessionId: string, handler: EventHandler): {
    ready: Promise<void>;
    unsubscribe: () => void;
  };
}

/**
 * Subscribe-first SSE join: open live subscription, buffer while replaying
 * durable history, then merge by ULID and switch to live-only emit.
 */
export async function attachSessionEventStream(opts: {
  store: ExecutionStore;
  liveBroker: LiveBroker;
  sessionId: string;
  afterId: string | undefined;
  sendEvent: (event: RelayEvent) => void;
  onClose: (unsubscribe: () => void) => void;
}): Promise<void> {
  const { store, liveBroker, sessionId, afterId, sendEvent, onClose } = opts;
  const sentIds = new Set<string>();
  const sentOrder: string[] = [];
  const maxRememberedIds = 20_000;
  const liveBuffer: RelayEvent[] = [];
  let replaying = true;

  const emit = (event: RelayEvent) => {
    if (sentIds.has(event.id)) return;
    sentIds.add(event.id);
    sentOrder.push(event.id);
    if (sentOrder.length > maxRememberedIds) {
      sentIds.delete(sentOrder.shift()!);
    }
    sendEvent(event);
  };

  const subscription = liveBroker.subscribe(sessionId, (event) => {
    if (replaying) {
      liveBuffer.push(event);
      return;
    }
    emit(event);
  });
  onClose(subscription.unsubscribe);
  await subscription.ready;

  const historical = await store.events.getBySession(sessionId, afterId);
  for (const event of historical) {
    emit(event);
  }

  liveBuffer.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const event of liveBuffer) {
    emit(event);
  }
  replaying = false;
}
