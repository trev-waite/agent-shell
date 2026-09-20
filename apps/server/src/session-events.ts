import type { FastifyInstance } from "fastify";
import type { EventHandler, RelayEvent } from "@relay/types";
import { corsOriginHeaders } from "./cors.js";

interface SessionEventSource {
  replay(options: { sessionId: string; afterEventId?: string }): AsyncIterable<RelayEvent>;
  subscribe(sessionId: string, handler: EventHandler): () => void;
  /** Snapshot already-queued persistence. Must not wait for later live events. */
  flushQueued?(sessionId: string): Promise<void>;
}

/** Join persisted history to live delivery without interrupting execution. */
export function registerSessionEventRoute(app: FastifyInstance, source: SessionEventSource) {
  app.get<{ Params: { id: string }; Querystring: { after?: string } }>(
    "/sessions/:id/events",
    async (request, reply) => {
      const sessionId = request.params.id;
      const afterId = (request.headers["last-event-id"] as string | undefined) ?? request.query.after;
      let closed = false;
      let replaying = true;
      let buffered: RelayEvent[] = [];
      // Only replay/live overlap needs deduplication; release this set after joining.
      const replayedIds = new Set<string>();
      let unsubscribe: (() => void) | undefined;
      let heartbeat: ReturnType<typeof setInterval> | undefined;
      let resolveClosed: () => void;
      const untilClosed = new Promise<void>((resolve) => { resolveClosed = resolve; });
      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe?.();
        buffered = [];
        resolveClosed();
      };
      const send = (event: RelayEvent) => {
        if (!closed && !reply.raw.destroyed && !reply.raw.writableEnded) {
          reply.raw.write(`id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`);
        }
      };

      reply.hijack();
      reply.raw.on("close", cleanup);
      // Bun emits request abortion before ServerResponse emits close.
      request.raw.on("aborted", cleanup);
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        ...corsOriginHeaders(request.headers.origin),
      });
      reply.raw.flushHeaders();

      try {
        unsubscribe = source.subscribe(sessionId, (event) => {
          if (closed) return;
          if (replaying) buffered.push(event);
          else send(event);
        });
        heartbeat = setInterval(() => {
          if (!closed) reply.raw.write(": heartbeat\n\n");
        }, 15_000);

        // Drain writes already queued before this subscriber attached.
        // Do not use EventSink.flush() here — that waits until the persist lane
        // is idle, which stalls first SSE bytes for the rest of a live turn.
        await source.flushQueued?.(sessionId);
        if (closed) return;
        for await (const event of source.replay({
          sessionId,
          ...(afterId !== undefined ? { afterEventId: afterId } : {}),
        })) {
          if (closed) return;
          replayedIds.add(event.id);
          send(event);
        }
        for (const event of buffered) {
          if (!replayedIds.has(event.id)) send(event);
        }
        buffered = [];
        replayedIds.clear();
        replaying = false;
        await untilClosed;
      } catch (error) {
        request.log.error(error);
        // End the transport so the SDK can reconnect from its last received event.
        reply.raw.destroy();
      } finally {
        cleanup();
        reply.raw.removeListener("close", cleanup);
        request.raw.removeListener("aborted", cleanup);
      }
    },
  );
}
