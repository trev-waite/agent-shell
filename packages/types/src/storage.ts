import type { RelayEvent, Session } from "./events.js";

export interface EventStore {
  append(event: RelayEvent): void;
  getBySession(sessionId: string, afterId?: string): RelayEvent[];
  getLastEventId(sessionId: string): string | null;
}

export interface ExecutionStore {
  createSession(prompt: string): Session;
  getSession(sessionId: string): Session | null;
  listSessions(): Session[];
  events: EventStore;
}

export interface CheckpointStore {
  save(sessionId: string, checkpointId: string, data: unknown): void;
  get(sessionId: string, checkpointId: string): unknown | null;
}

export interface ArtifactStore {
  put(sessionId: string, artifactId: string, data: unknown): void;
  get(sessionId: string, artifactId: string): unknown | null;
}

export interface MessageProjection {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
}

export interface ToolCallProjection {
  id: string;
  sessionId: string;
  toolName: string;
  input: unknown;
  output: unknown | null;
  error: string | null;
  startedAt: number;
  completedAt: number | null;
}
