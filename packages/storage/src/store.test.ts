import { afterEach, describe, expect, test } from "bun:test";
import { unlinkSync } from "node:fs";
import type { RelayEvent } from "@relay/types";
import {
  createDatabase,
  createEventStore,
  migrateDatabase,
} from "./store.js";
import * as schema from "./schema.js";

const DB_PATH = "/tmp/relay-store-test.db";

afterEach(() => {
  for (const path of [DB_PATH, `${DB_PATH}-wal`, `${DB_PATH}-shm`]) {
    try {
      unlinkSync(path);
    } catch {
      // ignore missing files
    }
  }
});

function setupSession(sessionId: string): ReturnType<typeof createEventStore> {
  migrateDatabase(DB_PATH);
  const db = createDatabase(DB_PATH);
  db.insert(schema.sessions).values({
    id: sessionId,
    prompt: "hi",
    createdAt: Date.now(),
  }).run();
  return createEventStore(db);
}

describe("createEventStore.getBySession", () => {
  test("returns events after a valid afterId", async () => {
    const sessionId = "sess-1";
    const events = setupSession(sessionId);

    const e1: RelayEvent = {
      id: "evt-1",
      sessionId,
      type: "message.started",
      timestamp: 1,
      payload: { role: "user", content: "hi" },
    };
    const e2: RelayEvent = {
      id: "evt-2",
      sessionId,
      type: "message.completed",
      timestamp: 2,
      payload: { messageId: "msg-1", role: "assistant", content: "hello" },
    };

    await events.append(e1);
    await events.append(e2);

    expect(await events.getBySession(sessionId)).toHaveLength(2);
    expect(await events.getBySession(sessionId, "evt-1")).toHaveLength(1);
    expect((await events.getBySession(sessionId, "evt-1"))[0]?.id).toBe("evt-2");
  });

  test("falls back to full replay when afterId is unknown", async () => {
    const sessionId = "sess-2";
    const events = setupSession(sessionId);

    await events.append({
      id: "evt-a",
      sessionId,
      type: "message.started",
      timestamp: 1,
      payload: { role: "user", content: "hi" },
    });

    const replayed = await events.getBySession(sessionId, "stale-id");
    expect(replayed).toHaveLength(1);
    expect(replayed[0]?.id).toBe("evt-a");
  });
});
