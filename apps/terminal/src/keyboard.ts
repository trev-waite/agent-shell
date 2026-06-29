import type { Dispatch } from "react";
import type { Key } from "ink";
import type { LayoutConfig } from "./theme.js";
import type { UIAction, UIState } from "./state.js";
import {
  runSlashCommand,
  isSlashCommand,
} from "./commands.js";
import { isPanelOverlay } from "./stateHelpers.js";

export interface ScrollContext {
  maxRows: number;
  maxScrollOffset: number;
}

export interface KeyContext {
  state: UIState;
  layout: LayoutConfig;
  scroll: ScrollContext;
  exit: () => void;
  onNewSession?: () => void;
}

type KeyMatcher = (input: string, key: Key) => boolean;

interface KeyBinding {
  id: string;
  match: KeyMatcher;
  when?: (ctx: KeyContext) => boolean;
  run: (input: string, ctx: KeyContext, dispatch: Dispatch<UIAction>) => boolean;
}

function overlayIs(ctx: KeyContext, panel: UIState["activeOverlay"]): boolean {
  return ctx.state.activeOverlay === panel;
}

function overlayClosed(ctx: KeyContext): boolean {
  return ctx.state.activeOverlay === "none";
}

/** Line scroll with bare arrows — only when the prompt is empty. */
function canArrowScroll(ctx: KeyContext): boolean {
  return overlayClosed(ctx) && ctx.state.input.length === 0;
}

type KeyWithAlt = Key & { alt?: boolean };

function hasAlt(key: Key): boolean {
  return Boolean((key as KeyWithAlt).alt);
}

function bareArrow(key: Key, direction: "up" | "down"): boolean {
  const arrow = direction === "up" ? key.upArrow : key.downArrow;
  return (
    arrow &&
    !key.ctrl &&
    !key.meta &&
    !key.shift &&
    !hasAlt(key)
  );
}

function noMod(key: Key): boolean {
  return !key.ctrl && !key.meta;
}

function canType(ctx: KeyContext): boolean {
  return ctx.state.activeOverlay !== "model";
}

function canSubmit(ctx: KeyContext): boolean {
  if (overlayIs(ctx, "model") || overlayIs(ctx, "slash")) return false;
  if (!ctx.state.input.trim()) return overlayClosed(ctx);
  return overlayClosed(ctx) || isPanelOverlay(ctx.state.activeOverlay);
}

/** Control (^) reaches the TUI; Command (⌘) is handled by the terminal app or OS. */
function ctrlKey(input: string, key: Key, letter: string): boolean {
  return key.ctrl && !key.meta && !key.shift && input === letter;
}

function dispatchScroll(
  dispatch: Dispatch<UIAction>,
  ctx: KeyContext,
  delta: number,
): void {
  dispatch({
    type: "SCROLL_BY",
    delta,
    maxOffset: ctx.scroll.maxScrollOffset,
  });
}

function pageScrollDelta(ctx: KeyContext, direction: -1 | 1): number {
  return direction * Math.max(1, Math.floor(ctx.scroll.maxRows / 2));
}

export const KEY_BINDINGS: KeyBinding[] = [
  {
    id: "exit-ctrl-c",
    match: (_input, key) => key.ctrl && _input === "c",
    run: (_input, ctx) => {
      ctx.exit();
      return true;
    },
  },
  {
    id: "overlay-close-esc",
    match: (_input, key) => key.escape,
    when: (ctx) => !overlayClosed(ctx),
    run: (_input, _ctx, dispatch) => {
      dispatch({ type: "CLOSE_OVERLAY" });
      return true;
    },
  },
  {
    id: "model-confirm",
    match: (_input, key) => key.return,
    when: (ctx) => overlayIs(ctx, "model"),
    run: (_input, _ctx, dispatch) => {
      dispatch({ type: "CONFIRM_MENU_SELECTION" });
      return true;
    },
  },
  {
    id: "model-up",
    match: (_input, key) => key.upArrow,
    when: (ctx) => overlayIs(ctx, "model"),
    run: (_input, _ctx, dispatch) => {
      dispatch({ type: "MENU_MOVE_UP" });
      return true;
    },
  },
  {
    id: "model-down",
    match: (_input, key) => key.downArrow,
    when: (ctx) => overlayIs(ctx, "model"),
    run: (_input, _ctx, dispatch) => {
      dispatch({ type: "MENU_MOVE_DOWN" });
      return true;
    },
  },
  {
    id: "model-provider-prev",
    match: (_input, key) => key.leftArrow,
    when: (ctx) => overlayIs(ctx, "model"),
    run: (_input, _ctx, dispatch) => {
      dispatch({ type: "MENU_PROVIDER_PREV" });
      return true;
    },
  },
  {
    id: "model-provider-next",
    match: (_input, key) => key.rightArrow,
    when: (ctx) => overlayIs(ctx, "model"),
    run: (_input, _ctx, dispatch) => {
      dispatch({ type: "MENU_PROVIDER_NEXT" });
      return true;
    },
  },
  {
    id: "slash-confirm",
    match: (_input, key) => key.return,
    when: (ctx) => overlayIs(ctx, "slash"),
    run: (_input, ctx, dispatch) => {
      const options = ctx.onNewSession
        ? { onNewSession: ctx.onNewSession, menuIndex: ctx.state.slashMenuIndex }
        : { menuIndex: ctx.state.slashMenuIndex };
      runSlashCommand(ctx.state.input, dispatch, options);
      return true;
    },
  },
  {
    id: "slash-up",
    match: (_input, key) => key.upArrow,
    when: (ctx) => overlayIs(ctx, "slash"),
    run: (_input, _ctx, dispatch) => {
      dispatch({ type: "SLASH_MENU_UP" });
      return true;
    },
  },
  {
    id: "slash-down",
    match: (_input, key) => key.downArrow,
    when: (ctx) => overlayIs(ctx, "slash"),
    run: (_input, _ctx, dispatch) => {
      dispatch({ type: "SLASH_MENU_DOWN" });
      return true;
    },
  },
  {
    id: "trace-expand",
    match: (input, key) => input === "]" && noMod(key),
    when: (ctx) => overlayIs(ctx, "session"),
    run: (_input, _ctx, dispatch) => {
      dispatch({ type: "EXPAND_TRACE_FOCUS" });
      return true;
    },
  },
  {
    id: "trace-collapse",
    match: (input, key) => input === "[" && noMod(key),
    when: (ctx) => overlayIs(ctx, "session"),
    run: (_input, _ctx, dispatch) => {
      dispatch({ type: "COLLAPSE_TRACE_FOCUS" });
      return true;
    },
  },
  {
    id: "scroll-page-up",
    match: (input, key) => ctrlKey(input, key, "u"),
    when: overlayClosed,
    run: (_input, ctx, dispatch) => {
      dispatchScroll(dispatch, ctx, pageScrollDelta(ctx, -1));
      return true;
    },
  },
  {
    id: "scroll-page-down",
    match: (input, key) => ctrlKey(input, key, "d"),
    when: overlayClosed,
    run: (_input, ctx, dispatch) => {
      dispatchScroll(dispatch, ctx, pageScrollDelta(ctx, 1));
      return true;
    },
  },
  {
    id: "scroll-line-up",
    match: (_input, key) => bareArrow(key, "up"),
    when: canArrowScroll,
    run: (_input, ctx, dispatch) => {
      dispatchScroll(dispatch, ctx, -1);
      return true;
    },
  },
  {
    id: "scroll-line-down",
    match: (_input, key) => bareArrow(key, "down"),
    when: canArrowScroll,
    run: (_input, ctx, dispatch) => {
      dispatchScroll(dispatch, ctx, 1);
      return true;
    },
  },
  {
    id: "scroll-to-top",
    match: (input, key) => ctrlKey(input, key, "a"),
    when: overlayClosed,
    run: (_input, ctx, dispatch) => {
      dispatch({ type: "SCROLL_TO_TOP", maxOffset: ctx.scroll.maxScrollOffset });
      return true;
    },
  },
  {
    id: "scroll-to-bottom",
    match: (input, key) => ctrlKey(input, key, "e"),
    when: overlayClosed,
    run: (_input, _ctx, dispatch) => {
      dispatch({ type: "SCROLL_TO_BOTTOM" });
      return true;
    },
  },
  {
    id: "toggle-scrollbar",
    match: (input, key) => ctrlKey(input, key, "b"),
    when: overlayClosed,
    run: (_input, _ctx, dispatch) => {
      dispatch({ type: "TOGGLE_SCROLLBAR" });
      return true;
    },
  },
  {
    id: "exit-esc",
    match: (_input, key) => key.escape,
    when: overlayClosed,
    run: (_input, ctx) => {
      ctx.exit();
      return true;
    },
  },
  {
    id: "open-model-ctrl-o",
    match: (input, key) => ctrlKey(input, key, "o"),
    when: overlayClosed,
    run: (_input, _ctx, dispatch) => {
      dispatch({ type: "OPEN_OVERLAY", panel: "model" });
      return true;
    },
  },
  {
    id: "open-model-tab",
    match: (input, key) => key.tab && input === "",
    when: (ctx) => overlayClosed(ctx) && ctx.state.input.length === 0,
    run: (_input, _ctx, dispatch) => {
      dispatch({ type: "OPEN_OVERLAY", panel: "model" });
      return true;
    },
  },
  {
    id: "submit",
    match: (_input, key) => key.return,
    when: canSubmit,
    run: (_input, ctx) => {
      const prompt = ctx.state.input.trim();
      if (!prompt) return true;
      if (isSlashCommand(prompt)) return false;
      if (ctx.state.serverOnline === false) return true;
      return false;
    },
  },
  {
    id: "backspace",
    match: (_input, key) => key.backspace || key.delete,
    when: canType,
    run: (_input, ctx, dispatch) => {
      dispatch({ type: "SET_INPUT", input: ctx.state.input.slice(0, -1) });
      return true;
    },
  },
  {
    id: "toggle-session-overlay-ctrl",
    match: (input, key) => ctrlKey(input, key, "p"),
    when: (ctx) => !overlayIs(ctx, "model") && !overlayIs(ctx, "slash"),
    run: (_input, _ctx, dispatch) => {
      dispatch({ type: "TOGGLE_OVERLAY", panel: "session" });
      return true;
    },
  },
  {
    id: "cycle-theme-ctrl",
    match: (input, key) => ctrlKey(input, key, "t"),
    when: overlayClosed,
    run: (_input, _ctx, dispatch) => {
      dispatch({ type: "CYCLE_COLOR_SCHEME" });
      return true;
    },
  },
  {
    id: "type-char",
    match: (input, key) => Boolean(input) && !key.ctrl && !key.meta,
    when: canType,
    run: (input, ctx, dispatch) => {
      dispatch({ type: "SET_INPUT", input: ctx.state.input + input });
      return true;
    },
  },
];

export function handleKey(
  input: string,
  key: Key,
  ctx: KeyContext,
  dispatch: Dispatch<UIAction>,
): "handled" | "submit" {
  for (const binding of KEY_BINDINGS) {
    if (binding.when && !binding.when(ctx)) continue;
    if (!binding.match(input, key)) continue;

    const handled = binding.run(input, ctx, dispatch);
    if (binding.id === "submit" && !handled) return "submit";
    return "handled";
  }
  return "handled";
}
