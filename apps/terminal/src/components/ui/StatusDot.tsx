import { Text } from "ink";
import { useTheme } from "../../hooks/ThemeContext.js";
import type { ThemeColorKey } from "../../theme.js";

interface StatusDotProps {
  label: string;
  colorKey: ThemeColorKey;
}

export function StatusDot({ label, colorKey }: StatusDotProps) {
  const theme = useTheme();
  const color = theme[colorKey];

  return (
    <Text>
      <Text color={color}>• </Text>
      <Text color={theme.text}>{label}</Text>
    </Text>
  );
}
