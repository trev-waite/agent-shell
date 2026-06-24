export type EventType =
  | "message.started"
  | "token.streamed"
  | "tool.started"
  | "tool.completed"
  | "checkpoint.saved"
  | "cost.updated"
  | "message.completed"
  | "error";

export interface RelayEventBase {
  id: string;
  sessionId: string;
  type: EventType;
  timestamp: number;
}

export interface MessageStartedPayload {
  role: "user" | "assistant";
  content: string;
}

export interface TokenStreamedPayload {
  token: string;
  messageId: string;
}

export interface ToolStartedPayload {
  toolCallId: string;
  toolName: string;
  input: unknown;
}

export interface ToolCompletedPayload {
  toolCallId: string;
  toolName: string;
  output: unknown;
  error?: string;
}

export interface CheckpointSavedPayload {
  checkpointId: string;
  label?: string;
  data: unknown;
}

export interface CostUpdatedPayload {
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
  currency: string;
}

export interface MessageCompletedPayload {
  messageId: string;
  role: "assistant";
  content: string;
}

export interface ErrorPayload {
  code: string;
  message: string;
  recoverable?: boolean;
}

export type RelayEvent =
  | (RelayEventBase & { type: "message.started"; payload: MessageStartedPayload })
  | (RelayEventBase & { type: "token.streamed"; payload: TokenStreamedPayload })
  | (RelayEventBase & { type: "tool.started"; payload: ToolStartedPayload })
  | (RelayEventBase & { type: "tool.completed"; payload: ToolCompletedPayload })
  | (RelayEventBase & { type: "checkpoint.saved"; payload: CheckpointSavedPayload })
  | (RelayEventBase & { type: "cost.updated"; payload: CostUpdatedPayload })
  | (RelayEventBase & { type: "message.completed"; payload: MessageCompletedPayload })
  | (RelayEventBase & { type: "error"; payload: ErrorPayload });

export type SessionStatus =
  | "idle"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export interface Session {
  id: string;
  prompt: string;
  createdAt: number;
}

export type EventHandler = (event: RelayEvent) => void;

export interface ExecutionLoop {
  run(): Promise<void>;
  cancel(): void;
  resume(): void;
}

export class NotImplementedError extends Error {
  constructor(feature: string) {
    super(`${feature} is not implemented`);
    this.name = "NotImplementedError";
  }
}
