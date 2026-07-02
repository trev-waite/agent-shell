import type { RelayEvent } from "@relay/types";
import { DEFAULT_GEMINI_MODEL } from "@relay/types";
import { formatToolOutput } from "./lib/formatTool";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "error" | "tool";
  content: string;
  streaming?: boolean;
  /** Optimistic local echo, not yet confirmed by the event stream. */
  local?: boolean;
  timestamp: number;
  toolName?: string;
  toolStatus?: "running" | "completed" | "failed";
}

export type ActivityPhase = "idle" | "thinking" | "tool" | "streaming";

export interface Activity {
  phase: ActivityPhase;
  /** Short human phrase for inline status, e.g. "reading files". */
  label: string | null;
}

export type TurnStatus = "sending" | "running" | "complete" | "error";

export interface Turn {
  localId: string;
  sessionId: string | null;
  prompt: string;
  messages: ChatMessage[];
  activity: Activity;
  status: TurnStatus;
  seenEventIds: Set<string>;
  streamConnected: boolean;
}

export type ViewMode = "composer" | "conversation";

export interface AppState {
  turns: Turn[];
  viewMode: ViewMode;
  focusedSessionId: string | null;
  selectedModel: string;
}

export type AppAction =
  | { type: "SUBMIT_TURN"; prompt: string; localId: string }
  | { type: "TURN_SET_SESSION"; localId: string; sessionId: string }
  | { type: "TURN_SEND_FAILED"; localId: string; message: string }
  | { type: "TURN_EVENT"; sessionId: string; event: RelayEvent }
  | { type: "TURN_STREAM_CONNECTED"; sessionId: string; connected: boolean }
  | { type: "TURN_STREAM_FAILED"; sessionId: string; message: string }
  | { type: "OPEN_CONVERSATION"; sessionId: string; prompt?: string }
  | { type: "CLOSE_CONVERSATION" }
  | { type: "CONVERSATION_PROMPT"; prompt: string; localId: string }
  | { type: "CONVERSATION_SEND_FAILED"; sessionId: string; message: string }
  | { type: "SET_MODEL"; model: string };

export const initialAppState: AppState = {
  turns: [],
  viewMode: "composer",
  focusedSessionId: null,
  selectedModel: DEFAULT_GEMINI_MODEL,
};

/** Friendly, non-technical phrases for background activity. */
const TOOL_LABELS: Record<string, string> = {
  "file.read": "reading files",
  "shell.exec": "checking things",
};

function toolLabel(toolName: string): string {
  return TOOL_LABELS[toolName] ?? "working on it";
}

function formatToolInput(input: unknown): string {
  if (input === null || input === undefined) return "";
  if (typeof input === "string") return input;
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}

let localCounter = 0;
export function createLocalId(): string {
  localCounter += 1;
  return `local-${Date.now()}-${localCounter}`;
}

function createTurn(prompt: string, localId: string): Turn {
  return {
    localId,
    sessionId: null,
    prompt,
    messages: [
      {
        id: localId,
        role: "user",
        content: prompt,
        local: true,
        timestamp: Date.now(),
      },
    ],
    activity: { phase: "thinking", label: "thinking" },
    status: "sending",
    seenEventIds: new Set(),
    streamConnected: false,
  };
}

export function getTurnBySessionId(
  state: AppState,
  sessionId: string,
): Turn | undefined {
  return state.turns.find((t) => t.sessionId === sessionId);
}

export function getActivityStatusLabel(activity: Activity): string | null {
  if (activity.phase === "thinking" && activity.label) return activity.label;
  if (activity.phase === "tool" && activity.label) return activity.label;
  return null;
}

export function hasStreamingAssistant(messages: ChatMessage[]): boolean {
  return messages.some((m) => m.role === "assistant" && m.streaming);
}

export function isTurnInFlight(turn: Turn): boolean {
  return turn.status === "sending" || turn.status === "running";
}

export function getAssistantReply(turn: Turn): string | null {
  const assistant = [...turn.messages]
    .reverse()
    .find((m) => m.role === "assistant" && m.content.trim());
  if (assistant) return assistant.content;
  const error = turn.messages.find((m) => m.role === "error");
  return error?.content ?? null;
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "SUBMIT_TURN": {
      const turn = createTurn(action.prompt, action.localId);
      return {
        ...state,
        turns: [turn, ...state.turns],
      };
    }

    case "TURN_SET_SESSION": {
      return updateTurn(state, action.localId, (turn) => ({
        ...turn,
        sessionId: action.sessionId,
        status: turn.status === "sending" ? "running" : turn.status,
      }));
    }

    case "TURN_SEND_FAILED":
      return updateTurn(state, action.localId, (turn) => ({
        ...turn,
        status: "error",
        activity: { phase: "idle", label: null },
        messages: [
          ...turn.messages,
          {
            id: createLocalId(),
            role: "error",
            content: action.message,
            timestamp: Date.now(),
          },
        ],
      }));

    case "TURN_EVENT":
      return applyTurnEvent(state, action.sessionId, action.event);

    case "TURN_STREAM_CONNECTED":
      return updateTurnBySessionId(state, action.sessionId, (turn) => ({
        ...turn,
        streamConnected: action.connected,
      }));

    case "TURN_STREAM_FAILED":
      return updateTurnBySessionId(state, action.sessionId, (turn) => {
        if (turn.messages.length > 0) return turn;
        return {
          ...turn,
          status: "error",
          streamConnected: false,
          activity: { phase: "idle", label: null },
          messages: [
            {
              id: createLocalId(),
              role: "error",
              content: action.message,
              timestamp: Date.now(),
            },
          ],
        };
      });

    case "OPEN_CONVERSATION": {
      const existing = state.turns.find(
        (t) => t.sessionId === action.sessionId,
      );
      if (existing) {
        return {
          ...state,
          viewMode: "conversation",
          focusedSessionId: action.sessionId,
        };
      }
      const turn: Turn = {
        localId: createLocalId(),
        sessionId: action.sessionId,
        prompt: action.prompt ?? "",
        messages: [],
        activity: { phase: "idle", label: null },
        status: "running",
        seenEventIds: new Set(),
        streamConnected: false,
      };
      return {
        ...state,
        viewMode: "conversation",
        focusedSessionId: action.sessionId,
        turns: [turn, ...state.turns],
      };
    }

    case "CLOSE_CONVERSATION":
      return {
        ...state,
        viewMode: "composer",
        focusedSessionId: null,
      };

    case "CONVERSATION_PROMPT": {
      const sessionId = state.focusedSessionId;
      if (sessionId === null) return state;
      return updateTurnBySessionId(state, sessionId, (turn) => ({
        ...turn,
        status: "running",
        activity: { phase: "thinking", label: "thinking" },
        messages: [
          ...turn.messages,
          {
            id: action.localId,
            role: "user",
            content: action.prompt,
            local: true,
            timestamp: Date.now(),
          },
        ],
      }));
    }

    case "CONVERSATION_SEND_FAILED":
      return updateTurnBySessionId(state, action.sessionId, (turn) => ({
        ...turn,
        status: "error",
        activity: { phase: "idle", label: null },
        messages: [
          ...turn.messages,
          {
            id: createLocalId(),
            role: "error",
            content: action.message,
            timestamp: Date.now(),
          },
        ],
      }));

    case "SET_MODEL":
      return { ...state, selectedModel: action.model };

    default:
      return state;
  }
}

function updateTurn(
  state: AppState,
  localId: string,
  updater: (turn: Turn) => Turn,
): AppState {
  return {
    ...state,
    turns: state.turns.map((t) => (t.localId === localId ? updater(t) : t)),
  };
}

function updateTurnBySessionId(
  state: AppState,
  sessionId: string,
  updater: (turn: Turn) => Turn,
): AppState {
  return {
    ...state,
    turns: state.turns.map((t) =>
      t.sessionId === sessionId ? updater(t) : t,
    ),
  };
}

function applyTurnEvent(
  state: AppState,
  sessionId: string,
  event: RelayEvent,
): AppState {
  const turn = state.turns.find((t) => t.sessionId === sessionId);
  if (!turn) return state;
  if (turn.seenEventIds.has(event.id)) return state;

  const seenEventIds = new Set(turn.seenEventIds);
  seenEventIds.add(event.id);

  let nextTurn: Turn = { ...turn, seenEventIds };

  switch (event.type) {
    case "message.started": {
      const { role, content } = event.payload;

      if (role === "user") {
        const idx = nextTurn.messages.findIndex(
          (m) => m.role === "user" && m.local && m.content === content,
        );
        const messages = [...nextTurn.messages];
        if (idx >= 0) {
          messages[idx] = { ...messages[idx]!, id: event.id, local: false };
        } else {
          messages.push({
            id: event.id,
            role: "user",
            content,
            timestamp: event.timestamp,
          });
        }
        nextTurn = {
          ...nextTurn,
          messages,
          status: "running",
          activity: { phase: "thinking", label: "thinking" },
        };
        break;
      }

      nextTurn = {
        ...nextTurn,
        status: "running",
        messages: [
          ...nextTurn.messages,
          {
            id: event.id,
            role: "assistant",
            content,
            streaming: true,
            timestamp: event.timestamp,
          },
        ],
        activity: { phase: "streaming", label: null },
      };
      break;
    }

    case "token.streamed": {
      const { messageId, token } = event.payload;
      const messages = [...nextTurn.messages];
      const idx = messages.findIndex((m) => m.id === messageId);
      if (idx >= 0) {
        messages[idx] = {
          ...messages[idx]!,
          content: messages[idx]!.content + token,
          streaming: true,
        };
      } else {
        messages.push({
          id: messageId,
          role: "assistant",
          content: token,
          streaming: true,
          timestamp: event.timestamp,
        });
      }
      nextTurn = {
        ...nextTurn,
        messages,
        status: "running",
        activity: { phase: "streaming", label: null },
      };
      break;
    }

    case "message.completed": {
      const { messageId, content } = event.payload;
      const messages = [...nextTurn.messages];
      const idx = messages.findIndex(
        (m) => m.id === messageId || (m.role === "assistant" && m.streaming),
      );
      if (idx >= 0) {
        messages[idx] = {
          ...messages[idx]!,
          id: messageId,
          content,
          streaming: false,
        };
      } else if (content) {
        messages.push({
          id: messageId,
          role: "assistant",
          content,
          timestamp: event.timestamp,
        });
      }
      nextTurn = {
        ...nextTurn,
        messages,
        activity: { phase: "idle", label: null },
      };
      break;
    }

    case "tool.started": {
      const { toolCallId, toolName, input } = event.payload;
      nextTurn = {
        ...nextTurn,
        status: "running",
        activity: { phase: "tool", label: toolLabel(toolName) },
        messages: [
          ...nextTurn.messages,
          {
            id: toolCallId,
            role: "tool",
            toolName,
            toolStatus: "running",
            content: formatToolInput(input),
            timestamp: event.timestamp,
          },
        ],
      };
      break;
    }

    case "tool.completed": {
      const { toolCallId, toolName, output, error } = event.payload;
      const messages = [...nextTurn.messages];
      const idx = messages.findIndex((m) => m.id === toolCallId);
      const body = error ?? formatToolOutput(output);
      if (idx >= 0) {
        messages[idx] = {
          ...messages[idx]!,
          toolStatus: error ? "failed" : "completed",
          content: body,
        };
      } else {
        messages.push({
          id: toolCallId,
          role: "tool",
          toolName,
          toolStatus: error ? "failed" : "completed",
          content: body,
          timestamp: event.timestamp,
        });
      }
      const stillRunning = messages.some(
        (m) => m.role === "tool" && m.toolStatus === "running",
      );
      nextTurn = {
        ...nextTurn,
        messages,
        activity: stillRunning
          ? nextTurn.activity
          : { phase: "thinking", label: "thinking" },
      };
      break;
    }

    case "session.completed":
      nextTurn = {
        ...nextTurn,
        status: "complete",
        activity: { phase: "idle", label: null },
      };
      break;

    case "error": {
      const { message } = event.payload;
      nextTurn = {
        ...nextTurn,
        status: "error",
        activity: { phase: "idle", label: null },
        messages: [
          ...nextTurn.messages,
          {
            id: event.id,
            role: "error",
            content: message,
            timestamp: event.timestamp,
          },
        ],
      };
      break;
    }

    default:
      break;
  }

  return updateTurnBySessionId(state, sessionId, () => nextTurn);
}
