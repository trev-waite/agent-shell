import { describe, expect, test } from "bun:test";
import { deriveOrbStatus, orbPalette, orbSpeed, type AgentOrbStatus } from "./orbStatus";
import type { Turn } from "../state";

function turn(overrides: Partial<Turn> & Pick<Turn, "localId">): Turn {
  return {
    sessionId: null,
    prompt: "hello",
    messages: [],
    activity: { phase: "idle", label: null },
    status: "sending",
    seenEventIds: new Set(),
    streamConnected: false,
    ...overrides,
  };
}

describe("deriveOrbStatus", () => {
  test("returns idle when no turn", () => {
    expect(deriveOrbStatus(undefined)).toBe("idle");
  });

  test("returns error for failed turn", () => {
    expect(
      deriveOrbStatus(turn({ localId: "a", status: "error" })),
    ).toBe("error");
  });

  test("returns idle for completed turn", () => {
    expect(
      deriveOrbStatus(turn({ localId: "a", status: "complete" })),
    ).toBe("idle");
  });

  test("returns thinking while sending", () => {
    expect(
      deriveOrbStatus(
        turn({
          localId: "a",
          status: "sending",
          activity: { phase: "thinking", label: "thinking" },
        }),
      ),
    ).toBe("thinking");
  });

  test("returns thinking while running in thinking phase", () => {
    expect(
      deriveOrbStatus(
        turn({
          localId: "a",
          status: "running",
          activity: { phase: "thinking", label: "thinking" },
        }),
      ),
    ).toBe("thinking");
  });

  test("returns working while running a tool", () => {
    expect(
      deriveOrbStatus(
        turn({
          localId: "a",
          status: "running",
          activity: { phase: "tool", label: "reading files" },
        }),
      ),
    ).toBe("working");
  });

  test("returns working while streaming", () => {
    expect(
      deriveOrbStatus(
        turn({
          localId: "a",
          status: "running",
          activity: { phase: "streaming", label: null },
        }),
      ),
    ).toBe("working");
  });
});

describe("orbSpeed", () => {
  test("idle is slowest", () => {
    const statuses: AgentOrbStatus[] = [
      "idle",
      "thinking",
      "working",
      "error",
      "success",
    ];
    for (const status of statuses) {
      expect(orbSpeed(status)).toBeGreaterThan(0);
    }
    expect(orbSpeed("idle")).toBeLessThan(orbSpeed("thinking"));
  });
});

describe("orbPalette", () => {
  test("returns four colors for each status", () => {
    const accent = "#00b2ff";
    const sphereFront = "#00b2ff";
    const statuses: AgentOrbStatus[] = [
      "idle",
      "thinking",
      "working",
      "error",
      "success",
    ];
    for (const status of statuses) {
      const palette = orbPalette(status, accent, sphereFront, false);
      expect(palette).toHaveLength(4);
      for (const color of palette) {
        expect(color).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  test("error palette uses red tones", () => {
    const palette = orbPalette("error", "#00b2ff", "#ffffff", false);
    expect(palette[3]).toBe("#ff3355");
  });

  test("falls back when accent is not a hex color", () => {
    const palette = orbPalette("idle", "not-a-color", "#00b2ff", false);
    expect(palette).toHaveLength(4);
    for (const color of palette) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
