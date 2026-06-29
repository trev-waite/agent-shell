import type { RelayEvent, SessionStatus } from "@relay/types";

const STALE_RUNNING_MS = 300_000;

export function deriveSessionStatus(events: RelayEvent[]): SessionStatus {
  if (events.length === 0) return "idle";

  const lastEvent = events[events.length - 1]!;
  const lastError = [...events].reverse().find((e) => e.type === "error");
  const lastCompleted = [...events].reverse().find((e) => e.type === "session.completed");

  if (lastError) {
    const errorIdx = events.lastIndexOf(lastError);
    const completedIdx = lastCompleted ? events.lastIndexOf(lastCompleted) : -1;
    if (errorIdx > completedIdx) {
      const payload = lastError.payload;
      if (payload.code === "CANCELLED") return "cancelled";
      if (payload.recoverable) return "paused";
      return "failed";
    }
  }

  if (lastCompleted) {
    const completedIdx = events.lastIndexOf(lastCompleted);
    const tail = events.slice(completedIdx + 1);
    const hasOpenTurn =
      tail.some((e) => e.type === "message.started" && e.payload.role === "user") &&
      !tail.some((e) => e.type === "session.completed");

    if (hasOpenTurn) {
      const age = Date.now() - lastEvent.timestamp;
      return age < STALE_RUNNING_MS ? "running" : "failed";
    }
    return "completed";
  }

  const hasStarted = events.some((e) => e.type === "message.started");
  if (!hasStarted) return "idle";

  const age = Date.now() - lastEvent.timestamp;
  return age < STALE_RUNNING_MS ? "running" : "failed";
}
