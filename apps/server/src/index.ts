import { loadMonorepoEnv } from "./load-env.js";

loadMonorepoEnv();

import Fastify from "fastify";
import { createGeminiProvider } from "@relay/providers";
import { createRuntime } from "@relay/runtime";
import {
  createDatabase,
  createExecutionStore,
  migrateDatabase,
} from "@relay/storage";
import { createToolRegistry } from "@relay/tool-registry";
import { registerTools } from "@relay/tools";
import type { RelayEvent } from "@relay/types";
import {
  DEFAULT_GEMINI_MODEL,
  isGeminiModelId,
  providerModelsResponse,
} from "@relay/types";

const PORT = Number(process.env.RELAY_PORT ?? 4310);
const DB_PATH = process.env.RELAY_DB_PATH ?? "./data/relay.db";

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY environment variable is required");
    process.exit(1);
  }

  migrateDatabase(DB_PATH);
  const db = createDatabase(DB_PATH);
  const store = createExecutionStore(db);
  const toolRegistry = createToolRegistry();
  registerTools(toolRegistry);

  const defaultModel =
    process.env.GEMINI_MODEL && isGeminiModelId(process.env.GEMINI_MODEL)
      ? process.env.GEMINI_MODEL
      : DEFAULT_GEMINI_MODEL;

  const provider = createGeminiProvider({
    apiKey,
    model: defaultModel,
  });
  const runtime = createRuntime({ store, db, provider, toolRegistry });

  const app = Fastify({ logger: true });

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

    const sessionId = await runtime.execute({
      prompt,
      ...(model !== undefined ? { model } : {}),
    });
    return { sessionId };
  });

  app.get<{ Params: { id: string }; Querystring: { after?: string } }>(
    "/sessions/:id/events",
    async (request, reply) => {
      const { id: sessionId } = request.params;
      const afterId =
        (request.headers["last-event-id"] as string | undefined) ??
        request.query.after;

      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      const sendEvent = (event: RelayEvent) => {
        if (!reply.raw.writableEnded) {
          reply.raw.write(`id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`);
        }
      };

      // Replay persisted events so clients that connect after execution starts
      // still receive message/token history (not only live fanout).
      const historical = store.events.getBySession(sessionId, afterId);
      for (const event of historical) {
        sendEvent(event);
      }

      const lastReplayedId =
        historical.length > 0 ? historical[historical.length - 1]!.id : afterId;
      if (lastReplayedId) {
        for (const event of store.events.getBySession(sessionId, lastReplayedId)) {
          sendEvent(event);
        }
      }

      const unsubscribe = runtime.onSessionEvent(sessionId, sendEvent);

      const heartbeat = setInterval(() => {
        if (!reply.raw.writableEnded) {
          reply.raw.write(": heartbeat\n\n");
        }
      }, 15_000);

      await new Promise<void>((resolve) => {
        request.raw.on("close", () => {
          clearInterval(heartbeat);
          unsubscribe();
          resolve();
        });
      });
    },
  );

  app.get<{ Params: { id: string } }>(
    "/sessions/:id/replay",
    async (request, reply) => {
      const { id: sessionId } = request.params;

      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
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
      runtime.cancel({ sessionId });
      return { cancelled: true };
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
