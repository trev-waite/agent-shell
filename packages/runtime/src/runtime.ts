import { EventEmitter } from "node:events";
import { ulid } from "ulid";
import type {
  RelayEvent,
  ExecutionStore,
  EventHandler,
  EventSink,
  LiveEventPublisher,
  SessionCoordinator,
} from "@relay/types";
import type { LLMProvider } from "@relay/providers";
import type { ToolRegistry } from "@relay/tool-registry";
import { ReActLoop } from "./loop/react-loop.js";
import { deriveSessionStatus } from "./projections/session.js";
import { sanitize } from "./sanitize.js";
import {
  findCheckpointEvent,
  listCheckpointSummaries,
  parseCheckpointData,
  type CheckpointSummary,
} from "./checkpoint.js";

const SESSION_LEASE_TTL_MS = 300_000;
export const DEFAULT_WORKER_ID = "local-worker";

export interface RuntimeOptions {
  store: ExecutionStore;
  eventSink: EventSink;
  sessionCoordinator: SessionCoordinator;
  livePublisher: LiveEventPublisher;
  provider: LLMProvider;
  toolRegistry: ToolRegistry;
  workerId?: string;
}

export interface ExecuteOptions {
  prompt: string;
  model?: string;
}

export interface ReplayOptions {
  sessionId: string;
  afterEventId?: string;
}

export interface ContinueOptions {
  sessionId: string;
  prompt: string;
  model?: string;
}

export interface RerunOptions {
  sessionId: string;
  checkpointId?: string;
  model?: string;
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
  private readonly eventSink: EventSink;
  private readonly sessionCoordinator: SessionCoordinator;
  private readonly livePublisher: LiveEventPublisher;
  private readonly provider: LLMProvider;
  private readonly toolRegistry: ToolRegistry;
  private readonly workerId: string;
  private readonly activeSessions = new Map<string, ActiveSession>();

  constructor(opts: RuntimeOptions) {
    this.store = opts.store;
    this.eventSink = opts.eventSink;
    this.sessionCoordinator = opts.sessionCoordinator;
    this.livePublisher = opts.livePublisher;
    this.provider = opts.provider;
    this.toolRegistry = opts.toolRegistry;
    this.workerId = opts.workerId ?? DEFAULT_WORKER_ID;
  }

  async execute(opts: ExecuteOptions): Promise<string> {
    const session = this.store.createSession(sanitize(opts.prompt));

    await this.startActiveLoop(session.id, (emit, signal) =>
      new ReActLoop({
        sessionId: session.id,
        prompt: opts.prompt,
        provider: this.provider,
        toolRegistry: this.toolRegistry,
        emit,
        signal,
        ...(opts.model !== undefined ? { model: opts.model } : {}),
      }),
    );

    return session.id;
  }

  async rerun(opts: RerunOptions): Promise<string> {
    const session = this.store.getSession(opts.sessionId);
    if (!session) {
      throw new Error("Session not found");
    }

    const events = this.store.events.getBySession(opts.sessionId);
    const checkpointEvent = findCheckpointEvent(events, opts.checkpointId);
    const { iteration, messages } = parseCheckpointData(checkpointEvent.payload.data);

    await this.startActiveLoop(opts.sessionId, (emit, signal) =>
      new ReActLoop({
        sessionId: opts.sessionId,
        prompt: session.prompt,
        provider: this.provider,
        toolRegistry: this.toolRegistry,
        emit,
        signal,
        resume: { messages, iteration },
        ...(opts.model !== undefined ? { model: opts.model } : {}),
      }),
    );

    return opts.sessionId;
  }

  async continue(opts: ContinueOptions): Promise<string> {
    const session = this.store.getSession(opts.sessionId);
    if (!session) {
      throw new Error("Session not found");
    }

    const events = this.store.events.getBySession(opts.sessionId);
    const checkpointEvent = findCheckpointEvent(events);
    const { messages } = parseCheckpointData(checkpointEvent.payload.data);

    await this.startActiveLoop(opts.sessionId, (emit, signal) =>
      new ReActLoop({
        sessionId: opts.sessionId,
        prompt: opts.prompt,
        provider: this.provider,
        toolRegistry: this.toolRegistry,
        emit,
        signal,
        resume: {
          messages,
          iteration: 0,
          appendUserPrompt: opts.prompt,
        },
        ...(opts.model !== undefined ? { model: opts.model } : {}),
      }),
    );

    return opts.sessionId;
  }

  listCheckpoints(sessionId: string): CheckpointSummary[] | null {
    if (!this.store.getSession(sessionId)) {
      return null;
    }
    const events = this.store.events.getBySession(sessionId);
    return listCheckpointSummaries(events);
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
      this.fanoutEvent(opts.sessionId, event, active.emitter);
      void this.eventSink.write(event);
    }
  }

  subscribe(opts: SubscribeOptions): EventEmitter {
    const active = this.activeSessions.get(opts.sessionId);
    if (active) {
      return active.emitter;
    }
    const emitter = new EventEmitter();
    this.livePublisher.subscribe(opts.sessionId, (event) => {
      emitter.emit("event", event);
    });
    return emitter;
  }

  onSessionEvent(sessionId: string, handler: EventHandler): () => void {
    return this.livePublisher.subscribe(sessionId, handler);
  }

  isSessionActive(sessionId: string): boolean {
    return this.activeSessions.has(sessionId);
  }

  getSessionStatus(sessionId: string) {
    const events = this.store.events.getBySession(sessionId);
    return deriveSessionStatus(events);
  }

  private fanoutEvent(
    sessionId: string,
    event: RelayEvent,
    emitter?: EventEmitter,
  ): void {
    emitter?.emit("event", event);
    this.livePublisher.publish(sessionId, event);
  }

  private async startActiveLoop(
    sessionId: string,
    buildLoop: (emit: EventHandler, signal: AbortSignal) => ReActLoop,
  ): Promise<void> {
    const acquired = await this.sessionCoordinator.acquireLease(
      sessionId,
      this.workerId,
      SESSION_LEASE_TTL_MS,
    );
    if (!acquired) {
      throw new Error("Session is already running");
    }

    const emitter = new EventEmitter();
    const abortController = new AbortController();

    const emit: EventHandler = (event) => {
      this.fanoutEvent(sessionId, event, emitter);
      void this.eventSink.write(event);
    };

    const loop = buildLoop(emit, abortController.signal);
    this.activeSessions.set(sessionId, { loop, emitter, abortController });

    void loop.run().finally(async () => {
      await this.eventSink.flush();
      await this.sessionCoordinator.releaseLease(sessionId, this.workerId);
      this.activeSessions.delete(sessionId);
    });
  }
}

export function createRuntime(opts: RuntimeOptions): Runtime {
  return new Runtime(opts);
}
