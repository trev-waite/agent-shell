import { Box, Text } from "ink";
import { modelLabel } from "@relay/types";
import type { GeminiModelId, ModelProviderId } from "@relay/types";
import { useTheme } from "../hooks/ThemeContext.js";
import type { LayoutConfig } from "../theme.js";

interface InputBoxProps {
  value: string;
  layout: LayoutConfig;
  selectedProviderId: ModelProviderId;
  selectedModel: GeminiModelId;
  notice?: string | null;
}

export function InputBox({
  value,
  layout,
  selectedProviderId,
  selectedModel,
  notice,
}: InputBoxProps) {
  const theme = useTheme();
  const showSendHint = layout.columns >= 60;
  const modelName = modelLabel(selectedProviderId, selectedModel);

  return (
    <Box flexDirection="column" width={layout.columns}>
      {notice && (
        <Box marginBottom={1} paddingX={1}>
          <Text dimColor color={theme.motion}>
            {notice}
          </Text>
        </Box>
      )}
      <Box
        borderStyle="single"
        borderColor={theme.border}
        paddingX={1}
        justifyContent="space-between"
      >
        <Box flexGrow={1}>
          <Text color={theme.motion}>❯ </Text>
          {value.length === 0 ? (
            <Text dimColor>Type your message…</Text>
          ) : (
            <Text color={theme.text}>{value}</Text>
          )}
          <Text dimColor>_</Text>
        </Box>
        <Box>
          {showSendHint && (
            <>
              <Text dimColor>{modelName} · </Text>
              <Text color={theme.motion}>→</Text>
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
}
