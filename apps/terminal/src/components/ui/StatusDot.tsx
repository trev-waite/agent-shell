import { Text } from "ink";
import type { Theme } from "../../theme.js";
import { useTheme } from "../../hooks/ThemeContext.js";
import { useAnimationFrame } from "../../hooks/useAnimationFrame.js";
import type { StatusDotVariant } from "../../projections/footer.js";

const PULSE_BLUES = ["#38bdf8", "#0ea5e9", "#0284c7", "#0369a1", "#0284c7", "#0ea5e9"];

interface StatusDotProps {
  label: string;
  dotVariant: StatusDotVariant;
}

function dotColor(variant: StatusDotVariant, theme: Theme, frame: number): string {
  switch (variant) {
    case "success":
      return theme.success;
    case "active":
      return PULSE_BLUES[frame % PULSE_BLUES.length]!;
    case "error":
      return theme.error;
    case "warning":
      return theme.warning;
    case "muted":
      return theme.muted;
  }
}

export function StatusDot({ label, dotVariant }: StatusDotProps) {
  const theme = useTheme();
  const frame = useAnimationFrame();
  const color = dotColor(dotVariant, theme, frame);

  return (
    <Text>
      <Text color={color}>● </Text>
      <Text color={theme.text}>{label}</Text>
    </Text>
  );
}
