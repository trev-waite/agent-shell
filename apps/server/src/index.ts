import { loadMonorepoEnv } from "./load-env.js";

loadMonorepoEnv();

import Fastify from "fastify";
import { registerSessionEventRoute } from "./session-events.js";
import fastifyCors from "@fastify/cors";
import type { ReasoningLevel } from "@relay/providers";
import { createGeminiProvider } from "@relay/providers";
import {
  createLocalDurableExecutor,
  createLocalLiveEventPublisher,
  createLocalSessionCoordinator,
  createRuntime,
  DEFAULT_WORKER_ID,
} from "@relay/runtime";
import {
  createDatabase,
  createExecutionStore,
  createEventProjector,
  createProjectorEventSink,
  migrateDatabase,
} from "@relay/storage";
import { createToolRegistry } from "@relay/tool-registry";
import { registerTools } from "@relay/tools";
import { corsOriginHeaders, resolveCorsOrigin } from "./cors.js";
import {
  DEFAULT_GEMINI_MODEL,
  isGeminiModelId,
  providerModelsResponse,
} from "@relay/types";

const PORT = Number(process.env.RELAY_PORT ?? 4310);
const DB_PATH = process.env.RELAY_DB_PATH ?? "./data/relay.db";

const REASONING_LEVELS = new Set<ReasoningLevel>([
  "minimal",
  "low",
  "medium",
  "high",
  "none",
  "provider-default",
]);

function parseGeminiReasoning(value: string | undefined): ReasoningLevel | undefined {
  if (!value) return undefined;
  if (REASONING_LEVELS.has(value as ReasoningLevel)) {
    return value as ReasoningLevel;
  }
  console.warn(`Ignoring invalid GEMINI_REASONING value: ${value}`);
  return undefined;
}

function replySessionActionError(
  reply: { status: (code: number) => { send: (body: unknown) => unknown } },
  err: unknown,
  options?: { checkpointNotFoundStatus?: 400 | 404 },
): boolean {
  const message = err instanceof Error ? err.message : String(err);
  const checkpointStatus = options?.checkpointNotFoundStatus ?? 404;

  if (message === "Session not found") {
    reply.status(404).send({ error: message });
    return true;
  }
  if (message === "Session is already running") {
    reply.status(409).send({ error: message });
    return true;
  }
  if (message === "No checkpoints found for session") {
    reply.status(checkpointStatus).send({ error: message });
    return true;
  }
  if (message.startsWith("Checkpoint not found:")) {
    reply.status(checkpointStatus).send({ error: message });
    return true;
  }
  if (message.startsWith("Invalid checkpoint")) {
    reply.status(400).send({ error: message });
    return true;
  }

  return false;
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY environment variable is required");
    process.exit(1);
  }

  migrateDatabase(DB_PATH);
  const db = createDatabase(DB_PATH);
  const store = createExecutionStore(db);
  const projector = createEventProjector(db);
  const eventSink = createProjectorEventSink(projector, {
    tokenBatchSize: 32,
    tokenBatchFlushMs: 10,
  });
  const toolRegistry = createToolRegistry();
  registerTools(toolRegistry);

  const defaultModel =
    process.env.GEMINI_MODEL && isGeminiModelId(process.env.GEMINI_MODEL)
      ? process.env.GEMINI_MODEL
      : DEFAULT_GEMINI_MODEL;

  const geminiReasoning = parseGeminiReasoning(process.env.GEMINI_REASONING);

  const provider = createGeminiProvider({
    apiKey,
    model: defaultModel,
    ...(geminiReasoning !== undefined ? { reasoning: geminiReasoning } : {}),
  });
  const livePublisher = createLocalLiveEventPublisher();
  let runtime: ReturnType<typeof createRuntime>;
  const sessionCoordinator = createLocalSessionCoordinator({
    onCancel: (sessionId) => {
      runtime.cancel({ sessionId });
    },
  });

  runtime = createRuntime({
    store,
    eventSink,
    sessionCoordinator,
    livePublisher,
    provider,
    toolRegistry,
    workerId: DEFAULT_WORKER_ID,
  });

  const executor = createLocalDurableExecutor({
    runtime,
    coordinator: sessionCoordinator,
    workerId: DEFAULT_WORKER_ID,
  });

  const app = Fastify({ logger: true });

  // Browser clients (apps/web dev server) run on a different origin.
  await app.register(fastifyCors, {
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      callback(null, resolveCorsOrigin(origin) !== null);
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Accept", "Last-Event-ID"],
    exposedHeaders: ["Last-Event-ID"],
  });

  app.get("/health", async () => ({ status: "ok" }));

  app.get("/models", async () => ({
    providers: providerModelsResponse(),
  }));

  app.post<{ Body: { prompt: string; model?: string } }>("/sessions", async (request, reply) => {
    const { prompt, model } = request.body;
    if (!prompt || typeof prompt !== "string") {
      return reply.status(400).send({ error: "prompt is required" });
    }

    if (model !== undefined && !isGeminiModelId(model)) {
      return reply.status(400).send({ error: `Unsupported model: ${model}` });
    }

    const { sessionId } = await executor.execute({
      kind: "execute",
      prompt,
      ...(model !== undefined ? { model } : {}),
    });
    return { sessionId };
  });

  app.post<{ Params: { id: string }; Body: { prompt: string; model?: string } }>(
    "/sessions/:id/messages",
    async (request, reply) => {
      const { id: sessionId } = request.params;
      const { prompt, model } = request.body ?? {};

      if (!prompt || typeof prompt !== "string") {
        return reply.status(400).send({ error: "prompt is required" });
      }

      if (model !== undefined && !isGeminiModelId(model)) {
        return reply.status(400).send({ error: `Unsupported model: ${model}` });
      }

      try {
        const { sessionId: continuedSessionId } = await executor.execute({
          kind: "continue",
          sessionId,
          prompt,
          ...(model !== undefined ? { model } : {}),
        });
        return { sessionId: continuedSessionId };
      } catch (err) {
        if (replySessionActionError(reply, err, { checkpointNotFoundStatus: 400 })) {
          return;
        }
        throw err;
      }
    },
  );

  registerSessionEventRoute(app, {
    replay: (options) => runtime.replay(options),
    subscribe: (sessionId, handler) => runtime.onSessionEvent(sessionId, handler),
    flushQueued: (sessionId) => eventSink.flushQueued?.(sessionId) ?? Promise.resolve(),
  });

  app.get<{ Params: { id: string } }>(
    "/sessions/:id/replay",
    async (request, reply) => {
      const { id: sessionId } = request.params;

      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        ...corsOriginHeaders(request.headers.origin),
      });

      for await (const event of runtime.replay({ sessionId })) {
        reply.raw.write(`id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`);
      }

      reply.raw.end();
    },
  );

  app.post<{ Params: { id: string } }>(
    "/sessions/:id/cancel",
    async (request) => {
      const { id: sessionId } = request.params;
      await executor.cancel(sessionId);
      return { cancelled: true };
    },
  );

  app.get<{ Params: { id: string } }>(
    "/sessions/:id/checkpoints",
    async (request, reply) => {
      const { id: sessionId } = request.params;
      const checkpoints = await runtime.listCheckpoints(sessionId);
      if (checkpoints === null) {
        return reply.status(404).send({ error: "Session not found" });
      }
      return { checkpoints };
    },
  );

  app.post<{ Params: { id: string }; Body: { checkpointId?: string; model?: string } }>(
    "/sessions/:id/rerun",
    async (request, reply) => {
      const { id: sessionId } = request.params;
      const { checkpointId, model } = request.body ?? {};

      if (model !== undefined && !isGeminiModelId(model)) {
        return reply.status(400).send({ error: `Unsupported model: ${model}` });
      }

      try {
        const { sessionId: resumedSessionId } = await executor.execute({
          kind: "rerun",
          sessionId,
          ...(checkpointId !== undefined ? { checkpointId } : {}),
          ...(model !== undefined ? { model } : {}),
        });
        return { sessionId: resumedSessionId };
      } catch (err) {
        if (replySessionActionError(reply, err)) {
          return;
        }
        throw err;
      }
    },
  );

  app.get("/sessions", async () => {
    return store.listSessions();
  });

  await app.listen({ port: PORT, host: "127.0.0.1" });
  console.log(`Relay runtime server listening on http://127.0.0.1:${PORT}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : "Server failed to start");
  process.exit(1);
});
