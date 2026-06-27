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

export interface RunSlashCommandOptions {
  onNewSession?: () => void;
  menuIndex?: number;
}

export const SLASH_COMMANDS: SlashCommandDef[] = [
  {
    name: "model",
    description: "Open model picker",
    actions: [{ type: "OPEN_OVERLAY", panel: "model" }],
  },
  {
    name: "session",
    description: "Show trace and metrics",
    actions: [{ type: "OPEN_OVERLAY", panel: "session" }],
  },
  {
    name: "theme",
    description: "Cycle theme (or: dark, light, auto)",
    actions: [{ type: "CYCLE_COLOR_SCHEME" }],
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

/** Legacy aliases — open the combined session panel. */
const SESSION_ALIASES = new Set(["trace", "metrics"]);

function isKnownSlashName(name: string): boolean {
  return SLASH_COMMANDS.some((c) => c.name === name) || SESSION_ALIASES.has(name);
}

/** Use typed input when it's a full command; otherwise fall back to the palette selection. */
export function resolveSlashInput(input: string, menuIndex: number): string {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return trimmed;

  const body = trimmed.slice(1);
  const spaceIdx = body.indexOf(" ");
  const name = (spaceIdx === -1 ? body : body.slice(0, spaceIdx)).toLowerCase();
  const args = spaceIdx === -1 ? "" : body.slice(spaceIdx + 1).trim();

  if (isKnownSlashName(name)) {
    return trimmed;
  }

  const filtered = filterSlashCommands(trimmed);
  const selected = filtered[Math.max(0, Math.min(menuIndex, filtered.length - 1))];
  if (!selected) return trimmed;

  return args ? `/${selected.name} ${args}` : `/${selected.name}`;
}

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
    return {
      actions: [{ type: "CYCLE_COLOR_SCHEME" }],
      message: "Theme cycled (auto → dark → light)",
    };
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

  if (SESSION_ALIASES.has(name)) {
    return { actions: [{ type: "OPEN_OVERLAY", panel: "session" }] };
  }

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

export function dispatchSlashResult(
  dispatch: Dispatch<UIAction>,
  result: SlashCommandResult,
): void {
  for (const action of result.actions) {
    dispatch(action);
  }
  dispatch({ type: "SET_INPUT", input: "" });
  if (result.message) {
    dispatch({ type: "SET_COMMAND_NOTICE", message: result.message });
  }
}

export function runSlashCommand(
  input: string,
  dispatch: Dispatch<UIAction>,
  options?: RunSlashCommandOptions,
): boolean {
  const resolved = resolveSlashInput(input, options?.menuIndex ?? 0);
  const result = parseSlashCommand(resolved);
  if (!result) return false;

  if (result.actions.some((action) => action.type === "NEW_SESSION")) {
    options?.onNewSession?.();
  }

  dispatchSlashResult(dispatch, result);
  return true;
}

export function isSlashCommand(input: string): boolean {
  return input.trim().startsWith("/");
}

export function shouldShowSlashPalette(input: string): boolean {
  const trimmed = input.trim();
  return trimmed.startsWith("/") && !trimmed.includes("\n");
}
