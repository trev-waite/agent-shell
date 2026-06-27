import { Box, Text } from "ink";
import { useTheme } from "../hooks/ThemeContext.js";
import { StatusDot } from "./ui/StatusDot.js";
import type { FooterStatus } from "../projections/footer.js";

const VERSION = "0.0.1";
const HINTS = "Enter send · /new · /help · Esc";

interface FooterProps {
  status: FooterStatus;
  width: number;
}

export function Footer({ status, width }: FooterProps) {
  const theme = useTheme();

  return (
    <Box
      width={width}
      borderStyle="single"
      borderColor={theme.border}
      paddingX={1}
      justifyContent="space-between"
    >
      <StatusDot label={status.label} dotVariant={status.dotVariant} />
      <Text dimColor>{HINTS}</Text>
      <Text dimColor>v{VERSION}</Text>
    </Box>
  );
}
