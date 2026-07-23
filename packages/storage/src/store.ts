import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { eq, asc } from "drizzle-orm";
import type {
  RelayEvent,
  EventStore,
  ExecutionStore,
  Session,
  MessageProjection,
  ToolCallProjection,
} from "@relay/types";
import * as schema from "./schema.js";

export type RelayDatabase = BunSQLiteDatabase<typeof schema>;

export function createDatabase(dbPath: string): RelayDatabase {
  mkdirSync(dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath, { create: true });
  sqlite.exec("PRAGMA journal_mode = WAL;");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  return drizzle(sqlite, { schema });
}

// Future work: consolidate with drizzle-kit migrations (db:generate / db:migrate).
// Inline SQL here bootstraps fresh dev DBs; drizzle tracks schema evolution for production.
export function migrateDatabase(dbPath: string): void {
  mkdirSync(dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath, { create: true });
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      prompt TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      type TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      payload TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS events_session_id_idx ON events(session_id);
    CREATE INDEX IF NOT EXISTS events_session_timestamp_idx ON events(session_id, timestamp);
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tool_calls (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      tool_name TEXT NOT NULL,
      input TEXT NOT NULL,
      output TEXT,
      error TEXT,
      started_at INTEGER NOT NULL,
      completed_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS snapshots (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      checkpoint_id TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);
  sqlite.close();
}

function parseEvent(row: typeof schema.events.$inferSelect): RelayEvent {
  return {
    id: row.id,
    sessionId: row.sessionId,
    type: row.type as RelayEvent["type"],
    timestamp: row.timestamp,
    payload: JSON.parse(row.payload),
  } as RelayEvent;
}

export function createEventStore(db: RelayDatabase): EventStore {
  return {
    async append(event: RelayEvent): Promise<void> {
      db.insert(schema.events).values({
        id: event.id,
        sessionId: event.sessionId,
        type: event.type,
        timestamp: event.timestamp,
        payload: JSON.stringify(event.payload),
      }).run();
    },

    async getBySession(sessionId: string, afterId?: string): Promise<RelayEvent[]> {
      const rows = db
        .select()
        .from(schema.events)
        .where(eq(schema.events.sessionId, sessionId))
        .orderBy(asc(schema.events.timestamp), asc(schema.events.id))
        .all();

      if (afterId) {
        const afterIndex = rows.findIndex((r) => r.id === afterId);
        if (afterIndex >= 0) {
          return rows.slice(afterIndex + 1).map(parseEvent);
        }
        // Stale/unknown cursor (e.g. live-ahead-of-durable Last-Event-ID):
        // fall back to full session replay rather than silently returning [].
        return rows.map(parseEvent);
      }

      return rows.map(parseEvent);
    },

    async getLastEventId(sessionId: string): Promise<string | null> {
      const rows = db
        .select()
        .from(schema.events)
        .where(eq(schema.events.sessionId, sessionId))
        .orderBy(asc(schema.events.timestamp), asc(schema.events.id))
        .all();

      return rows.length > 0 ? rows[rows.length - 1]!.id : null;
    },
  };
}

export function createExecutionStore(db: RelayDatabase): ExecutionStore {
  const eventStore = createEventStore(db);

  return {
    events: eventStore,

    async createSession(prompt: string): Promise<Session> {
      const session: Session = {
        id: crypto.randomUUID(),
        prompt,
        createdAt: Date.now(),
      };
      db.insert(schema.sessions).values({
        id: session.id,
        prompt: session.prompt,
        createdAt: session.createdAt,
      }).run();
      return session;
    },

    async getSession(sessionId: string): Promise<Session | null> {
      const row = db
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.id, sessionId))
        .get();
      if (!row) return null;
      return { id: row.id, prompt: row.prompt, createdAt: row.createdAt };
    },

    async listSessions(): Promise<Session[]> {
      return db.select().from(schema.sessions).all().map((row) => ({
        id: row.id,
        prompt: row.prompt,
        createdAt: row.createdAt,
      }));
    },
  };
}

export function projectMessage(
  db: RelayDatabase,
  message: MessageProjection,
): void {
  db.insert(schema.messages).values({
    id: message.id,
    sessionId: message.sessionId,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
  }).run();
}

export function projectToolCallStart(
  db: RelayDatabase,
  toolCall: ToolCallProjection,
): void {
  db.insert(schema.toolCalls).values({
    id: toolCall.id,
    sessionId: toolCall.sessionId,
    toolName: toolCall.toolName,
    input: JSON.stringify(toolCall.input),
    output: null,
    error: null,
    startedAt: toolCall.startedAt,
    completedAt: null,
  }).run();
}

export function projectToolCallComplete(
  db: RelayDatabase,
  toolCallId: string,
  output: unknown,
  error: string | null,
): void {
  db.update(schema.toolCalls)
    .set({
      output: output !== null ? JSON.stringify(output) : null,
      error,
      completedAt: Date.now(),
    })
    .where(eq(schema.toolCalls.id, toolCallId))
    .run();
}

export function saveSnapshot(
  db: RelayDatabase,
  sessionId: string,
  checkpointId: string,
  data: unknown,
): void {
  db.insert(schema.snapshots).values({
    id: crypto.randomUUID(),
    sessionId,
    checkpointId,
    data: JSON.stringify(data),
    createdAt: Date.now(),
  }).run();
}
