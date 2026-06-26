import { Box, Text } from "ink";
import { useTheme } from "../../hooks/ThemeContext.js";
import type { MetricColorKey } from "../../projections/metrics.js";

interface MetricCellProps {
  label: string;
  value: string;
  colorKey?: MetricColorKey;
  width?: number;
}

export function MetricCell({ label, value, colorKey = "text", width }: MetricCellProps) {
  const theme = useTheme();
  const valueColor =
    colorKey === "status"
      ? theme.status
      : colorKey === "motion"
        ? theme.motion
        : colorKey === "error"
          ? theme.error
          : theme.text;

  return (
    <Box flexDirection="column" width={width} marginBottom={1} marginRight={1}>
      <Text dimColor>{label}</Text>
      <Text bold color={valueColor}>
        {value}
      </Text>
    </Box>
  );
}
