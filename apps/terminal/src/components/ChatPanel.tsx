import { Box, Text } from "ink";
import type { ActivityStatus, ChatMessage, ChatScrollState, ToolTrace } from "../state.js";
import { buildChatViewModel } from "../projections/chatViewport.js";
import type { LayoutConfig } from "../theme.js";
import { ChatMessageItem } from "./ChatMessageItem.js";
import { ChatScrollbar } from "./ChatScrollbar.js";
import { InlineTraceFeed } from "./InlineTraceFeed.js";
import { useTheme } from "../hooks/ThemeContext.js";

interface ChatPanelProps {
  messages: ChatMessage[];
  traces: ToolTrace[];
  activity: ActivityStatus | null;
  layout: LayoutConfig;
  maxRows: number;
  chatScroll: ChatScrollState;
  showScrollbar: boolean;
}

export function ChatPanel({
  messages,
  traces,
  activity,
  layout,
  maxRows,
  chatScroll,
  showScrollbar,
}: ChatPanelProps) {
  const theme = useTheme();
  const contentColumns = showScrollbar ? layout.columns - 1 : layout.columns;
  const view = buildChatViewModel(
    messages,
    traces,
    activity,
    layout,
    maxRows,
    chatScroll,
    contentColumns,
  );

  const lastVisibleIndex = view.visibleMessages.length - 1;

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      flexShrink={1}
      minHeight={0}
      width={layout.columns}
      marginTop={1}
      paddingX={1}
    >
      {!view.hasConversation ? (
        <Box
          flexGrow={1}
          flexDirection="column"
          justifyContent="center"
          alignItems="center"
        >
          <Box marginBottom={1}>
            <Text bold color={theme.text}>
              Hello There.
            </Text>
          </Box>
          <Text dimColor>No messages yet. Type a prompt below.</Text>
        </Box>
      ) : (
        <Box flexDirection="row" flexGrow={1} minHeight={0} overflow="hidden">
          <Box flexDirection="column" flexGrow={1} flexShrink={1} minHeight={0} overflow="hidden">
            {!chatScroll.followTail && view.viewport.hiddenMessageCount > 0 ? (
              <Box marginBottom={1}>
                <Text dimColor>
                  ↑ {view.viewport.hiddenMessageCount} earlier message
                  {view.viewport.hiddenMessageCount === 1 ? "" : "s"} · Ctrl+E to follow
                </Text>
              </Box>
            ) : null}
            {view.visibleMessages.map((msg, visibleIndex) => (
              <ChatMessageItem
                key={msg.id}
                msg={msg}
                index={view.viewport.startIndex + visibleIndex}
                visibleIndex={visibleIndex}
                messages={messages}
                viewport={view.viewport}
                traces={traces}
                activity={activity}
                showActivity={view.showActivity}
                lastUserIndex={view.lastUserIndex}
                layout={{ ...layout, columns: contentColumns }}
                isLastVisible={visibleIndex === lastVisibleIndex}
              />
            ))}
            {view.showActivity && view.lastUserIndex < 0 && activity !== null ? (
              <InlineTraceFeed
                traces={traces}
                afterTimestamp={0}
                activity={activity}
              />
            ) : null}
          </Box>
          {showScrollbar ? (
            <ChatScrollbar metrics={view.scrollbar} height={view.viewport.maxRows} />
          ) : null}
        </Box>
      )}
    </Box>
  );
}
