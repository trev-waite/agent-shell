import { EventEmitter } from "node:events";
import { ulid } from "ulid";
import type {
  RelayEvent,
  ExecutionStore,
  EventHandler,
} from "@relay/types";
import { NotImplementedError as NotImplementedErrorClass } from "@relay/types";
import type { LLMProvider } from "@relay/providers";
import type { ToolRegistry } from "@relay/tool-registry";
import type { RelayDatabase } from "@relay/storage";
import {
  projectMessage,
  projectToolCallStart,
  projectToolCallComplete,
  saveSnapshot,
} from "@relay/storage";
import { ReActLoop } from "./loop/react-loop.js";
import { deriveSessionStatus } from "./projections/session.js";
import { sanitize } from "./sanitize.js";

export interface RuntimeOptions {
  store: ExecutionStore;
  db: RelayDatabase;
  provider: LLMProvider;
  toolRegistry: ToolRegistry;
}

export interface ExecuteOptions {
  prompt: string;
  model?: string;
}

export interface ReplayOptions {
  sessionId: string;
  afterEventId?: string;
}

export interface CancelOptions {
  sessionId: string;
}

export interface SubscribeOptions {
  sessionId: string;
}

interface ActiveSession {
  loop: ReActLoop;
  emitter: EventEmitter;
  abortController: AbortController;
}

export class Runtime {
  private readonly store: ExecutionStore;
  private readonly db: RelayDatabase;
  private readonly provider: LLMProvider;
  private readonly toolRegistry: ToolRegistry;
  private readonly activeSessions = new Map<string, ActiveSession>();
  private readonly globalEmitter = new EventEmitter();

  constructor(opts: RuntimeOptions) {
    this.store = opts.store;
    this.db = opts.db;
    this.provider = opts.provider;
    this.toolRegistry = opts.toolRegistry;
    this.globalEmitter.setMaxListeners(100);
  }

  async execute(opts: ExecuteOptions): Promise<string> {
    const session = this.store.createSession(sanitize(opts.prompt));
    const emitter = new EventEmitter();
    const abortController = new AbortController();

    const emit: EventHandler = (event) => {
      this.persistEvent(event);
      emitter.emit("event", event);
      this.globalEmitter.emit(`session:${session.id}`, event);
    };

    const loop = new ReActLoop({
      sessionId: session.id,
      prompt: opts.prompt,
      provider: this.provider,
      toolRegistry: this.toolRegistry,
      emit,
      signal: abortController.signal,
      ...(opts.model !== undefined ? { model: opts.model } : {}),
    });

    this.activeSessions.set(session.id, { loop, emitter, abortController });

    loop.run().finally(() => {
      this.activeSessions.delete(session.id);
    });

    return session.id;
  }

  async *replay(opts: ReplayOptions): AsyncIterable<RelayEvent> {
    const events = this.store.events.getBySession(opts.sessionId, opts.afterEventId);
    for (const event of events) {
      yield event;
    }
  }

  cancel(opts: CancelOptions): void {
    const active = this.activeSessions.get(opts.sessionId);
    if (active) {
      active.loop.cancel();
      active.abortController.abort();

      const event: RelayEvent = {
        id: ulid(),
        sessionId: opts.sessionId,
        type: "error",
        timestamp: Date.now(),
        payload: {
          code: "CANCELLED",
          message: "Execution cancelled",
          recoverable: false,
        },
      };
      this.persistEvent(event);
      active.emitter.emit("event", event);
      this.globalEmitter.emit(`session:${opts.sessionId}`, event);
    }
  }

  subscribe(opts: SubscribeOptions): EventEmitter {
    const active = this.activeSessions.get(opts.sessionId);
    if (active) {
      return active.emitter;
    }
    const emitter = new EventEmitter();
    this.globalEmitter.on(`session:${opts.sessionId}`, (event: RelayEvent) => {
      emitter.emit("event", event);
    });
    return emitter;
  }

  onSessionEvent(sessionId: string, handler: EventHandler): () => void {
    const listener = (event: RelayEvent) => handler(event);
    this.globalEmitter.on(`session:${sessionId}`, listener);
    return () => this.globalEmitter.off(`session:${sessionId}`, listener);
  }

  isSessionActive(sessionId: string): boolean {
    return this.activeSessions.has(sessionId);
  }

  getSessionStatus(sessionId: string) {
    const events = this.store.events.getBySession(sessionId);
    return deriveSessionStatus(events);
  }

  rerun(): never {
    throw new NotImplementedErrorClass("runtime.rerun()");
  }

  private persistEvent(event: RelayEvent): void {
    this.store.events.append(event);

    switch (event.type) {
      case "message.completed": {
        const payload = event.payload;
        projectMessage(this.db, {
          id: payload.messageId,
          sessionId: event.sessionId,
          role: payload.role,
          content: payload.content,
          createdAt: event.timestamp,
        });
        break;
      }
      case "tool.started": {
        const payload = event.payload;
        projectToolCallStart(this.db, {
          id: payload.toolCallId,
          sessionId: event.sessionId,
          toolName: payload.toolName,
          input: payload.input,
          output: null,
          error: null,
          startedAt: event.timestamp,
          completedAt: null,
        });
        break;
      }
      case "tool.completed": {
        const payload = event.payload;
        projectToolCallComplete(
          this.db,
          payload.toolCallId,
          payload.output,
          payload.error ?? null,
        );
        break;
      }
      case "checkpoint.saved": {
        const payload = event.payload;
        saveSnapshot(this.db, event.sessionId, payload.checkpointId, payload.data);
        break;
      }
    }
  }
}

export function createRuntime(opts: RuntimeOptions): Runtime {
  return new Runtime(opts);
}
