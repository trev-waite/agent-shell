import { describe, expect, test } from "bun:test";
import {
  formatToolOutput,
  toolOutputIsExpandable,
  TOOL_PREVIEW_LINES,
} from "./formatTool";

describe("formatToolOutput", () => {
  test("stringifies objects and passes through strings", () => {
    expect(formatToolOutput("done")).toBe("done");
    expect(formatToolOutput({ ok: true })).toBe('{\n  "ok": true\n}');
    expect(formatToolOutput(null)).toBe("");
  });
});

describe("toolOutputIsExpandable", () => {
  test("requires content beyond preview limits", () => {
    expect(toolOutputIsExpandable("")).toBe(false);
    expect(toolOutputIsExpandable("short")).toBe(false);
    expect(toolOutputIsExpandable("x".repeat(141))).toBe(true);
    expect(
      toolOutputIsExpandable(
        Array.from({ length: TOOL_PREVIEW_LINES + 1 }, () => "line").join("\n"),
      ),
    ).toBe(true);
  });
});
