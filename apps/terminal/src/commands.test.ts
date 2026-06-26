import { describe, expect, test } from "bun:test";
import { parseSlashCommand, isSlashCommand } from "./commands.js";

describe("slash commands", () => {
  test("isSlashCommand detects slash prefix", () => {
    expect(isSlashCommand("/help")).toBe(true);
    expect(isSlashCommand("hello")).toBe(false);
  });

  test("/model opens model menu", () => {
    const result = parseSlashCommand("/model");
    expect(result?.actions).toEqual([{ type: "OPEN_OVERLAY", panel: "model" }]);
  });

  test("/trace and /metrics open overlays", () => {
    expect(parseSlashCommand("/trace")?.actions).toEqual([
      { type: "OPEN_OVERLAY", panel: "trace" },
    ]);
    expect(parseSlashCommand("/metrics")?.actions).toEqual([
      { type: "OPEN_OVERLAY", panel: "metrics" },
    ]);
  });

  test("/theme dark sets preference", () => {
    const result = parseSlashCommand("/theme dark");
    expect(result?.actions).toEqual([{ type: "SET_COLOR_SCHEME", preference: "dark" }]);
  });

  test("/theme cycles when no arg", () => {
    const result = parseSlashCommand("/theme");
    expect(result?.actions).toEqual([{ type: "CYCLE_COLOR_SCHEME" }]);
  });

  test("/expand and /collapse dispatch trace actions", () => {
    expect(parseSlashCommand("/expand")?.actions[0]?.type).toBe("EXPAND_TRACE_FOCUS");
    expect(parseSlashCommand("/collapse")?.actions[0]?.type).toBe("COLLAPSE_TRACE_FOCUS");
  });

  test("/help returns help text", () => {
    const result = parseSlashCommand("/help");
    expect(result?.message).toContain("/model");
    expect(result?.actions).toEqual([]);
  });

  test("/new starts a fresh conversation", () => {
    const result = parseSlashCommand("/new");
    expect(result?.actions).toEqual([{ type: "NEW_SESSION" }]);
    expect(result?.message).toContain("fresh session");
  });

  test("unknown command returns error message", () => {
    const result = parseSlashCommand("/foobar");
    expect(result?.message).toContain("Unknown command");
  });
});
