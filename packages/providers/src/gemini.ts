import { createGoogle } from "@ai-sdk/google";
import { generateText, embed, streamText, tool } from "ai";
import { z } from "zod";
import { DEFAULT_GEMINI_MODEL } from "@relay/types";
import { toModelMessages } from "./messages.js";
import type {
  LLMProvider,
  StreamOptions,
  CompleteOptions,
  StreamResult,
  ToolDefinition,
  ReasoningLevel,
} from "./types.js";

const DEFAULT_MODEL = DEFAULT_GEMINI_MODEL;
const EMBED_MODEL = "text-embedding-004";

const toolsCache = new Map<string, NonNullable<ReturnType<typeof buildTools>>>();

export interface GeminiProviderOptions {
  apiKey: string;
  model?: string;
  reasoning?: ReasoningLevel;
}

export function createGeminiProvider(opts: GeminiProviderOptions): LLMProvider {
  const google = createGoogle({ apiKey: opts.apiKey });
  const modelId = opts.model ?? DEFAULT_MODEL;
  const defaultReasoning = opts.reasoning;

  return {
    async stream(options: StreamOptions): Promise<StreamResult> {
      const tools = getCachedTools(options.tools);
      const activeModel = options.model ?? modelId;

      const result = streamText({
        model: google(activeModel),
        messages: toModelMessages(options.messages),
        ...optionalStreamFields(options, tools, defaultReasoning),
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
      const step = await finishResult.finalStep;
      const perf = step.performance;

      const performance: StreamResult["performance"] = {
        responseTimeMs: perf.responseTimeMs,
      };
      if (perf.timeToFirstOutputMs !== undefined) {
        performance.timeToFirstOutputMs = perf.timeToFirstOutputMs;
      }
      if (perf.outputTokensPerSecond !== undefined) {
        performance.outputTokensPerSecond = perf.outputTokensPerSecond;
      }

      return {
        text,
        toolCalls,
        inputTokens: usage?.inputTokens ?? 0,
        outputTokens: usage?.outputTokens ?? 0,
        ...(usage?.inputTokenDetails?.cacheReadTokens !== undefined
          ? { cachedInputTokens: usage.inputTokenDetails.cacheReadTokens }
          : {}),
        ...(usage?.outputTokenDetails?.reasoningTokens !== undefined
          ? { reasoningTokens: usage.outputTokenDetails.reasoningTokens }
          : {}),
        performance,
      };
    },

    async complete(options: CompleteOptions): Promise<string> {
      const result = await generateText({
        model: google(modelId),
        messages: toModelMessages(options.messages),
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

function toolsFingerprint(definitions: ToolDefinition[]): string {
  return definitions
    .map((def) => `${def.name}:${def.description}:${JSON.stringify(def.parameters)}`)
    .join("|");
}

function getCachedTools(definitions?: ToolDefinition[]) {
  if (!definitions || definitions.length === 0) return undefined;

  const key = toolsFingerprint(definitions);
  const cached = toolsCache.get(key);
  if (cached) return cached;

  const built = buildTools(definitions);
  if (built) toolsCache.set(key, built);
  return built;
}

function buildTools(definitions: ToolDefinition[]) {
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
  tools: ReturnType<typeof getCachedTools>,
  defaultReasoning?: ReasoningLevel,
) {
  const reasoning = options.reasoning ?? defaultReasoning;
  const activeTools =
    options.activeTools ?? options.tools?.map((toolDef) => toolDef.name);

  return {
    ...(options.systemPrompt !== undefined ? { instructions: options.systemPrompt } : {}),
    ...(tools !== undefined ? { tools } : {}),
    ...(tools !== undefined && activeTools !== undefined && activeTools.length > 0
      ? { activeTools }
      : {}),
    ...(reasoning !== undefined ? { reasoning } : {}),
    ...(options.signal !== undefined ? { abortSignal: options.signal } : {}),
  };
}

function optionalCompleteFields(options: CompleteOptions) {
  return {
    ...(options.systemPrompt !== undefined ? { instructions: options.systemPrompt } : {}),
    ...(options.signal !== undefined ? { abortSignal: options.signal } : {}),
  };
}
