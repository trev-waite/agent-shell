import type { RelayEvent } from "@relay/types";
import type { GeminiModelId, ModelProviderId } from "@relay/types";
import {
  DEFAULT_GEMINI_MODEL,
  getEnabledProviders,
} from "@relay/types";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "error";
  content: string;
  streaming?: boolean;
}

export interface ToolTrace {
  id: string;
  toolName: string;
  status: "running" | "completed" | "failed";
  startedAt: number;
  completedAt?: number;
  error?: string;
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

export interface UIState {
  messages: ChatMessage[];
  traces: ToolTrace[];
  metrics: Metrics;
  sessionId: string | null;
  input: string;
  selectedProviderId: ModelProviderId;
  selectedModel: GeminiModelId;
  modelMenuOpen: boolean;
  menuProviderIndex: number;
  menuModelIndex: number;
  serverOnline: boolean | null;
  streamConnected: boolean;
  activity: ActivityStatus | null;
  /** Event ids already applied — prevents duplicate delivery across replay + SSE. */
  seenEventIds: string[];
}

export type UIAction =
  | { type: "SET_SESSION"; sessionId: string }
  | { type: "SET_INPUT"; input: string }
  | { type: "SET_SELECTED_MODEL"; model: GeminiModelId }
  | { type: "SET_MODEL_SELECTION"; providerId: ModelProviderId; model: GeminiModelId }
  | { type: "TOGGLE_MODEL_MENU" }
  | { type: "CLOSE_MODEL_MENU" }
  | { type: "MENU_MOVE_UP" }
  | { type: "MENU_MOVE_DOWN" }
  | { type: "MENU_PROVIDER_PREV" }
  | { type: "MENU_PROVIDER_NEXT" }
  | { type: "CONFIRM_MENU_SELECTION" }
  | { type: "SET_SERVER_ONLINE"; online: boolean }
  | { type: "SET_STREAM_CONNECTED"; connected: boolean }
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
  modelMenuOpen: false,
  menuProviderIndex: 0,
  menuModelIndex: 0,
  serverOnline: null,
  streamConnected: false,
  activity: null,
  seenEventIds: [],
};

function hasStreamingAssistant(messages: ChatMessage[]): boolean {
  return messages.some((m) => m.role === "assistant" && m.streaming);
}

export function uiReducer(state: UIState, action: UIAction): UIState {
  switch (action.type) {
    case "SET_SESSION":
      return { ...state, sessionId: action.sessionId, seenEventIds: [] };
    case "SET_INPUT":
      return { ...state, input: action.input };
    case "SET_SELECTED_MODEL":
      return { ...state, selectedProviderId: "gemini", selectedModel: action.model };
    case "SET_MODEL_SELECTION":
      return {
        ...state,
        selectedProviderId: action.providerId,
        selectedModel: action.model,
      };
    case "TOGGLE_MODEL_MENU": {
      if (state.modelMenuOpen) {
        return { ...state, modelMenuOpen: false };
      }
      const enabled = getEnabledProviders();
      const providerIndex = Math.max(
        0,
        enabled.findIndex((provider) => provider.id === state.selectedProviderId),
      );
      const provider = enabled[providerIndex] ?? enabled[0];
      const modelIndex = Math.max(
        0,
        provider?.models.findIndex((model) => model.id === state.selectedModel) ?? 0,
      );
      return {
        ...state,
        modelMenuOpen: true,
        menuProviderIndex: providerIndex,
        menuModelIndex: modelIndex,
      };
    }
    case "CLOSE_MODEL_MENU":
      return { ...state, modelMenuOpen: false };
    case "MENU_MOVE_UP": {
      if (!state.modelMenuOpen) return state;
      const provider = getEnabledProviders()[state.menuProviderIndex];
      if (!provider || provider.models.length === 0) return state;
      return {
        ...state,
        menuModelIndex: Math.max(0, state.menuModelIndex - 1),
      };
    }
    case "MENU_MOVE_DOWN": {
      if (!state.modelMenuOpen) return state;
      const provider = getEnabledProviders()[state.menuProviderIndex];
      if (!provider || provider.models.length === 0) return state;
      return {
        ...state,
        menuModelIndex: Math.min(provider.models.length - 1, state.menuModelIndex + 1),
      };
    }
    case "MENU_PROVIDER_PREV": {
      if (!state.modelMenuOpen) return state;
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
      if (!state.modelMenuOpen) return state;
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
      if (!state.modelMenuOpen) return state;
      const provider = getEnabledProviders()[state.menuProviderIndex];
      const model = provider?.models[state.menuModelIndex];
      if (!provider || !model) {
        return { ...state, modelMenuOpen: false };
      }
      return {
        ...state,
        selectedProviderId: provider.id as ModelProviderId,
        selectedModel: model.id as GeminiModelId,
        modelMenuOpen: false,
      };
    }
    case "SET_SERVER_ONLINE":
      return { ...state, serverOnline: action.online };
    case "SET_STREAM_CONNECTED":
      return { ...state, streamConnected: action.connected };
    case "RESET":
      return { ...initialState };
    case "EVENT": {
      const event = action.event;
      if (state.seenEventIds.includes(event.id)) {
        return state;
      }
      const base: UIState = { ...state, seenEventIds: [...state.seenEventIds, event.id] };

      switch (event.type) {
        case "message.started": {
          const payload = event.payload;
          return {
            ...base,
            messages: [
              ...base.messages,
              {
                id: event.id,
                role: payload.role,
                content: payload.content,
                streaming: payload.role === "assistant",
              },
            ],
            activity:
              payload.role === "user"
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
              id: payload.messageId,
              role: "assistant",
              content: payload.content,
              streaming: false,
            };
          } else if (payload.content) {
            messages.push({
              id: payload.messageId,
              role: "assistant",
              content: payload.content,
              streaming: false,
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
              },
            ],
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
