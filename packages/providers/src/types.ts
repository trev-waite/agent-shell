export interface Message {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolCallId?: string;
  toolName?: string;
  toolCalls?: ToolCallRequest[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export type ReasoningLevel =
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "none"
  | "provider-default";

export interface LlmCallPerformance {
  responseTimeMs?: number;
  timeToFirstOutputMs?: number;
  outputTokensPerSecond?: number;
}

export interface StreamOptions {
  messages: Message[];
  tools?: ToolDefinition[];
  activeTools?: string[];
  systemPrompt?: string;
  model?: string;
  reasoning?: ReasoningLevel;
  onToken?: (token: string) => void;
  signal?: AbortSignal;
}

export interface StreamResult {
  text: string;
  toolCalls: ToolCallRequest[];
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
  performance?: LlmCallPerformance;
}

export interface ToolCallRequest {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface CompleteOptions {
  messages: Message[];
  systemPrompt?: string;
  signal?: AbortSignal;
}

export interface LLMProvider {
  stream(opts: StreamOptions): Promise<StreamResult>;
  complete(opts: CompleteOptions): Promise<string>;
  embed(text: string): Promise<number[]>;
}
