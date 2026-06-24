import { Box, Text } from "ink";
import {
  MODEL_PROVIDERS,
  getEnabledProviders,
  getProviderById,
  modelLabel,
  type ModelProviderId,
} from "@relay/types";

interface ModelSelectorProps {
  selectedProviderId: ModelProviderId;
  selectedModel: string;
  menuOpen: boolean;
  menuProviderIndex: number;
  menuModelIndex: number;
}

export function ModelSelector({
  selectedProviderId,
  selectedModel,
  menuOpen,
  menuProviderIndex,
  menuModelIndex,
}: ModelSelectorProps) {
  const enabledProviders = getEnabledProviders();
  const activeProvider =
    menuOpen && enabledProviders[menuProviderIndex]
      ? enabledProviders[menuProviderIndex]!
      : getProviderById(selectedProviderId) ?? enabledProviders[0]!;

  const collapsedLabel = modelLabel(selectedProviderId, selectedModel);

  return (
    <Box flexDirection="column" marginTop={1} borderStyle="single" borderColor="gray">
      <Box paddingX={1} paddingY={0}>
        <Text dimColor>Model </Text>
        {!menuOpen && (
          <Text>
            <Text bold color="blue">
              {getProviderById(selectedProviderId)?.label ?? "Gemini"}
            </Text>
            <Text dimColor> ▾ </Text>
            <Text color="cyan">{collapsedLabel}</Text>
          </Text>
        )}
      </Box>

      {menuOpen && (
        <Box flexDirection="column" paddingX={1} paddingBottom={1}>
          <Box marginBottom={1}>
            {MODEL_PROVIDERS.map((provider) => {
              const enabledIndex = enabledProviders.findIndex((p) => p.id === provider.id);
              const isActiveTab =
                provider.enabled && enabledIndex === menuProviderIndex;
              const isSelectedProvider = provider.id === selectedProviderId && !menuOpen;

              return (
                <Box key={provider.id} marginRight={2}>
                  <Text
                    bold={isActiveTab || isSelectedProvider}
                    {...(isActiveTab ? { color: "blue" as const, underline: true } : {})}
                    {...(!provider.enabled ? { dimColor: true } : {})}
                  >
                    {provider.enabled ? (isActiveTab ? "▸ " : "  ") : "  "}
                    {provider.label}
                    {!provider.enabled ? " (soon)" : ""}
                  </Text>
                </Box>
              );
            })}
          </Box>

          <Box flexDirection="column" borderStyle="round" borderColor="blue" paddingX={1}>
            {activeProvider.models.length === 0 ? (
              <Text dimColor>No models available</Text>
            ) : (
              activeProvider.models.map((model, index) => {
                const isHighlighted = index === menuModelIndex;
                const isCurrent = model.id === selectedModel;

                return (
                  <Text key={model.id} {...(isHighlighted ? { inverse: true } : {})}>
                    {isHighlighted ? "› " : "  "}
                    {model.label}
                    {isCurrent && !isHighlighted ? " ✓" : ""}
                  </Text>
                );
              })
            )}
          </Box>

          <Box marginTop={1}>
            <Text dimColor>↑↓ model · ←→ provider · Enter select · Esc close</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
