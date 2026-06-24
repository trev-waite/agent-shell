import { describe, expect, test } from "bun:test";
import type { RelayEvent } from "@relay/types";
import {
  findCheckpointEvent,
  listCheckpointSummaries,
  parseCheckpointData,
} from "./checkpoint.js";

const checkpointEvent = (
  checkpointId: string,
  iteration: number,
  timestamp: number,
): RelayEvent => ({
  id: `evt-${checkpointId}`,
  sessionId: "sess-1",
  type: "checkpoint.saved",
  timestamp,
  payload: {
    checkpointId,
    label: `iteration-${iteration}`,
    data: {
      iteration,
      messages: [
        { role: "user", content: "hello" },
        { role: "assistant", content: "hi there" },
      ],
    },
  },
});

describe("parseCheckpointData", () => {
  test("parses valid checkpoint payload", () => {
    const data = {
      iteration: 2,
      messages: [{ role: "user" as const, content: "test" }],
    };
    expect(parseCheckpointData(data)).toEqual(data);
  });

  test("rejects invalid payload", () => {
    expect(() => parseCheckpointData(null)).toThrow("Invalid checkpoint data");
    expect(() => parseCheckpointData({ iteration: "x", messages: [] })).toThrow(
      "Invalid checkpoint iteration",
    );
  });
});

describe("findCheckpointEvent", () => {
  const events: RelayEvent[] = [
    checkpointEvent("chk-1", 1, 100),
    checkpointEvent("chk-2", 2, 200),
  ];

  test("returns latest checkpoint when id is omitted", () => {
    const found = findCheckpointEvent(events);
    expect(found.payload.checkpointId).toBe("chk-2");
  });

  test("returns checkpoint by id", () => {
    const found = findCheckpointEvent(events, "chk-1");
    expect(found.payload.checkpointId).toBe("chk-1");
  });

  test("throws when checkpoint is missing", () => {
    expect(() => findCheckpointEvent(events, "missing")).toThrow("Checkpoint not found");
    expect(() => findCheckpointEvent([])).toThrow("No checkpoints found");
  });
});

describe("listCheckpointSummaries", () => {
  test("maps checkpoint events to summaries", () => {
    const summaries = listCheckpointSummaries([
      checkpointEvent("chk-1", 1, 100),
      checkpointEvent("chk-2", 2, 200),
    ]);

    expect(summaries).toEqual([
      {
        checkpointId: "chk-1",
        label: "iteration-1",
        timestamp: 100,
        iteration: 1,
      },
      {
        checkpointId: "chk-2",
        label: "iteration-2",
        timestamp: 200,
        iteration: 2,
      },
    ]);
  });
});
