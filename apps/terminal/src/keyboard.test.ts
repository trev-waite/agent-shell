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
    scroll: { maxRows: 20, maxScrollOffset: 0 },
    exit: () => {},
  };
}

describe("handleKey overlays", () => {
  test("Esc closes session overlay before exiting", () => {
    const actions: string[] = [];
    const dispatch = (action: { type: string }) => {
      actions.push(action.type);
    };

    const result = handleKey(
      "",
      { escape: true } as never,
      ctx({ activeOverlay: "session" }),
      dispatch,
    );

    expect(result).toBe("handled");
    expect(actions).toEqual(["CLOSE_OVERLAY"]);
  });

  test("Enter with session open and input submits", () => {
    const result = handleKey(
      "",
      { return: true } as never,
      ctx({ activeOverlay: "session", input: "hello" }),
      () => {},
    );

    expect(result).toBe("submit");
  });

  test("typing keeps session overlay open and updates input", () => {
    const actions: Array<{ type: string; input?: string }> = [];
    const dispatch = (action: { type: string; input?: string }) => {
      actions.push(action);
    };

    handleKey("h", {} as never, ctx({ activeOverlay: "session", input: "" }), dispatch);

    expect(actions).toEqual([{ type: "SET_INPUT", input: "h" }]);
  });

  test("slash palette Enter runs full slash input", () => {
    const actions: Array<{ type: string; message?: string }> = [];
    const dispatch = (action: { type: string; message?: string }) => {
      actions.push(action);
    };

    const result = handleKey(
      "",
      { return: true } as never,
      ctx({ activeOverlay: "slash", input: "/theme dark", slashMenuIndex: 0 }),
      dispatch,
    );

    expect(result).toBe("handled");
    expect(actions.some((a) => a.type === "SET_COLOR_SCHEME")).toBe(true);
    expect(actions.some((a) => a.type === "SET_COMMAND_NOTICE")).toBe(true);
  });

  test("arrow scrolls chat when prompt is empty", () => {
    const actions: Array<{ type: string; delta?: number }> = [];
    const dispatch = (action: { type: string; delta?: number }) => {
      actions.push(action);
    };

    handleKey(
      "",
      { upArrow: true } as never,
      { ...ctx({ input: "" }), scroll: { maxRows: 20, maxScrollOffset: 50 } },
      dispatch,
    );

    expect(actions[0]?.type).toBe("SCROLL_BY");
    expect(actions[0]?.delta).toBe(-1);
  });

  test("Ctrl+U page scrolls chat", () => {
    const actions: Array<{ type: string; delta?: number }> = [];
    const dispatch = (action: { type: string; delta?: number }) => {
      actions.push(action);
    };

    handleKey(
      "u",
      { ctrl: true } as never,
      { ...ctx({ input: "draft" }), scroll: { maxRows: 20, maxScrollOffset: 50 } },
      dispatch,
    );

    expect(actions[0]?.type).toBe("SCROLL_BY");
    expect(actions[0]?.delta).toBeLessThan(0);
  });

  test("Ctrl+E jumps to bottom", () => {
    const actions: string[] = [];
    const dispatch = (action: { type: string }) => {
      actions.push(action.type);
    };

    handleKey(
      "e",
      { ctrl: true } as never,
      { ...ctx({ input: "" }), scroll: { maxRows: 20, maxScrollOffset: 50 } },
      dispatch,
    );

    expect(actions).toEqual(["SCROLL_TO_BOTTOM"]);
  });

  test("empty prompt letter starts a message", () => {
    const actions: Array<{ type: string; input?: string }> = [];
    const dispatch = (action: { type: string; input?: string }) => {
      actions.push(action);
    };

    handleKey("s", {} as never, ctx({ input: "" }), dispatch);

    expect(actions).toEqual([{ type: "SET_INPUT", input: "s" }]);
  });

  test("Ctrl+S toggles session overlay", () => {
    const actions: string[] = [];
    const dispatch = (action: { type: string }) => {
      actions.push(action.type);
    };

    handleKey(
      "s",
      { ctrl: true } as never,
      ctx({ input: "draft message" }),
      dispatch,
    );

    expect(actions).toEqual(["TOGGLE_OVERLAY"]);
  });

  test("Ctrl+O opens model picker", () => {
    const actions: string[] = [];
    const dispatch = (action: { type: string }) => {
      actions.push(action.type);
    };

    handleKey("o", { ctrl: true } as never, ctx(), dispatch);

    expect(actions).toEqual(["OPEN_OVERLAY"]);
  });

  test("Ctrl+T cycles theme", () => {
    const actions: string[] = [];
    const dispatch = (action: { type: string }) => {
      actions.push(action.type);
    };

    handleKey("t", { ctrl: true } as never, ctx(), dispatch);

    expect(actions).toEqual(["CYCLE_COLOR_SCHEME"]);
  });
});
