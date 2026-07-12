import Fastify from "fastify";
import fastifyCors from "@fastify/cors";
import {
  connectRedis,
  createRedisSessionCoordinator,
} from "@relay/coordination";
import { createQueueDurableExecutor } from "@relay/dispatch";
import { createSessionLiveBroker } from "@relay/pubsub";
import {
  deriveSessionStatus,
  findCheckpointEvent,
  listCheckpointSummaries,
  sanitize,
} from "@relay/runtime";
import { openPostgresStorage } from "@relay/storage";
import type { RelayEvent } from "@relay/types";
import {
  isGeminiModelId,
  providerModelsResponse,
} from "@relay/types";
import { corsOriginHeaders, resolveCorsOrigin } from "./cors.js";
import { attachSessionEventStream } from "./session-event-stream.js";

const PORT = Number(process.env.RELAY_PORT ?? 4310);
const HOST = process.env.RELAY_HOST ?? "0.0.0.0";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} environment variable is required`);
    process.exit(1);
  }
  return value;
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
  if (
    message === "Session is already running" ||
    message === "Session is already queued or running"
  ) {
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
  const redisUrl = requireEnv("REDIS_URL");
  const databaseUrl = requireEnv("RELAY_DATABASE_URL");

  const redis = await connectRedis(redisUrl);
  const { store, close: closeDb } = await openPostgresStorage(databaseUrl);
  const coordinator = createRedisSessionCoordinator({ redis });
  const liveBroker = createSessionLiveBroker(redis);

  const executor = createQueueDurableExecutor({
    redis,
    coordinator,
    getSessionStatus: async (sessionId) => {
      const owner = await coordinator.resolveOwner(sessionId);
      const events = await store.events.getBySession(sessionId);
      const derived = deriveSessionStatus(events);
      if (owner !== null && derived !== "cancelled") {
        return "running";
      }
      return derived;
    },
  });

  const app = Fastify({ logger: true });

  await app.register(fastifyCors, {
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      const allowed = resolveCorsOrigin(origin);
      callback(null, allowed ?? false);
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Accept", "Last-Event-ID"],
    exposedHeaders: ["Last-Event-ID"],
  });

  app.get("/health", async (_request, reply) => {
    try {
      await redis.ping();
      await store.listSessions();
      return { status: "ok", redis: true, database: true };
    } catch (err) {
      reply.status(503);
      return {
        status: "degraded",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

  app.get("/models", async () => ({
    providers: providerModelsResponse(),
  }));

  app.post<{ Body: { prompt: string; model?: string } }>("/sessions", async (request, reply) => {
    const { prompt, model } = request.body ?? {};
    if (!prompt || typeof prompt !== "string") {
      return reply.status(400).send({ error: "prompt is required" });
    }

    if (model !== undefined && !isGeminiModelId(model)) {
      return reply.status(400).send({ error: `Unsupported model: ${model}` });
    }

    const session = await store.createSession(sanitize(prompt));
    const { sessionId } = await executor.execute({
      kind: "execute",
      sessionId: session.id,
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

      const session = await store.getSession(sessionId);
      if (!session) {
        return reply.status(404).send({ error: "Session not found" });
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

  app.get<{ Params: { id: string }; Querystring: { after?: string } }>(
    "/sessions/:id/events",
    async (request, reply) => {
      const { id: sessionId } = request.params;
      const afterId =
        (request.headers["last-event-id"] as string | undefined) ??
        request.query.after;

      const session = await store.getSession(sessionId);
      if (!session) {
        return reply.status(404).send({ error: "Session not found" });
      }

      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        ...corsOriginHeaders(request.headers.origin),
      });

      let unsubscribe: (() => void) | undefined;
      const heartbeat = setInterval(() => {
        if (!reply.raw.writableEnded) {
          reply.raw.write(": heartbeat\n\n");
        }
      }, 15_000);

      const closed = new Promise<void>((resolve) => {
        request.raw.on("close", () => {
          clearInterval(heartbeat);
          unsubscribe?.();
          resolve();
        });
      });

      try {
        await attachSessionEventStream({
          store,
          liveBroker,
          sessionId,
          afterId,
          sendEvent: (event: RelayEvent) => {
            if (reply.raw.writableEnded) return;
            reply.raw.write(`id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`);
          },
          onClose: (unsub) => {
            unsubscribe = unsub;
          },
        });
        await closed;
      } catch (err) {
        clearInterval(heartbeat);
        unsubscribe?.();
        if (!reply.raw.writableEnded) reply.raw.end();
        request.log.error(err);
      }
    },
  );

  app.get<{ Params: { id: string } }>(
    "/sessions/:id/replay",
    async (request, reply) => {
      const { id: sessionId } = request.params;

      const session = await store.getSession(sessionId);
      if (!session) {
        return reply.status(404).send({ error: "Session not found" });
      }

      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        ...corsOriginHeaders(request.headers.origin),
      });

      const events = await store.events.getBySession(sessionId);
      for (const event of events) {
        reply.raw.write(`id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`);
      }

      reply.raw.end();
    },
  );

  app.post<{ Params: { id: string } }>(
    "/sessions/:id/cancel",
    async (request, reply) => {
      const { id: sessionId } = request.params;
      const session = await store.getSession(sessionId);
      if (!session) {
        return reply.status(404).send({ error: "Session not found" });
      }
      const owner = await coordinator.resolveOwner(sessionId);
      await executor.cancel(sessionId);
      if (owner === null) {
        return reply.status(200).send({
          cancelled: true,
          owner: null,
          note: "No active owner; cancel flag set for late dequeue",
        });
      }
      return { cancelled: true, owner };
    },
  );

  app.get<{ Params: { id: string } }>(
    "/sessions/:id/checkpoints",
    async (request, reply) => {
      const { id: sessionId } = request.params;
      const session = await store.getSession(sessionId);
      if (!session) {
        return reply.status(404).send({ error: "Session not found" });
      }
      const events = await store.events.getBySession(sessionId);
      return { checkpoints: listCheckpointSummaries(events) };
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

      const session = await store.getSession(sessionId);
      if (!session) {
        return reply.status(404).send({ error: "Session not found" });
      }

      try {
        const events = await store.events.getBySession(sessionId);
        findCheckpointEvent(events, checkpointId);

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

  await app.listen({ port: PORT, host: HOST });
  console.log(`Relay gateway listening on http://${HOST}:${PORT}`);

  const shutdown = async () => {
    await app.close();
    await liveBroker.close();
    await closeDb();
    await redis.quit();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : "Gateway failed to start");
  process.exit(1);
});
