import type { RelayEvent } from "./events.js";

export interface DurableExecutor {
  execute(sessionId: string, prompt: string): Promise<void>;
  cancel(sessionId: string): Promise<void>;
}

export interface Worker {
  id: string;
  process(task: unknown): Promise<unknown>;
}

export interface ExecutionQueue {
  enqueue(sessionId: string, task: unknown): Promise<void>;
  dequeue(): Promise<{ sessionId: string; task: unknown } | null>;
}

export interface SessionCoordinator {
  register(sessionId: string): Promise<void>;
  unregister(sessionId: string): Promise<void>;
  getActiveSessions(): Promise<string[]>;
}

export interface EventSink {
  write(event: RelayEvent): Promise<void>;
  flush(): Promise<void>;
}

export interface DurableSessionStore {
  save(sessionId: string, events: RelayEvent[]): Promise<void>;
  load(sessionId: string): Promise<RelayEvent[]>;
  list(): Promise<string[]>;
}
