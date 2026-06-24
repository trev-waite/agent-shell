import type { RelayEvent, SessionStatus } from "@relay/types";

export function deriveSessionStatus(events: RelayEvent[]): SessionStatus {
  if (events.length === 0) return "idle";

  const lastError = [...events].reverse().find((e) => e.type === "error");
  const hasCompleted = events.some((e) => e.type === "message.completed");
  const hasStarted = events.some((e) => e.type === "message.started");

  if (lastError) {
    const payload = lastError.payload as { code?: string; recoverable?: boolean };
    if (payload.code === "CANCELLED") return "cancelled";
    if (payload.recoverable) return "paused";
    return "failed";
  }

  if (hasCompleted) return "completed";

  const lastEvent = events[events.length - 1]!;
  const age = Date.now() - lastEvent.timestamp;

  if (hasStarted && age < 300_000) return "running";

  if (hasStarted) return "completed";

  return "idle";
}
