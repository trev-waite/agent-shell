import type { Dispatch } from "react";
import type { ColorSchemePreference } from "./theme.js";
import type { UIAction } from "./state.js";

export interface SlashCommandDef {
  name: string;
  description: string;
  actions: UIAction[];
  message?: string;
}

export interface SlashCommandResult {
  actions: UIAction[];
  message?: string;
}

export const SLASH_COMMANDS: SlashCommandDef[] = [
  {
    name: "model",
    description: "Open model picker",
    actions: [{ type: "OPEN_OVERLAY", panel: "model" }],
  },
  {
    name: "trace",
    description: "Show tool trace",
    actions: [{ type: "OPEN_OVERLAY", panel: "trace" }],
  },
  {
    name: "metrics",
    description: "Show session metrics",
    actions: [{ type: "OPEN_OVERLAY", panel: "metrics" }],
  },
  {
    name: "theme",
    description: "Cycle theme (or: dark, light, auto)",
    actions: [{ type: "CYCLE_COLOR_SCHEME" }],
  },
  {
    name: "expand",
    description: "Expand focused trace item",
    actions: [{ type: "EXPAND_TRACE_FOCUS" }],
  },
  {
    name: "collapse",
    description: "Collapse focused trace item",
    actions: [{ type: "COLLAPSE_TRACE_FOCUS" }],
  },
  {
    name: "new",
    description: "Start a new conversation",
    actions: [{ type: "NEW_SESSION" }],
    message: "New conversation — cancelled in-flight work; next message starts a fresh session",
  },
  {
    name: "help",
    description: "List all commands",
    actions: [],
  },
];

export function slashCommandsHelp(): string {
  return SLASH_COMMANDS.map((c) => `/${c.name} — ${c.description}`).join(" · ");
}

export function filterSlashCommands(input: string): SlashCommandDef[] {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return SLASH_COMMANDS;

  const query = trimmed.slice(1).toLowerCase();
  const spaceIdx = query.indexOf(" ");
  const nameQuery = spaceIdx === -1 ? query : query.slice(0, spaceIdx);

  if (!nameQuery) return SLASH_COMMANDS;

  return SLASH_COMMANDS.filter((cmd) => cmd.name.startsWith(nameQuery));
}

function parseThemeArg(arg: string | undefined): SlashCommandResult | null {
  if (!arg) {
    return { actions: [{ type: "CYCLE_COLOR_SCHEME" }] };
  }
  const lower = arg.toLowerCase();
  if (lower === "auto" || lower === "dark" || lower === "light") {
    return {
      actions: [{ type: "SET_COLOR_SCHEME", preference: lower as ColorSchemePreference }],
      message: `Theme set to ${lower}`,
    };
  }
  return null;
}

export function parseSlashCommand(input: string): SlashCommandResult | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;

  const body = trimmed.slice(1);
  const spaceIdx = body.indexOf(" ");
  const name = (spaceIdx === -1 ? body : body.slice(0, spaceIdx)).toLowerCase();
  const arg = spaceIdx === -1 ? undefined : body.slice(spaceIdx + 1).trim();

  const def = SLASH_COMMANDS.find((c) => c.name === name);
  if (def) {
    if (name === "theme") {
      return parseThemeArg(arg) ?? { actions: [], message: "Usage: /theme [auto|dark|light]" };
    }
    if (name === "help") {
      return { actions: [], message: slashCommandsHelp() };
    }
    return {
      actions: def.actions,
      ...(def.message !== undefined ? { message: def.message } : {}),
    };
  }

  return {
    actions: [],
    message: `Unknown command: /${name} — try /help`,
  };
}

export function slashCommandAtIndex(index: number, input: string): SlashCommandDef | undefined {
  const filtered = filterSlashCommands(input);
  return filtered[Math.max(0, Math.min(index, filtered.length - 1))];
}

export function dispatchSlashResult(
  dispatch: Dispatch<UIAction>,
  result: SlashCommandResult,
): void {
  dispatch({ type: "SET_INPUT", input: "" });
  for (const action of result.actions) {
    dispatch(action);
  }
  if (result.message) {
    dispatch({ type: "SET_COMMAND_NOTICE", message: result.message });
  }
}

export function executeSlashAtIndex(
  dispatch: Dispatch<UIAction>,
  index: number,
  input: string,
): void {
  const def = slashCommandAtIndex(index, input);
  if (!def) {
    dispatch({ type: "CLOSE_OVERLAY" });
    return;
  }

  const result = parseSlashCommand(`/${def.name}`);
  if (result) {
    dispatchSlashResult(dispatch, result);
  }
}

export function isSlashCommand(input: string): boolean {
  return input.trim().startsWith("/");
}

export function shouldShowSlashPalette(input: string): boolean {
  const trimmed = input.trim();
  return trimmed.startsWith("/") && !trimmed.includes("\n");
}
