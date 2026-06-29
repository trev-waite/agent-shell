import { describe, expect, test } from "bun:test";
import { parseSlashCommand, isSlashCommand, resolveSlashInput, runSlashCommand } from "./commands.js";

describe("slash commands", () => {
  test("isSlashCommand detects slash prefix", () => {
    expect(isSlashCommand("/help")).toBe(true);
    expect(isSlashCommand("hello")).toBe(false);
  });

  test("/model opens model menu", () => {
    const result = parseSlashCommand("/model");
    expect(result?.actions).toEqual([{ type: "OPEN_OVERLAY", panel: "model" }]);
  });

  test("/session opens combined panel", () => {
    expect(parseSlashCommand("/session")?.actions).toEqual([
      { type: "OPEN_OVERLAY", panel: "session" },
    ]);
  });

  test("/trace and /metrics alias session panel", () => {
    expect(parseSlashCommand("/trace")?.actions).toEqual([
      { type: "OPEN_OVERLAY", panel: "session" },
    ]);
    expect(parseSlashCommand("/metrics")?.actions).toEqual([
      { type: "OPEN_OVERLAY", panel: "session" },
    ]);
  });

  test("/theme dark sets preference", () => {
    const result = parseSlashCommand("/theme dark");
    expect(result?.actions).toEqual([{ type: "SET_COLOR_SCHEME", preference: "dark" }]);
    expect(result?.message).toContain("dark");
  });

  test("/theme cycles when no arg", () => {
    const result = parseSlashCommand("/theme");
    expect(result?.actions).toEqual([{ type: "CYCLE_COLOR_SCHEME" }]);
    expect(result?.message).toBeDefined();
  });

  test("/help returns help text", () => {
    const result = parseSlashCommand("/help");
    expect(result?.message).toContain("/model");
    expect(result?.message).toContain("Ctrl+O");
    expect(result?.message).toContain("Ctrl+U/D page");
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

  test("resolveSlashInput uses palette selection for partial names", () => {
    expect(resolveSlashInput("/h", 0)).toBe("/help");
    expect(resolveSlashInput("/theme dark", 0)).toBe("/theme dark");
  });

  test("runSlashCommand resolves partial palette input", () => {
    const actions: Array<{ type: string }> = [];
    runSlashCommand("/h", (a) => actions.push(a), { menuIndex: 0 });
    expect(actions.some((a) => a.type === "SET_COMMAND_NOTICE")).toBe(true);
    expect(actions.some((a) => a.type === "OPEN_OVERLAY")).toBe(false);
  });
});
