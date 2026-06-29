import { Box, Text } from "ink";
import type { ScrollbarMetrics } from "../projections/chatViewport.js";
import { useTheme } from "../hooks/ThemeContext.js";

interface ChatScrollbarProps {
  metrics: ScrollbarMetrics;
  height: number;
}

export function ChatScrollbar({ metrics, height }: ChatScrollbarProps) {
  const theme = useTheme();

  if (!metrics.visible || height <= 0) {
    return null;
  }

  const track: string[] = [];
  for (let row = 0; row < height; row++) {
    const inThumb =
      row >= metrics.thumbTop && row < metrics.thumbTop + metrics.thumbHeight;
    track.push(inThumb ? "█" : "│");
  }

  return (
    <Box flexDirection="column" flexShrink={0} marginLeft={1}>
      {track.map((char, row) => (
        <Text key={row} color={char === "█" ? theme.border : theme.muted}>
          {char}
        </Text>
      ))}
    </Box>
  );
}
