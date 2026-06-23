import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  prompt: text("prompt").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id),
  type: text("type").notNull(),
  timestamp: integer("timestamp").notNull(),
  payload: text("payload").notNull(),
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const toolCalls = sqliteTable("tool_calls", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id),
  toolName: text("tool_name").notNull(),
  input: text("input").notNull(),
  output: text("output"),
  error: text("error"),
  startedAt: integer("started_at").notNull(),
  completedAt: integer("completed_at"),
});

export const snapshots = sqliteTable("snapshots", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id),
  checkpointId: text("checkpoint_id").notNull(),
  data: text("data").notNull(),
  createdAt: integer("created_at").notNull(),
});
