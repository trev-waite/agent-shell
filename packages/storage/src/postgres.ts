import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { and, eq, asc, desc, gt, or } from "drizzle-orm";
import postgres from "postgres";
import type {
  RelayEvent,
  EventStore,
  EventProjector,
  ExecutionStore,
  Session,
} from "@relay/types";
import * as schema from "./pg-schema.js";

export type RelayPostgresDatabase = PostgresJsDatabase<typeof schema.pgSchema>;

export function createPostgresClient(url: string) {
  return postgres(url, { max: 10 });
}

export function createPostgresDatabase(
  sql: ReturnType<typeof postgres>,
): RelayPostgresDatabase {
  return drizzle(sql, { schema: schema.pgSchema });
}

/** Bootstrap schema for fresh Postgres databases (dev / compose). */
export async function migratePostgres(url: string): Promise<void> {
  const sql = postgres(url, { max: 1 });
  try {
    // Gateway and workers may start together; serialize bootstrap DDL per database.
    await sql`SELECT pg_advisory_lock(1380273237)`;
    await sql`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        prompt TEXT NOT NULL,
        created_at BIGINT NOT NULL
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id),
        type TEXT NOT NULL,
        timestamp BIGINT NOT NULL,
        payload TEXT NOT NULL
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS events_session_id_idx ON events(session_id)`;
    await sql`CREATE INDEX IF NOT EXISTS events_session_timestamp_idx ON events(session_id, timestamp)`;
    await sql`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id),
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at BIGINT NOT NULL
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS tool_calls (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id),
        tool_name TEXT NOT NULL,
        input TEXT NOT NULL,
        output TEXT,
        error TEXT,
        started_at BIGINT NOT NULL,
        completed_at BIGINT
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS snapshots (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id),
        checkpoint_id TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at BIGINT NOT NULL
      )
    `;
  } finally {
    await sql`SELECT pg_advisory_unlock(1380273237)`.catch(() => undefined);
    await sql.end({ timeout: 5 });
  }
}

function parseEvent(row: typeof schema.pgEvents.$inferSelect): RelayEvent {
  return {
    id: row.id,
    sessionId: row.sessionId,
    type: row.type as RelayEvent["type"],
    timestamp: row.timestamp,
    payload: JSON.parse(row.payload),
  } as RelayEvent;
}

export function createPostgresEventStore(db: RelayPostgresDatabase): EventStore {
  return {
    async append(event: RelayEvent): Promise<void> {
      await db.insert(schema.pgEvents).values({
        id: event.id,
        sessionId: event.sessionId,
        type: event.type,
        timestamp: event.timestamp,
        payload: JSON.stringify(event.payload),
      });
    },

    async getBySession(sessionId: string, afterId?: string): Promise<RelayEvent[]> {
      if (afterId) {
        const cursor = await db
          .select({ id: schema.pgEvents.id, timestamp: schema.pgEvents.timestamp })
          .from(schema.pgEvents)
          .where(
            and(
              eq(schema.pgEvents.sessionId, sessionId),
              eq(schema.pgEvents.id, afterId),
            ),
          )
          .limit(1);
        const after = cursor[0];
        if (after) {
          const rows = await db
            .select()
            .from(schema.pgEvents)
            .where(
              and(
                eq(schema.pgEvents.sessionId, sessionId),
                or(
                  gt(schema.pgEvents.timestamp, after.timestamp),
                  and(
                    eq(schema.pgEvents.timestamp, after.timestamp),
                    gt(schema.pgEvents.id, after.id),
                  ),
                ),
              ),
            )
            .orderBy(asc(schema.pgEvents.timestamp), asc(schema.pgEvents.id));
          return rows.map(parseEvent);
        }
      }

      const rows = await db
        .select()
        .from(schema.pgEvents)
        .where(eq(schema.pgEvents.sessionId, sessionId))
        .orderBy(asc(schema.pgEvents.timestamp), asc(schema.pgEvents.id));

      return rows.map(parseEvent);
    },

    async getLastEventId(sessionId: string): Promise<string | null> {
      const rows = await db
        .select({ id: schema.pgEvents.id })
        .from(schema.pgEvents)
        .where(eq(schema.pgEvents.sessionId, sessionId))
        .orderBy(desc(schema.pgEvents.timestamp), desc(schema.pgEvents.id))
        .limit(1);

      return rows[0]?.id ?? null;
    },
  };
}

export function createPostgresExecutionStore(
  db: RelayPostgresDatabase,
): ExecutionStore {
  const eventStore = createPostgresEventStore(db);

  return {
    events: eventStore,

    async createSession(prompt: string): Promise<Session> {
      const session: Session = {
        id: crypto.randomUUID(),
        prompt,
        createdAt: Date.now(),
      };
      await db.insert(schema.pgSessions).values({
        id: session.id,
        prompt: session.prompt,
        createdAt: session.createdAt,
      });
      return session;
    },

    async getSession(sessionId: string): Promise<Session | null> {
      const rows = await db
        .select()
        .from(schema.pgSessions)
        .where(eq(schema.pgSessions.id, sessionId))
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      return { id: row.id, prompt: row.prompt, createdAt: row.createdAt };
    },

    async listSessions(): Promise<Session[]> {
      const rows = await db.select().from(schema.pgSessions);
      return rows.map((row) => ({
        id: row.id,
        prompt: row.prompt,
        createdAt: row.createdAt,
      }));
    },
  };
}

function applyProjection(
  tx: RelayPostgresDatabase,
  event: RelayEvent,
): Promise<unknown>[] {
  const ops: Promise<unknown>[] = [];
  switch (event.type) {
    case "message.completed": {
      const payload = event.payload;
      ops.push(
        tx.insert(schema.pgMessages).values({
          id: payload.messageId,
          sessionId: event.sessionId,
          role: payload.role,
          content: payload.content,
          createdAt: event.timestamp,
        }),
      );
      break;
    }
    case "tool.started": {
      const payload = event.payload;
      ops.push(
        tx.insert(schema.pgToolCalls).values({
          id: payload.toolCallId,
          sessionId: event.sessionId,
          toolName: payload.toolName,
          input: JSON.stringify(payload.input),
          output: null,
          error: null,
          startedAt: event.timestamp,
          completedAt: null,
        }),
      );
      break;
    }
    case "tool.completed": {
      const payload = event.payload;
      ops.push(
        tx
          .update(schema.pgToolCalls)
          .set({
            output: payload.output !== null ? JSON.stringify(payload.output) : null,
            error: payload.error ?? null,
            completedAt: event.timestamp,
          })
          .where(eq(schema.pgToolCalls.id, payload.toolCallId)),
      );
      break;
    }
    case "checkpoint.saved": {
      const payload = event.payload;
      ops.push(
        tx.insert(schema.pgSnapshots).values({
          id: crypto.randomUUID(),
          sessionId: event.sessionId,
          checkpointId: payload.checkpointId,
          data: JSON.stringify(payload.data),
          createdAt: event.timestamp,
        }),
      );
      break;
    }
  }
  return ops;
}

export function createPostgresEventProjector(
  db: RelayPostgresDatabase,
): EventProjector {
  return {
    async persist(event: RelayEvent): Promise<void> {
      await db.transaction(async (tx) => {
        const inserted = await tx
          .insert(schema.pgEvents)
          .values({
            id: event.id,
            sessionId: event.sessionId,
            type: event.type,
            timestamp: event.timestamp,
            payload: JSON.stringify(event.payload),
          })
          .onConflictDoNothing()
          .returning({ id: schema.pgEvents.id });
        if (inserted.length === 0) return;
        await Promise.all(applyProjection(tx as unknown as RelayPostgresDatabase, event));
      });
    },
  };
}

/** Convenience: open Postgres URL → store + projector + close handle. */
export async function openPostgresStorage(url: string): Promise<{
  store: ExecutionStore;
  projector: EventProjector;
  sql: ReturnType<typeof postgres>;
  close: () => Promise<void>;
}> {
  await migratePostgres(url);
  const sql = createPostgresClient(url);
  const db = createPostgresDatabase(sql);
  return {
    store: createPostgresExecutionStore(db),
    projector: createPostgresEventProjector(db),
    sql,
    close: async () => {
      await sql.end({ timeout: 5 });
    },
  };
}
