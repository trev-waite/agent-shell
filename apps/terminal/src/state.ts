import type { RelayEvent } from "@relay/types";

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
  serverOnline: boolean | null;
  streamConnected: boolean;
}

export type UIAction =
  | { type: "SET_SESSION"; sessionId: string }
  | { type: "SET_INPUT"; input: string }
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
  serverOnline: null,
  streamConnected: false,
};

export function uiReducer(state: UIState, action: UIAction): UIState {
  switch (action.type) {
    case "SET_SESSION":
      return { ...state, sessionId: action.sessionId };
    case "SET_INPUT":
      return { ...state, input: action.input };
    case "SET_SERVER_ONLINE":
      return { ...state, serverOnline: action.online };
    case "SET_STREAM_CONNECTED":
      return { ...state, streamConnected: action.connected };
    case "RESET":
      return { ...initialState };
    case "EVENT": {
      const event = action.event;
      switch (event.type) {
        case "message.started": {
          const payload = event.payload;
          return {
            ...state,
            messages: [
              ...state.messages,
              {
                id: event.id,
                role: payload.role,
                content: payload.content,
                streaming: payload.role === "assistant",
              },
            ],
            metrics: { ...state.metrics, sessionStatus: "running" },
          };
        }
        case "token.streamed": {
          const payload = event.payload;
          const messages = [...state.messages];
          const idx = messages.findIndex(
            (m) => m.id === payload.messageId || m.streaming,
          );
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
          return { ...state, messages };
        }
        case "message.completed": {
          const payload = event.payload;
          const messages = state.messages.map((m) =>
            m.streaming || m.id === payload.messageId
              ? { ...m, content: payload.content, streaming: false }
              : m,
          );
          return {
            ...state,
            messages,
            metrics: { ...state.metrics, sessionStatus: "completed" },
          };
        }
        case "tool.started": {
          const payload = event.payload;
          return {
            ...state,
            traces: [
              ...state.traces,
              {
                id: payload.toolCallId,
                toolName: payload.toolName,
                status: "running",
                startedAt: event.timestamp,
              },
            ],
          };
        }
        case "tool.completed": {
          const payload = event.payload;
          return {
            ...state,
            traces: state.traces.map((t) => {
              if (t.id !== payload.toolCallId) return t;
              return {
                ...t,
                status: payload.error ? ("failed" as const) : ("completed" as const),
                completedAt: event.timestamp,
                ...(payload.error !== undefined ? { error: payload.error } : {}),
              };
            }),
          };
        }
        case "cost.updated": {
          const payload = event.payload;
          return {
            ...state,
            metrics: {
              ...state.metrics,
              inputTokens: payload.inputTokens,
              outputTokens: payload.outputTokens,
              totalCost: payload.totalCost,
              currency: payload.currency,
            },
          };
        }
        case "error": {
          const payload = event.payload;
          return {
            ...state,
            messages: [
              ...state.messages,
              {
                id: event.id,
                role: "error" as const,
                content: formatErrorMessage(payload.code, payload.message),
              },
            ],
            metrics: { ...state.metrics, sessionStatus: "failed" },
          };
        }
        default:
          return state;
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
