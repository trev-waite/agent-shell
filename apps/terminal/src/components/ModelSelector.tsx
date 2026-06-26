import { Box, Text } from "ink";
import {
  MODEL_PROVIDERS,
  getEnabledProviders,
  getProviderById,
  modelLabel,
  type GeminiModelId,
  type ModelProviderId,
} from "@relay/types";
import { useTheme } from "../hooks/ThemeContext.js";
import type { LayoutConfig } from "../theme.js";
import { OverlayPanel } from "./ui/OverlayPanel.js";

interface ModelSelectorMenuProps {
  selectedProviderId: ModelProviderId;
  selectedModel: GeminiModelId;
  menuProviderIndex: number;
  menuModelIndex: number;
  layout: LayoutConfig;
}

export function ModelSelectorMenu({
  selectedProviderId,
  selectedModel,
  menuProviderIndex,
  menuModelIndex,
  layout,
}: ModelSelectorMenuProps) {
  const theme = useTheme();
  const enabledProviders = getEnabledProviders();
  const activeProvider =
    enabledProviders[menuProviderIndex] ??
    getProviderById(selectedProviderId) ??
    enabledProviders[0]!;

  return (
    <OverlayPanel title="MODEL" width={layout.columns}>
      <Box marginBottom={1}>
        {MODEL_PROVIDERS.map((provider) => {
          const enabledIndex = enabledProviders.findIndex((p) => p.id === provider.id);
          const isActiveTab =
            provider.enabled && enabledIndex === menuProviderIndex;

          return (
            <Box key={provider.id} marginRight={2}>
              <Text
                bold={isActiveTab}
                {...(isActiveTab ? { color: theme.motion } : {})}
                dimColor={!provider.enabled}
              >
                {provider.enabled ? (isActiveTab ? "▸ " : "  ") : "  "}
                {provider.label}
                {!provider.enabled ? " (soon)" : ""}
              </Text>
            </Box>
          );
        })}
      </Box>

      <Box flexDirection="column" borderStyle="single" borderColor={theme.border} paddingX={1}>
        {activeProvider.models.length === 0 ? (
          <Text dimColor>No models available</Text>
        ) : (
          activeProvider.models.map((model, index) => {
            const isHighlighted = index === menuModelIndex;
            const isCurrent = model.id === selectedModel;

            return (
              <Text key={model.id} {...(isHighlighted ? { inverse: true } : {})}>
                {isHighlighted ? "› " : "  "}
                <Text color={isHighlighted ? theme.motion : theme.text}>{model.label}</Text>
                {isCurrent && !isHighlighted && (
                  <Text color={theme.status}> ✓</Text>
                )}
              </Text>
            );
          })
        )}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          Current: {modelLabel(selectedProviderId, selectedModel)} · ↑↓ model · ←→ provider · Enter select
        </Text>
      </Box>
    </OverlayPanel>
  );
}
