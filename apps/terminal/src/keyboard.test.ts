import { describe, expect, test } from "bun:test";
import { handleKey, type KeyContext } from "./keyboard.js";
import { initialState } from "./state.js";
import type { LayoutConfig } from "./theme.js";

const layout: LayoutConfig = {
  mode: "wide",
  columns: 120,
  rows: 40,
  showTraceJson: true,
  metricsColumns: 3,
  showSessionId: true,
};

function ctx(overrides: Partial<typeof initialState> = {}): KeyContext {
  return {
    state: { ...initialState, ...overrides },
    layout,
    exit: () => {},
  };
}

describe("handleKey overlays", () => {
  test("Esc closes metrics overlay before exiting", () => {
    const actions: string[] = [];
    const dispatch = (action: { type: string }) => {
      actions.push(action.type);
    };

    const result = handleKey(
      "",
      { escape: true } as never,
      ctx({ activeOverlay: "metrics" }),
      dispatch,
    );

    expect(result).toBe("handled");
    expect(actions).toEqual(["CLOSE_OVERLAY"]);
  });

  test("Enter with metrics open and input submits", () => {
    const result = handleKey(
      "",
      { return: true } as never,
      ctx({ activeOverlay: "metrics", input: "hello" }),
      () => {},
    );

    expect(result).toBe("submit");
  });

  test("typing keeps metrics overlay open and updates input", () => {
    const actions: Array<{ type: string; input?: string }> = [];
    const dispatch = (action: { type: string; input?: string }) => {
      actions.push(action);
    };

    handleKey("h", {} as never, ctx({ activeOverlay: "metrics", input: "" }), dispatch);

    expect(actions).toEqual([{ type: "SET_INPUT", input: "h" }]);
  });

  test("slash palette Enter is handled without submit", () => {
    const result = handleKey(
      "",
      { return: true } as never,
      ctx({ activeOverlay: "slash", input: "/help" }),
      () => {},
    );

    expect(result).toBe("handled");
  });
});
