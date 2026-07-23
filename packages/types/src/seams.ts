/**
 * Platform seams — swappable interfaces between runtime, storage, dispatch, and
 * observability. Local in-process adapters implement these today; distributed
 * deployments (Redis, queues, Temporal, remote stores) replace adapters without
 * changing @relay/runtime or @relay/sdk.
 */
import type { EventHandler, RelayEvent, SessionStatus } from "./events.js";

export type ExecutionTaskKind = "execute" | "continue" | "rerun";

/** Typed dispatch payload for durable execution backends (queue, Temporal, etc.). */
export interface ExecutionTask {
  kind: ExecutionTaskKind;
  /** Required for execute and continue. */
  prompt?: string;
  /** Required for continue and rerun. */
  sessionId?: string;
  model?: string;
  checkpointId?: string;
  /** Idempotency key for at-least-once dispatchers. */
  idempotencyKey?: string;
}

export interface ExecutionStatus {
  sessionId: string;
  status: SessionStatus;
  active: boolean;
  workerId?: string;
}

export interface DurableExecutor {
  execute(task: ExecutionTask): Promise<{ sessionId: string }>;
  cancel(sessionId: string): Promise<void>;
  getStatus(sessionId: string): Promise<ExecutionStatus>;
}

export interface SessionLease {
  sessionId: string;
  workerId: string;
  expiresAt: number;
}

export interface SessionCoordinator {
  /** Returns false when another worker holds a valid lease. */
  acquireLease(sessionId: string, workerId: string, ttlMs: number): Promise<boolean>;
  renewLease(sessionId: string, workerId: string, ttlMs: number): Promise<boolean>;
  releaseLease(sessionId: string, workerId: string): Promise<void>;
  resolveOwner(sessionId: string): Promise<string | null>;
  /** Route cancel to the worker that owns the session (local adapter invokes onCancel). */
  routeCancel(sessionId: string): Promise<void>;
  getActiveSessions(): Promise<string[]>;
}

/** Live observer fanout — separate from durable EventSink persistence. */
export interface LiveEventPublisher {
  publish(sessionId: string, event: RelayEvent): void;
  subscribe(sessionId: string, handler: EventHandler): () => void;
  /** Wait for queued publications, optionally scoped to one session. */
  flush?(sessionId?: string): Promise<void>;
}

export interface EventSink {
  write(event: RelayEvent): Promise<void>;
  /** Wait for queued writes, optionally scoped to one session. */
  flush(sessionId?: string): Promise<void>;
}

export interface Worker {
  id: string;
  process(task: unknown): Promise<unknown>;
}

export interface ExecutionQueue {
  enqueue(sessionId: string, task: unknown): Promise<void>;
  dequeue(): Promise<{ sessionId: string; task: unknown } | null>;
}

export interface DurableSessionStore {
  save(sessionId: string, events: RelayEvent[]): Promise<void>;
  load(sessionId: string): Promise<RelayEvent[]>;
  list(): Promise<string[]>;
}
