export const GEMINI_MODELS = [
  { id: "gemini-3.1-flash-lite", label: "3.1 Flash Lite" },
  { id: "gemini-3.5-flash", label: "3.5 Flash" },
  { id: "gemini-3.1-flash", label: "3.1 Flash" },
  { id: "gemini-2.5-flash", label: "2.5 Flash" },
  { id: "gemini-2.5-flash-lite", label: "2.5 Flash Lite" },
  { id: "gemini-2.5-pro", label: "2.5 Pro" },
] as const;

export type GeminiModelId = (typeof GEMINI_MODELS)[number]["id"];

export const DEFAULT_GEMINI_MODEL: GeminiModelId = "gemini-3.1-flash-lite";

export interface ModelOption {
  readonly id: string;
  readonly label: string;
}

export interface ModelProvider {
  readonly id: string;
  readonly label: string;
  readonly enabled: boolean;
  readonly models: readonly ModelOption[];
  readonly defaultModel: string;
}

/** Registry of LLM providers — add entries here as new adapters ship. */
export const MODEL_PROVIDERS: readonly ModelProvider[] = [
  {
    id: "gemini",
    label: "Gemini",
    enabled: true,
    models: GEMINI_MODELS,
    defaultModel: DEFAULT_GEMINI_MODEL,
  },
  {
    id: "openai",
    label: "OpenAI",
    enabled: false,
    models: [],
    defaultModel: "",
  },
  {
    id: "anthropic",
    label: "Claude",
    enabled: false,
    models: [],
    defaultModel: "",
  },
] as const;

export type ModelProviderId = (typeof MODEL_PROVIDERS)[number]["id"];

export function getEnabledProviders(): ModelProvider[] {
  return MODEL_PROVIDERS.filter((provider) => provider.enabled);
}

export function getProviderById(id: string): ModelProvider | undefined {
  return MODEL_PROVIDERS.find((provider) => provider.id === id);
}

export function isGeminiModelId(value: string): value is GeminiModelId {
  return GEMINI_MODELS.some((model) => model.id === value);
}

export function modelLabel(providerId: string, modelId: string): string {
  const provider = getProviderById(providerId);
  return provider?.models.find((model) => model.id === modelId)?.label ?? modelId;
}

export function geminiModelLabel(id: string): string {
  return modelLabel("gemini", id);
}

export function providerModelsResponse() {
  return MODEL_PROVIDERS.map((provider) => ({
    id: provider.id,
    label: provider.label,
    enabled: provider.enabled,
    default: provider.enabled ? provider.defaultModel : undefined,
    models: provider.enabled ? provider.models : [],
  }));
}
