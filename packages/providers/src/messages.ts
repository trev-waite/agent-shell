import type { ModelMessage } from "ai";
import type { Message } from "./types.js";

function toolResultOutput(content: string) {
  return { type: "text" as const, value: content };
}

export function toModelMessages(messages: Message[]): ModelMessage[] {
  const result: ModelMessage[] = [];

  for (const message of messages) {
    if (message.role === "system") {
      continue;
    }

    if (message.role === "tool") {
      if (!message.toolCallId || !message.toolName) continue;
      result.push({
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: message.toolCallId,
            toolName: message.toolName,
            output: toolResultOutput(message.content),
          },
        ],
      });
      continue;
    }

    if (message.role === "assistant" && message.toolCalls?.length) {
      const parts: Array<
        | { type: "text"; text: string }
        | { type: "tool-call"; toolCallId: string; toolName: string; input: unknown }
      > = [];

      if (message.content) {
        parts.push({ type: "text", text: message.content });
      }

      for (const toolCall of message.toolCalls) {
        parts.push({
          type: "tool-call",
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          input: toolCall.input,
        });
      }

      result.push({ role: "assistant", content: parts });
      continue;
    }

    if (message.role === "user" || message.role === "assistant") {
      result.push({ role: message.role, content: message.content });
    }
  }

  return result;
}
