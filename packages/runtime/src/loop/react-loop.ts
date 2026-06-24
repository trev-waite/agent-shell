import { ulid } from "ulid";
import type { ExecutionLoop, EventHandler } from "@relay/types";
import type { LLMProvider, Message } from "@relay/providers";
import type { ToolRegistry } from "@relay/tool-registry";
import { sanitize, sanitizeObject } from "../sanitize.js";

const MAX_ITERATIONS = 10;

export interface ReActLoopOptions {
  sessionId: string;
  prompt: string;
  provider: LLMProvider;
  toolRegistry: ToolRegistry;
  emit: EventHandler;
  model?: string;
  signal?: AbortSignal;
}

export class ReActLoop implements ExecutionLoop {
  private readonly opts: ReActLoopOptions;
  private abortController: AbortController;
  private messages: Message[] = [];
  private cancelled = false;

  constructor(opts: ReActLoopOptions) {
    this.opts = opts;
    this.abortController = new AbortController();
    if (opts.signal) {
      opts.signal.addEventListener("abort", () => this.cancel());
    }
  }

  async run(): Promise<void> {
    const { sessionId, prompt, provider, toolRegistry, emit } = this.opts;

    this.messages.push({ role: "user", content: sanitize(prompt) });

    emit({
      id: ulid(),
      sessionId,
      type: "message.started",
      timestamp: Date.now(),
      payload: { role: "user", content: sanitize(prompt) },
    });

    let iterations = 0;

    while (iterations < MAX_ITERATIONS && !this.cancelled) {
      if (this.abortController.signal.aborted) break;
      iterations++;

      const assistantMessageId = ulid();
      let assistantContent = "";

      const toolDefs = toolRegistry.list();

      try {
        const result = await this.reason(provider, toolDefs, (token) => {
          assistantContent += token;
          emit({
            id: ulid(),
            sessionId,
            type: "token.streamed",
            timestamp: Date.now(),
            payload: { token, messageId: assistantMessageId },
          });
        });

        assistantContent = result.text || assistantContent;

        if (result.toolCalls.length === 0) {
          this.messages.push({ role: "assistant", content: sanitize(assistantContent) });

          emit({
            id: ulid(),
            sessionId,
            type: "message.completed",
            timestamp: Date.now(),
            payload: {
              messageId: assistantMessageId,
              role: "assistant",
              content: sanitize(assistantContent),
            },
          });

          emit({
            id: ulid(),
            sessionId,
            type: "cost.updated",
            timestamp: Date.now(),
            payload: {
              inputTokens: result.inputTokens,
              outputTokens: result.outputTokens,
              totalCost: estimateCost(result.inputTokens, result.outputTokens),
              currency: "USD",
            },
          });

          return;
        }

        this.messages.push({
          role: "assistant",
          content: sanitize(assistantContent),
          toolCalls: result.toolCalls,
        });

        if (assistantContent) {
          emit({
            id: ulid(),
            sessionId,
            type: "message.completed",
            timestamp: Date.now(),
            payload: {
              messageId: assistantMessageId,
              role: "assistant",
              content: sanitize(assistantContent),
            },
          });
        }

        for (const toolCall of result.toolCalls) {
          await this.act(toolCall, toolRegistry, emit, assistantMessageId);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        emit({
          id: ulid(),
          sessionId,
          type: "error",
          timestamp: Date.now(),
          payload: { code: "EXECUTION_ERROR", message: sanitize(message), recoverable: false },
        });
        return;
      }
    }

    if (iterations >= MAX_ITERATIONS) {
      emit({
        id: ulid(),
        sessionId,
        type: "error",
        timestamp: Date.now(),
        payload: {
          code: "MAX_ITERATIONS",
          message: "Maximum tool loop iterations reached",
          recoverable: false,
        },
      });
    }
  }

  private async observe(): Promise<Message[]> {
    return this.messages;
  }

  private async reason(
    provider: LLMProvider,
    tools: ReturnType<ToolRegistry["list"]>,
    onToken: (token: string) => void,
  ) {
    const messages = await this.observe();
    return provider.stream({
      messages,
      tools,
      systemPrompt: SYSTEM_PROMPT,
      onToken,
      ...(this.opts.model !== undefined ? { model: this.opts.model } : {}),
      signal: this.abortController.signal,
    });
  }

  private async act(
    toolCall: { id: string; name: string; input: Record<string, unknown> },
    toolRegistry: ToolRegistry,
    emit: EventHandler,
    _messageId: string,
  ): Promise<void> {
    const { sessionId } = this.opts;
    const sanitizedInput = sanitizeObject(toolCall.input);

    emit({
      id: ulid(),
      sessionId,
      type: "tool.started",
      timestamp: Date.now(),
      payload: {
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        input: sanitizedInput,
      },
    });

    const registered = toolRegistry.resolve(toolCall.name);
    if (!registered) {
      const error = `Unknown tool: ${toolCall.name}`;
      emit({
        id: ulid(),
        sessionId,
        type: "tool.completed",
        timestamp: Date.now(),
        payload: {
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          output: null,
          error: sanitize(error),
        },
      });
      this.messages.push({
        role: "tool",
        content: sanitize(error),
        toolCallId: toolCall.id,
        toolName: toolCall.name,
      });
      return;
    }

    const validation = toolRegistry.validate(toolCall.name, toolCall.input);
    if (!validation.success) {
      emit({
        id: ulid(),
        sessionId,
        type: "tool.completed",
        timestamp: Date.now(),
        payload: {
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          output: null,
          error: sanitize(validation.error),
        },
      });
      this.messages.push({
        role: "tool",
        content: sanitize(validation.error),
        toolCallId: toolCall.id,
        toolName: toolCall.name,
      });
      return;
    }

    try {
      const output = await registered.handler(validation.data);
      const sanitizedOutput = sanitizeObject(output);

      emit({
        id: ulid(),
        sessionId,
        type: "tool.completed",
        timestamp: Date.now(),
        payload: {
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          output: sanitizedOutput,
        },
      });

      this.messages.push({
        role: "tool",
        content: typeof sanitizedOutput === "string"
          ? sanitizedOutput
          : JSON.stringify(sanitizedOutput),
        toolCallId: toolCall.id,
        toolName: toolCall.name,
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      emit({
        id: ulid(),
        sessionId,
        type: "tool.completed",
        timestamp: Date.now(),
        payload: {
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          output: null,
          error: sanitize(error),
        },
      });
      this.messages.push({
        role: "tool",
        content: sanitize(error),
        toolCallId: toolCall.id,
        toolName: toolCall.name,
      });
    }
  }

  cancel(): void {
    this.cancelled = true;
    this.abortController.abort();
  }

  resume(): void {
    throw new Error("resume() is not implemented in MVP");
  }
}

const SYSTEM_PROMPT = `You are a helpful AI assistant running locally via Relay.
You have access to tools for reading files and executing read-only shell commands (pwd, ls, cat).
Use tools when needed to answer questions about the local environment.
Never request or expose secrets, API keys, or environment variables.

Output format: prefer plain text for the terminal UI. You may use light formatting that renders well in a terminal:
- **bold** or __bold__ for emphasis
- \`inline code\` for paths, commands, and identifiers
- "-" or "1." list lines for bullets and numbered lists
Avoid # headings, tables, links, and fenced code blocks; use short paragraphs and indentation instead.
Keep lines reasonably short (~80 characters) when listing files or code.`;

function estimateCost(inputTokens: number, outputTokens: number): number {
  const inputCost = (inputTokens / 1_000_000) * 0.1;
  const outputCost = (outputTokens / 1_000_000) * 0.4;
  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000;
}
