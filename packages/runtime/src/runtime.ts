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
  /** Primarily configurable for tests; production defaults to five minutes. */
  sessionLeaseTtlMs?: number;
}

export interface ExecuteOptions {
  prompt: string;
  model?: string;
  /** When set, skip createSession and run against an existing session row. */
  sessionId?: string;
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
  renewTimer: ReturnType<typeof setInterval>;
  completion: Promise<void>;
  stopping: boolean;
  persistenceFailure?: Error;
}

export class Runtime {
  private readonly store: ExecutionStore;
  private readonly eventSink: EventSink;
  private readonly sessionCoordinator: SessionCoordinator;
  private readonly livePublisher: LiveEventPublisher;
  private readonly provider: LLMProvider;
  private readonly toolRegistry: ToolRegistry;
  private readonly workerId: string;
  private readonly sessionLeaseTtlMs: number;
  private readonly activeSessions = new Map<string, ActiveSession>();
  private readonly completedFailures = new Map<string, Error>();

  constructor(opts: RuntimeOptions) {
    this.store = opts.store;
    this.eventSink = opts.eventSink;
    this.sessionCoordinator = opts.sessionCoordinator;
    this.livePublisher = opts.livePublisher;
    this.provider = opts.provider;
    this.toolRegistry = opts.toolRegistry;
    this.workerId = opts.workerId ?? DEFAULT_WORKER_ID;
    this.sessionLeaseTtlMs = opts.sessionLeaseTtlMs ?? SESSION_LEASE_TTL_MS;
  }

  async execute(opts: ExecuteOptions): Promise<string> {
    let sessionId: string;
    if (opts.sessionId !== undefined) {
      const existing = await this.store.getSession(opts.sessionId);
      if (!existing) {
        throw new Error("Session not found");
      }
      sessionId = opts.sessionId;
    } else {
      sessionId = (await this.store.createSession(sanitize(opts.prompt))).id;
    }

    await this.startActiveLoop(sessionId, (emit, signal) =>
      new ReActLoop({
        sessionId,
        prompt: opts.prompt,
        provider: this.provider,
        toolRegistry: this.toolRegistry,
        emit,
        signal,
        ...(opts.model !== undefined ? { model: opts.model } : {}),
      }),
    );

    return sessionId;
  }

  async rerun(opts: RerunOptions): Promise<string> {
    const session = await this.store.getSession(opts.sessionId);
    if (!session) {
      throw new Error("Session not found");
    }

    const events = await this.store.events.getBySession(opts.sessionId);
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
    const session = await this.store.getSession(opts.sessionId);
    if (!session) {
      throw new Error("Session not found");
    }

    const events = await this.store.events.getBySession(opts.sessionId);
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

  async listCheckpoints(sessionId: string): Promise<CheckpointSummary[] | null> {
    if (!(await this.store.getSession(sessionId))) {
      return null;
    }
    const events = await this.store.events.getBySession(sessionId);
    return listCheckpointSummaries(events);
  }

  async *replay(opts: ReplayOptions): AsyncIterable<RelayEvent> {
    const events = await this.store.events.getBySession(
      opts.sessionId,
      opts.afterEventId,
    );
    for (const event of events) {
      yield event;
    }
  }

  cancel(opts: CancelOptions): void {
    const active = this.activeSessions.get(opts.sessionId);
    if (!active || active.stopping) return;
    this.stopActiveSession(opts.sessionId, active, "CANCELLED", "Execution cancelled");
  }

  /** Persist and publish cancellation for a task cancelled before a loop starts. */
  async recordQueuedCancellation(sessionId: string): Promise<void> {
    const event: RelayEvent = {
      id: ulid(),
      sessionId,
      type: "error",
      timestamp: Date.now(),
      payload: {
        code: "CANCELLED",
        message: "Execution cancelled before it started",
        recoverable: false,
      },
    };
    this.fanoutEvent(sessionId, event);
    await this.eventSink.write(event);
    await this.eventSink.flush(sessionId);
    await this.livePublisher.flush?.(sessionId);
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

  /** Resolves after the loop, durable writes, live publications, and lease release. */
  async waitForSession(sessionId: string): Promise<void> {
    const active = this.activeSessions.get(sessionId);
    if (active) await active.completion;
    const failure = active?.persistenceFailure ?? this.completedFailures.get(sessionId);
    this.completedFailures.delete(sessionId);
    if (failure) throw failure;
  }

  /** Stop accepting in-process work, cancel active loops, and drain their cleanup. */
  async shutdown(): Promise<void> {
    const active = [...this.activeSessions.entries()];
    for (const [sessionId, session] of active) {
      if (!session.stopping) {
        this.stopActiveSession(
          sessionId,
          session,
          "WORKER_SHUTDOWN",
          "Worker is shutting down",
        );
      }
    }
    await Promise.allSettled(active.map(([, session]) => session.completion));
  }

  async getSessionStatus(sessionId: string) {
    const events = await this.store.events.getBySession(sessionId);
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
    this.completedFailures.delete(sessionId);
    const acquired = await this.sessionCoordinator.acquireLease(
      sessionId,
      this.workerId,
      this.sessionLeaseTtlMs,
    );
    if (!acquired) {
      throw new Error("Session is already running");
    }

    const emitter = new EventEmitter();
    const abortController = new AbortController();

    const emit: EventHandler = (event) => {
      this.fanoutEvent(sessionId, event, emitter);
      void this.eventSink.write(event).catch((err) => {
        console.error(
          `[runtime] EventSink.write failed for session ${sessionId}:`,
          err instanceof Error ? err.message : err,
        );
      });
    };

    const loop = buildLoop(emit, abortController.signal);

    const renewTimer = setInterval(() => {
      void this.sessionCoordinator
        .renewLease(sessionId, this.workerId, this.sessionLeaseTtlMs)
        .then((renewed) => {
          if (!renewed) {
            const active = this.activeSessions.get(sessionId);
            if (active && !active.stopping) {
              this.stopActiveSession(
                sessionId,
                active,
                "OWNERSHIP_LOST",
                "Session lease was lost",
              );
            }
          }
        })
        .catch((err) => {
          console.error(
            `[runtime] Lease renewal failed for session ${sessionId}; aborting loop:`,
            err instanceof Error ? err.message : err,
          );
          const active = this.activeSessions.get(sessionId);
          if (active && !active.stopping) {
            this.stopActiveSession(
              sessionId,
              active,
              "OWNERSHIP_LOST",
              "Session lease renewal failed",
            );
          }
        });
    }, Math.max(1, Math.floor(this.sessionLeaseTtlMs / 3)));

    const active: ActiveSession = {
      loop,
      emitter,
      abortController,
      renewTimer,
      completion: Promise.resolve(),
      stopping: false,
    };
    this.activeSessions.set(sessionId, active);

    active.completion = loop
      .run()
      .catch((err) => {
        console.error(
          `[runtime] Loop crashed for session ${sessionId}:`,
          err instanceof Error ? err.message : err,
        );
        const crashEvent: RelayEvent = {
          id: ulid(),
          sessionId,
          type: "error",
          timestamp: Date.now(),
          payload: {
            code: "RUNTIME_CRASH",
            message: err instanceof Error ? err.message : "Runtime loop crashed",
            recoverable: false,
          },
        };
        this.fanoutEvent(sessionId, crashEvent, emitter);
        void this.eventSink.write(crashEvent);
      })
      .then(async () => {
        clearInterval(renewTimer);
        try {
          await this.eventSink.flush(sessionId);
        } catch (err) {
          console.error(
            `[runtime] EventSink.flush failed for session ${sessionId}:`,
            err instanceof Error ? err.message : err,
          );
          const flushError: RelayEvent = {
            id: ulid(),
            sessionId,
            type: "error",
            timestamp: Date.now(),
            payload: {
              code: "PERSIST_FAILED",
              message:
                err instanceof Error
                  ? err.message
                  : "Failed to persist session events",
              recoverable: false,
            },
          };
          active.persistenceFailure =
            err instanceof Error ? err : new Error(String(err));
          this.completedFailures.set(sessionId, active.persistenceFailure);
          this.fanoutEvent(sessionId, flushError, emitter);
        }
        try {
          await this.livePublisher.flush?.(sessionId);
        } catch (err) {
          console.error(
            `[runtime] Live publish flush failed for session ${sessionId}:`,
            err instanceof Error ? err.message : err,
          );
        }
        try {
          await this.sessionCoordinator.releaseLease(sessionId, this.workerId);
        } catch (err) {
          console.error(
            `[runtime] Failed to release lease for session ${sessionId}:`,
            err instanceof Error ? err.message : err,
          );
        } finally {
          if (this.activeSessions.get(sessionId) === active) {
            this.activeSessions.delete(sessionId);
          }
        }
      });
  }

  private stopActiveSession(
    sessionId: string,
    active: ActiveSession,
    code: string,
    message: string,
  ): void {
    active.stopping = true;
    active.loop.cancel();
    active.abortController.abort();
    const event: RelayEvent = {
      id: ulid(),
      sessionId,
      type: "error",
      timestamp: Date.now(),
      payload: { code, message, recoverable: false },
    };
    this.fanoutEvent(sessionId, event, active.emitter);
    void this.eventSink.write(event);
  }
}

export function createRuntime(opts: RuntimeOptions): Runtime {
  return new Runtime(opts);
}
