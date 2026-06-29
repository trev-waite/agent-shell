import { Box, Text } from "ink";
import { useTheme } from "../hooks/ThemeContext.js";
import { StatusDot } from "./ui/StatusDot.js";
import type { FooterStatus } from "../projections/footer.js";
import type { ChatScrollState } from "../state.js";
import type { LayoutMode } from "../theme.js";

const VERSION = "0.0.1";

interface FooterProps {
  status: FooterStatus;
  width: number;
  chatScroll: ChatScrollState;
  hasScrollableHistory: boolean;
  layoutMode: LayoutMode;
}

function buildHints(
  chatScroll: ChatScrollState,
  hasScrollableHistory: boolean,
  layoutMode: LayoutMode,
): string {
  const parts = ["Enter send", "/new", "/help", "Esc"];

  if (hasScrollableHistory) {
    if (!chatScroll.followTail) {
      parts.unshift("Ctrl+E follow");
    } else if (layoutMode !== "compact") {
      parts.unshift("↑↓ · Ctrl+U/D · Ctrl+A/E");
    }
  }

  return parts.join(" · ");
}

export function Footer({
  status,
  width,
  chatScroll,
  hasScrollableHistory,
  layoutMode,
}: FooterProps) {
  const theme = useTheme();
  const hints = buildHints(chatScroll, hasScrollableHistory, layoutMode);

  return (
    <Box
      width={width}
      borderStyle="single"
      borderColor={theme.border}
      paddingX={1}
      justifyContent="space-between"
    >
      <StatusDot label={status.label} dotVariant={status.dotVariant} />
      <Text dimColor>{hints}</Text>
      <Text dimColor>v{VERSION}</Text>
    </Box>
  );
}
