import type { RelayEvent } from "@relay/types";
import type { GeminiModelId, ModelProviderId } from "@relay/types";
import {
  DEFAULT_GEMINI_MODEL,
  getEnabledProviders,
} from "@relay/types";
import type { ColorSchemePreference } from "./theme.js";
import { getFocusableTraceIds } from "./projections/trace.js";
import { filterSlashCommands, shouldShowSlashPalette } from "./commands.js";
import { openModelOverlayState, preservePreferences } from "./stateHelpers.js";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "error";
  content: string;
  streaming?: boolean;
  timestamp: number;
  completedAt?: number;
}

export interface ToolTrace {
  id: string;
  toolName: string;
  status: "running" | "completed" | "failed";
  startedAt: number;
  completedAt?: number;
  error?: string;
  input?: unknown;
  output?: unknown;
}

export interface ActivityStatus {
  label: string;
  phase: "thinking" | "tool" | "streaming";
}

export interface Metrics {
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
  currency: string;
  sessionStatus: string;
}

export type OverlayPanel = "none" | "slash" | "trace" | "metrics" | "model";

export interface UIState {
  messages: ChatMessage[];
  traces: ToolTrace[];
  metrics: Metrics;
  sessionId: string | null;
  input: string;
  selectedProviderId: ModelProviderId;
  selectedModel: GeminiModelId;
  menuProviderIndex: number;
  menuModelIndex: number;
  serverOnline: boolean | null;
  streamConnected: boolean;
  activity: ActivityStatus | null;
  seenEventIds: Set<string>;
  sessionStartedAt: number | null;
  sessionEndedAt: number | null;
  expandedTraceIds: string[];
  focusedTraceIndex: number;
  activeOverlay: OverlayPanel;
  slashMenuIndex: number;
  colorSchemePreference: ColorSchemePreference;
  commandNotice: string | null;
}

export type UIAction =
  | { type: "SET_SESSION"; sessionId: string }
  | { type: "SET_INPUT"; input: string }
  | { type: "SET_SELECTED_MODEL"; model: GeminiModelId }
  | { type: "SET_MODEL_SELECTION"; providerId: ModelProviderId; model: GeminiModelId }
  | { type: "OPEN_OVERLAY"; panel: OverlayPanel }
  | { type: "CLOSE_OVERLAY" }
  | { type: "TOGGLE_OVERLAY"; panel: Exclude<OverlayPanel, "none" | "slash"> }
  | { type: "SLASH_MENU_UP" }
  | { type: "SLASH_MENU_DOWN" }
  | { type: "MENU_MOVE_UP" }
  | { type: "MENU_MOVE_DOWN" }
  | { type: "MENU_PROVIDER_PREV" }
  | { type: "MENU_PROVIDER_NEXT" }
  | { type: "CONFIRM_MENU_SELECTION" }
  | { type: "SET_SERVER_ONLINE"; online: boolean }
  | { type: "SET_STREAM_CONNECTED"; connected: boolean }
  | { type: "EXPAND_TRACE_FOCUS" }
  | { type: "COLLAPSE_TRACE_FOCUS" }
  | { type: "CYCLE_COLOR_SCHEME" }
  | { type: "SET_COLOR_SCHEME"; preference: ColorSchemePreference }
  | { type: "SET_COMMAND_NOTICE"; message: string | null }
  | { type: "EVENT"; event: RelayEvent }
  | { type: "RESET" };

export const initialState: UIState = {
  messages: [],
  traces: [],
  metrics: {
    inputTokens: 0,
    outputTokens: 0,
    totalCost: 0,
    currency: "USD",
    sessionStatus: "idle",
  },
  sessionId: null,
  input: "",
  selectedProviderId: "gemini",
  selectedModel: DEFAULT_GEMINI_MODEL,
  menuProviderIndex: 0,
  menuModelIndex: 0,
  serverOnline: null,
  streamConnected: false,
  activity: null,
  seenEventIds: new Set(),
  sessionStartedAt: null,
  sessionEndedAt: null,
  expandedTraceIds: [],
  focusedTraceIndex: 0,
  activeOverlay: "none",
  slashMenuIndex: 0,
  colorSchemePreference: "auto",
  commandNotice: null,
};

function hasStreamingAssistant(messages: ChatMessage[]): boolean {
  return messages.some((m) => m.role === "assistant" && m.streaming);
}

function focusableIds(state: UIState): string[] {
  return getFocusableTraceIds(
    state.traces.map((t) => ({
      id: t.id,
      type: "tool" as const,
      label: t.toolName,
      status: t.status,
    })),
  );
}

export function uiReducer(state: UIState, action: UIAction): UIState {
  switch (action.type) {
    case "SET_SESSION": {
      if (state.sessionId === action.sessionId) return state;

      if (state.sessionId === null) {
        return {
          ...state,
          sessionId: action.sessionId,
          seenEventIds: new Set(),
        };
      }

      return {
        ...initialState,
        ...preservePreferences(state),
        sessionId: action.sessionId,
        seenEventIds: new Set(),
      };
    }
    case "SET_INPUT": {
      const input = action.input;
      let activeOverlay = state.activeOverlay;
      let slashMenuIndex = state.slashMenuIndex;

      if (shouldShowSlashPalette(input)) {
        activeOverlay = "slash";
        const filtered = filterSlashCommands(input);
        if (slashMenuIndex >= filtered.length) {
          slashMenuIndex = Math.max(0, filtered.length - 1);
        }
      } else if (activeOverlay === "slash") {
        activeOverlay = "none";
        slashMenuIndex = 0;
      }

      return {
        ...state,
        input,
        commandNotice: null,
        activeOverlay,
        slashMenuIndex,
      };
    }
    case "SET_SELECTED_MODEL":
      return { ...state, selectedProviderId: "gemini", selectedModel: action.model };
    case "SET_MODEL_SELECTION":
      return {
        ...state,
        selectedProviderId: action.providerId,
        selectedModel: action.model,
      };
    case "OPEN_OVERLAY": {
      if (action.panel === "model") {
        return openModelOverlayState(state);
      }
      return {
        ...state,
        activeOverlay: action.panel,
        input: action.panel === "slash" ? state.input : "",
        slashMenuIndex: 0,
      };
    }
    case "CLOSE_OVERLAY":
      return {
        ...state,
        activeOverlay: "none",
        slashMenuIndex: 0,
        input: state.activeOverlay === "slash" ? "" : state.input,
      };
    case "TOGGLE_OVERLAY":
      if (state.activeOverlay === action.panel) {
        return { ...state, activeOverlay: "none" };
      }
      if (action.panel === "model") {
        return openModelOverlayState(state);
      }
      return { ...state, activeOverlay: action.panel };
    case "SLASH_MENU_UP": {
      const filtered = filterSlashCommands(state.input);
      if (filtered.length === 0) return state;
      return {
        ...state,
        slashMenuIndex: (state.slashMenuIndex - 1 + filtered.length) % filtered.length,
      };
    }
    case "SLASH_MENU_DOWN": {
      const filtered = filterSlashCommands(state.input);
      if (filtered.length === 0) return state;
      return {
        ...state,
        slashMenuIndex: (state.slashMenuIndex + 1) % filtered.length,
      };
    }
    case "MENU_MOVE_UP": {
      if (state.activeOverlay !== "model") return state;
      const provider = getEnabledProviders()[state.menuProviderIndex];
      if (!provider || provider.models.length === 0) return state;
      return {
        ...state,
        menuModelIndex: Math.max(0, state.menuModelIndex - 1),
      };
    }
    case "MENU_MOVE_DOWN": {
      if (state.activeOverlay !== "model") return state;
      const provider = getEnabledProviders()[state.menuProviderIndex];
      if (!provider || provider.models.length === 0) return state;
      return {
        ...state,
        menuModelIndex: Math.min(provider.models.length - 1, state.menuModelIndex + 1),
      };
    }
    case "MENU_PROVIDER_PREV": {
      if (state.activeOverlay !== "model") return state;
      const enabled = getEnabledProviders();
      if (enabled.length <= 1) return state;
      const nextIndex = (state.menuProviderIndex - 1 + enabled.length) % enabled.length;
      const provider = enabled[nextIndex]!;
      const modelIndex = Math.max(
        0,
        provider.models.findIndex((model) => model.id === state.selectedModel),
      );
      return {
        ...state,
        menuProviderIndex: nextIndex,
        menuModelIndex: modelIndex >= 0 ? modelIndex : 0,
      };
    }
    case "MENU_PROVIDER_NEXT": {
      if (state.activeOverlay !== "model") return state;
      const enabled = getEnabledProviders();
      if (enabled.length <= 1) return state;
      const nextIndex = (state.menuProviderIndex + 1) % enabled.length;
      return {
        ...state,
        menuProviderIndex: nextIndex,
        menuModelIndex: 0,
      };
    }
    case "CONFIRM_MENU_SELECTION": {
      if (state.activeOverlay !== "model") return state;
      const provider = getEnabledProviders()[state.menuProviderIndex];
      const model = provider?.models[state.menuModelIndex];
      if (!provider || !model) {
        return { ...state, activeOverlay: "none" };
      }
      return {
        ...state,
        selectedProviderId: provider.id as ModelProviderId,
        selectedModel: model.id as GeminiModelId,
        activeOverlay: "none",
      };
    }
    case "SET_SERVER_ONLINE":
      return { ...state, serverOnline: action.online };
    case "SET_STREAM_CONNECTED":
      return { ...state, streamConnected: action.connected };
    case "EXPAND_TRACE_FOCUS": {
      const ids = focusableIds(state);
      const id = ids[state.focusedTraceIndex];
      if (!id || state.expandedTraceIds.includes(id)) return state;
      return { ...state, expandedTraceIds: [...state.expandedTraceIds, id] };
    }
    case "COLLAPSE_TRACE_FOCUS": {
      const ids = focusableIds(state);
      const id = ids[state.focusedTraceIndex];
      if (!id || !state.expandedTraceIds.includes(id)) return state;
      return { ...state, expandedTraceIds: state.expandedTraceIds.filter((x) => x !== id) };
    }
    case "CYCLE_COLOR_SCHEME": {
      const next: ColorSchemePreference =
        state.colorSchemePreference === "auto"
          ? "dark"
          : state.colorSchemePreference === "dark"
            ? "light"
            : "auto";
      return { ...state, colorSchemePreference: next };
    }
    case "SET_COLOR_SCHEME":
      return { ...state, colorSchemePreference: action.preference };
    case "SET_COMMAND_NOTICE":
      return { ...state, commandNotice: action.message };
    case "RESET":
      return { ...initialState };
    case "EVENT": {
      const event = action.event;
      if (state.seenEventIds.has(event.id)) {
        return state;
      }
      const seenEventIds = new Set(state.seenEventIds);
      seenEventIds.add(event.id);
      const base: UIState = { ...state, seenEventIds };

      switch (event.type) {
        case "message.started": {
          const payload = event.payload;
          const isUser = payload.role === "user";
          return {
            ...base,
            messages: [
              ...base.messages,
              {
                id: event.id,
                role: payload.role,
                content: payload.content,
                streaming: payload.role === "assistant",
                timestamp: event.timestamp,
              },
            ],
            sessionStartedAt:
              isUser && base.sessionStartedAt === null
                ? event.timestamp
                : base.sessionStartedAt,
            activity:
              isUser
                ? { label: "Thinking…", phase: "thinking" }
                : base.activity,
            metrics: { ...base.metrics, sessionStatus: "running" },
          };
        }
        case "token.streamed": {
          const payload = event.payload;
          const messages = [...base.messages];
          const idx = messages.findIndex((m) => m.id === payload.messageId);
          if (idx >= 0) {
            messages[idx] = {
              ...messages[idx]!,
              content: messages[idx]!.content + payload.token,
              streaming: true,
            };
          } else {
            messages.push({
              id: payload.messageId,
              role: "assistant",
              content: payload.token,
              streaming: true,
              timestamp: event.timestamp,
            });
          }
          return {
            ...base,
            messages,
            activity: { label: "Writing…", phase: "streaming" },
          };
        }
        case "message.completed": {
          const payload = event.payload;
          const messages = [...base.messages];
          const idx = messages.findIndex(
            (m) =>
              m.id === payload.messageId ||
              (m.role === "assistant" && m.streaming),
          );

          if (idx >= 0) {
            messages[idx] = {
              ...messages[idx]!,
              id: payload.messageId,
              role: "assistant",
              content: payload.content,
              streaming: false,
              timestamp: messages[idx]!.timestamp,
              completedAt: event.timestamp,
            };
          } else if (payload.content) {
            messages.push({
              id: payload.messageId,
              role: "assistant",
              content: payload.content,
              streaming: false,
              timestamp: event.timestamp,
              completedAt: event.timestamp,
            });
          }

          return {
            ...base,
            messages,
            activity: null,
          };
        }
        case "tool.started": {
          const payload = event.payload;
          return {
            ...base,
            traces: [
              ...base.traces,
              {
                id: payload.toolCallId,
                toolName: payload.toolName,
                status: "running",
                startedAt: event.timestamp,
                input: payload.input,
              },
            ],
            activity: {
              label: `Running ${payload.toolName}…`,
              phase: "tool",
            },
          };
        }
        case "tool.completed": {
          const payload = event.payload;
          const traces = base.traces.map((t) => {
            if (t.id !== payload.toolCallId) return t;
            return {
              ...t,
              status: payload.error ? ("failed" as const) : ("completed" as const),
              completedAt: event.timestamp,
              output: payload.output,
              ...(payload.error !== undefined ? { error: payload.error } : {}),
            };
          });
          const stillRunning = traces.some((t) => t.status === "running");
          return {
            ...base,
            traces,
            activity:
              stillRunning || hasStreamingAssistant(base.messages)
                ? base.activity
                : { label: "Thinking…", phase: "thinking" },
          };
        }
        case "cost.updated": {
          const payload = event.payload;
          return {
            ...base,
            metrics: {
              ...base.metrics,
              inputTokens: payload.inputTokens,
              outputTokens: payload.outputTokens,
              totalCost: payload.totalCost,
              currency: payload.currency,
              sessionStatus: "completed",
            },
            sessionEndedAt: event.timestamp,
            activity: null,
          };
        }
        case "error": {
          const payload = event.payload;
          return {
            ...base,
            messages: [
              ...base.messages,
              {
                id: event.id,
                role: "error" as const,
                content: formatErrorMessage(payload.code, payload.message),
                timestamp: event.timestamp,
              },
            ],
            sessionEndedAt: event.timestamp,
            activity: null,
            metrics: { ...base.metrics, sessionStatus: "failed" },
          };
        }
        default:
          return base;
      }
    }
    default:
      return state;
  }
}

function formatErrorMessage(code: string, message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("rate limit") || lower.includes("quota") || code === "RATE_LIMIT") {
    return `Rate limit exceeded — wait a moment and try again.\n\n${message}`;
  }
  return `${message}`;
}
