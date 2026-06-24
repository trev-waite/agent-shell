import type { Message } from "@relay/providers";
import type { RelayEvent } from "@relay/types";

export interface CheckpointData {
  iteration: number;
  messages: Message[];
}

export interface CheckpointSummary {
  checkpointId: string;
  label?: string;
  timestamp: number;
  iteration?: number;
}

export type CheckpointSavedEvent = Extract<RelayEvent, { type: "checkpoint.saved" }>;

export function parseCheckpointData(data: unknown): CheckpointData {
  if (data === null || typeof data !== "object") {
    throw new Error("Invalid checkpoint data");
  }

  const record = data as Record<string, unknown>;
  if (typeof record.iteration !== "number" || !Number.isFinite(record.iteration)) {
    throw new Error("Invalid checkpoint iteration");
  }
  if (!Array.isArray(record.messages)) {
    throw new Error("Invalid checkpoint messages");
  }

  for (const message of record.messages) {
    if (message === null || typeof message !== "object") {
      throw new Error("Invalid message in checkpoint");
    }
    const entry = message as Record<string, unknown>;
    const role = entry.role;
    if (role !== "user" && role !== "assistant" && role !== "tool" && role !== "system") {
      throw new Error("Invalid message role in checkpoint");
    }
    if (typeof entry.content !== "string") {
      throw new Error("Invalid message content in checkpoint");
    }
  }

  return {
    iteration: record.iteration,
    messages: record.messages as Message[],
  };
}

export function findCheckpointEvent(
  events: RelayEvent[],
  checkpointId?: string,
): CheckpointSavedEvent {
  const checkpoints = events.filter(
    (event): event is CheckpointSavedEvent => event.type === "checkpoint.saved",
  );

  if (checkpoints.length === 0) {
    throw new Error("No checkpoints found for session");
  }

  if (checkpointId) {
    const found = checkpoints.find((event) => event.payload.checkpointId === checkpointId);
    if (!found) {
      throw new Error(`Checkpoint not found: ${checkpointId}`);
    }
    return found;
  }

  return checkpoints[checkpoints.length - 1]!;
}

export function listCheckpointSummaries(events: RelayEvent[]): CheckpointSummary[] {
  return events
    .filter((event): event is CheckpointSavedEvent => event.type === "checkpoint.saved")
    .map((event) => {
      const data = event.payload.data;
      const iteration =
        data !== null && typeof data === "object" && "iteration" in data
          ? (data as { iteration?: number }).iteration
          : undefined;

      return {
        checkpointId: event.payload.checkpointId,
        ...(event.payload.label !== undefined ? { label: event.payload.label } : {}),
        timestamp: event.timestamp,
        ...(iteration !== undefined ? { iteration } : {}),
      };
    });
}
