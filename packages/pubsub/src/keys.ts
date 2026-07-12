export const EVENT_STREAM_PREFIX = "relay:events:";

export function eventStreamKey(sessionId: string): string {
  return `${EVENT_STREAM_PREFIX}${sessionId}`;
}
