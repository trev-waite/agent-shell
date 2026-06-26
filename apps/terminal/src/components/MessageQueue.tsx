import { Box, Text } from "ink";
import { useTheme } from "../hooks/ThemeContext.js";
import type { LayoutConfig } from "../theme.js";
import type { QueuedMessage } from "../state.js";
import { truncateToWidth } from "../utils/format.js";

interface MessageQueueProps {
  items: QueuedMessage[];
  layout: LayoutConfig;
}

export function MessageQueue({ items, layout }: MessageQueueProps) {
  const theme = useTheme();

  if (items.length === 0) return null;

  const textWidth = Math.max(20, layout.columns - 6);

  return (
    <Box flexDirection="column" width={layout.columns} marginBottom={1}>
      {items.map((item, index) => (
        <Box
          key={item.id}
          width={layout.columns}
          paddingX={1}
          backgroundColor={theme.queueBg}
        >
          <Text color={theme.muted}>{index === 0 ? "▸ queued " : "   "}</Text>
          <Text color={theme.text}>{truncateToWidth(item.prompt, textWidth)}</Text>
        </Box>
      ))}
    </Box>
  );
}
