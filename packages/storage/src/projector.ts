import { eq } from "drizzle-orm";
import type { EventProjector, RelayEvent } from "@relay/types";
import type { RelayDatabase } from "./store.js";
import * as schema from "./schema.js";

function applyProjection(tx: RelayDatabase, event: RelayEvent): void {
  switch (event.type) {
    case "message.completed": {
      const payload = event.payload;
      tx.insert(schema.messages).values({
        id: payload.messageId,
        sessionId: event.sessionId,
        role: payload.role,
        content: payload.content,
        createdAt: event.timestamp,
      }).run();
      break;
    }
    case "tool.started": {
      const payload = event.payload;
      tx.insert(schema.toolCalls).values({
        id: payload.toolCallId,
        sessionId: event.sessionId,
        toolName: payload.toolName,
        input: JSON.stringify(payload.input),
        output: null,
        error: null,
        startedAt: event.timestamp,
        completedAt: null,
      }).run();
      break;
    }
    case "tool.completed": {
      const payload = event.payload;
      tx.update(schema.toolCalls)
        .set({
          output: payload.output !== null ? JSON.stringify(payload.output) : null,
          error: payload.error ?? null,
          completedAt: event.timestamp,
        })
        .where(eq(schema.toolCalls.id, payload.toolCallId))
        .run();
      break;
    }
    case "checkpoint.saved": {
      const payload = event.payload;
      tx.insert(schema.snapshots).values({
        id: crypto.randomUUID(),
        sessionId: event.sessionId,
        checkpointId: payload.checkpointId,
        data: JSON.stringify(payload.data),
        createdAt: event.timestamp,
      }).run();
      break;
    }
  }
}

export function createEventProjector(db: RelayDatabase): EventProjector {
  return {
    persist(event: RelayEvent): void {
      db.transaction((tx) => {
        tx.insert(schema.events).values({
          id: event.id,
          sessionId: event.sessionId,
          type: event.type,
          timestamp: event.timestamp,
          payload: JSON.stringify(event.payload),
        }).run();
        applyProjection(tx, event);
      });
    },
  };
}

export function getCheckpoint(
  db: RelayDatabase,
  sessionId: string,
  checkpointId: string,
): unknown | null {
  const row = db
    .select()
    .from(schema.snapshots)
    .where(eq(schema.snapshots.sessionId, sessionId))
    .all()
    .find((snapshot) => snapshot.checkpointId === checkpointId);

  if (!row) return null;
  return JSON.parse(row.data) as unknown;
}
