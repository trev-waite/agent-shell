import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, embed, streamText, tool } from "ai";
import { z } from "zod";
import type {
  LLMProvider,
  StreamOptions,
  CompleteOptions,
  StreamResult,
  ToolDefinition,
} from "./types.js";

const DEFAULT_MODEL = "gemini-3.1-flash-lite";
const EMBED_MODEL = "text-embedding-004";

export interface GeminiProviderOptions {
  apiKey: string;
  model?: string;
}

export function createGeminiProvider(opts: GeminiProviderOptions): LLMProvider {
  const google = createGoogleGenerativeAI({ apiKey: opts.apiKey });
  const modelId = opts.model ?? DEFAULT_MODEL;

  return {
    async stream(options: StreamOptions): Promise<StreamResult> {
      const tools = buildTools(options.tools);

      const result = streamText({
        model: google(modelId),
        messages: options.messages.map((m) => ({
          role: m.role === "tool" ? "assistant" : m.role,
          content: m.content,
        })),
        ...optionalStreamFields(options, tools),
      });

      let text = "";
      const toolCalls: StreamResult["toolCalls"] = [];

      for await (const chunk of result.textStream) {
        text += chunk;
        options.onToken?.(chunk);
      }

      const finishResult = await result;
      const calls = await finishResult.toolCalls;

      for (const call of calls) {
        toolCalls.push({
          id: call.toolCallId,
          name: call.toolName,
          input: call.input as Record<string, unknown>,
        });
      }

      const usage = await finishResult.usage;

      return {
        text,
        toolCalls,
        inputTokens: usage?.inputTokens ?? 0,
        outputTokens: usage?.outputTokens ?? 0,
      };
    },

    async complete(options: CompleteOptions): Promise<string> {
      const result = await generateText({
        model: google(modelId),
        messages: options.messages.map((m) => ({
          role: m.role === "tool" ? "assistant" : m.role,
          content: m.content,
        })),
        ...optionalCompleteFields(options),
      });
      return result.text;
    },

    async embed(text: string): Promise<number[]> {
      const result = await embed({
        model: google.textEmbeddingModel(EMBED_MODEL),
        value: text,
      });
      return result.embedding;
    },
  };
}

function buildTools(definitions?: ToolDefinition[]) {
  if (!definitions || definitions.length === 0) return undefined;

  const tools: Record<string, unknown> = {};

  for (const def of definitions) {
    const params = def.parameters as {
      properties?: Record<string, { type?: string; description?: string }>;
      required?: string[];
    };

    const shape: Record<string, z.ZodType> = {};

    if (params.properties) {
      for (const [key, prop] of Object.entries(params.properties)) {
        if (prop.type === "array") {
          shape[key] = z.array(z.string()).optional();
        } else {
          shape[key] = z.string();
        }
      }
    }

    const inputSchema =
      Object.keys(shape).length > 0
        ? z.object(shape)
        : z.object({}).catchall(z.unknown());

    tools[def.name] = tool({
      description: def.description,
      inputSchema,
    });
  }

  return tools as NonNullable<Parameters<typeof streamText>[0]["tools"]>;
}

function optionalStreamFields(
  options: StreamOptions,
  tools: ReturnType<typeof buildTools>,
) {
  return {
    ...(options.systemPrompt !== undefined ? { system: options.systemPrompt } : {}),
    ...(tools !== undefined ? { tools } : {}),
    ...(options.signal !== undefined ? { abortSignal: options.signal } : {}),
  };
}

function optionalCompleteFields(options: CompleteOptions) {
  return {
    ...(options.systemPrompt !== undefined ? { system: options.systemPrompt } : {}),
    ...(options.signal !== undefined ? { abortSignal: options.signal } : {}),
  };
}
