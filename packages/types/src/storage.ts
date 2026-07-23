import type { RelayEvent, Session } from "./events.js";

export interface EventStore {
  append(event: RelayEvent): Promise<void>;
  getBySession(sessionId: string, afterId?: string): Promise<RelayEvent[]>;
  getLastEventId(sessionId: string): Promise<string | null>;
}

/** Persists an event and its derived projections atomically. */
export interface EventProjector {
  persist(event: RelayEvent): Promise<void>;
  /**
   * Optional: persist multiple events in one transaction.
   * Used by EventSink token batching; falls back to sequential `persist` when absent.
   */
  persistBatch?(events: RelayEvent[]): Promise<void>;
}

export interface ExecutionStore {
  createSession(prompt: string): Promise<Session>;
  getSession(sessionId: string): Promise<Session | null>;
  listSessions(): Promise<Session[]>;
  events: EventStore;
}

export interface CheckpointStore {
  save(sessionId: string, checkpointId: string, data: unknown): Promise<void>;
  get(sessionId: string, checkpointId: string): Promise<unknown | null>;
}

// Future work: object storage for tool artifacts, exports, and large blobs.
export interface ArtifactStore {
  put(sessionId: string, artifactId: string, data: unknown): Promise<void>;
  get(sessionId: string, artifactId: string): Promise<unknown | null>;
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
