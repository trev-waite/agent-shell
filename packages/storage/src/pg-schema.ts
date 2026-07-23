import {
  pgTable,
  text,
  bigint,
  index,
} from "drizzle-orm/pg-core";

export const pgSessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  prompt: text("prompt").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const pgEvents = pgTable(
  "events",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => pgSessions.id),
    type: text("type").notNull(),
    timestamp: bigint("timestamp", { mode: "number" }).notNull(),
    payload: text("payload").notNull(),
  },
  (table) => [
    index("events_session_id_idx").on(table.sessionId),
    index("events_session_timestamp_idx").on(table.sessionId, table.timestamp),
  ],
);

export const pgMessages = pgTable("messages", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => pgSessions.id),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const pgToolCalls = pgTable("tool_calls", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => pgSessions.id),
  toolName: text("tool_name").notNull(),
  input: text("input").notNull(),
  output: text("output"),
  error: text("error"),
  startedAt: bigint("started_at", { mode: "number" }).notNull(),
  completedAt: bigint("completed_at", { mode: "number" }),
});

export const pgSnapshots = pgTable("snapshots", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => pgSessions.id),
  checkpointId: text("checkpoint_id").notNull(),
  data: text("data").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const pgSchema = {
  sessions: pgSessions,
  events: pgEvents,
  messages: pgMessages,
  toolCalls: pgToolCalls,
  snapshots: pgSnapshots,
};
