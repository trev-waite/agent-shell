import { Box, Text } from "ink";
import { useTheme } from "../hooks/ThemeContext.js";
import { formatHeaderUsage } from "../projections/header.js";
import type { LayoutConfig } from "../theme.js";
import type { Metrics } from "../state.js";

interface HeaderProps {
  serverOnline: boolean | null;
  sessionId: string | null;
  metrics: Metrics;
  layout: LayoutConfig;
}

export function Header({
  serverOnline,
  sessionId,
  metrics,
  layout,
}: HeaderProps) {
  const theme = useTheme();

  const dotColor =
    serverOnline === false
      ? theme.error
      : serverOnline === true
        ? theme.status
        : theme.warning;

  return (
    <Box
      width={layout.columns}
      borderStyle="single"
      borderColor={theme.border}
      paddingX={1}
      justifyContent="space-between"
    >
      <Box>
        <Text bold color={theme.text}>
          RELAY TERMINAL
        </Text>
        <Text color={dotColor}> ·</Text>
        {layout.showSessionId && sessionId && (
          <Text dimColor> {sessionId.slice(0, 8)}</Text>
        )}
      </Box>
      <Text dimColor>{formatHeaderUsage(metrics)}</Text>
    </Box>
  );
}
