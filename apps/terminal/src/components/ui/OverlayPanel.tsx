import type { ReactNode } from "react";
import { Box, Text } from "ink";
import { useTheme } from "../../hooks/ThemeContext.js";
import { palette } from "../../theme.js";

interface OverlayPanelProps {
  title?: string;
  width: number;
  children: ReactNode;
}

export function OverlayPanel({ title, width, children }: OverlayPanelProps) {
  const theme = useTheme();

  return (
    <Box
      flexDirection="column"
      width={width}
      marginBottom={1}
      borderStyle="single"
      borderColor={palette.slate}
      paddingX={1}
      paddingY={1}
    >
      {title && (
        <Box marginBottom={1}>
          <Text bold color={theme.text}>
            {title}
          </Text>
          <Text dimColor> · Esc close</Text>
        </Box>
      )}
      {children}
    </Box>
  );
}
