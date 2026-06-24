import { afterEach, describe, expect, test } from "bun:test";
import { unlinkSync } from "node:fs";
import type { RelayEvent } from "@relay/types";
import { createDatabase, createExecutionStore, migrateDatabase } from "./store.js";
import { createEventProjector, getCheckpoint } from "./projector.js";

const DB_PATH = "/tmp/relay-projector-test.db";

afterEach(() => {
  for (const path of [DB_PATH, `${DB_PATH}-wal`, `${DB_PATH}-shm`]) {
    try {
      unlinkSync(path);
    } catch {
      // ignore missing files
    }
  }
});

describe("createEventProjector", () => {
  test("persists checkpoint.saved event and snapshot projection", () => {
    migrateDatabase(DB_PATH);
    const db = createDatabase(DB_PATH);
    const store = createExecutionStore(db);
    const projector = createEventProjector(db);
    const session = store.createSession("checkpoint test");

    const checkpointId = "chk-1";
    const data = { iteration: 1, messages: [{ role: "user", content: "hi" }] };

    const event: RelayEvent = {
      id: "evt-chk",
      sessionId: session.id,
      type: "checkpoint.saved",
      timestamp: Date.now(),
      payload: { checkpointId, label: "iteration-1", data },
    };

    projector.persist(event);

    expect(store.events.getBySession(session.id)).toHaveLength(1);
    expect(getCheckpoint(db, session.id, checkpointId)).toEqual(data);
  });
});
