import { Box, Text } from "ink";
import type { ActivityStatus, ChatMessage, ToolTrace } from "../state.js";
import {
  displayMessageContent,
  gapBeforeMessage,
  showInlineTraceForMessage,
  type ChatViewport,
} from "../projections/chatViewport.js";
import type { LayoutConfig } from "../theme.js";
import { formatTimestamp } from "../utils/format.js";
import { FormattedMessage } from "./FormattedMessage.js";
import { InlineTraceFeed } from "./InlineTraceFeed.js";
import { useSpinnerFrame } from "./ui/Spinner.js";
import { useTheme } from "../hooks/ThemeContext.js";

interface ChatMessageItemProps {
  msg: ChatMessage;
  index: number;
  visibleIndex: number;
  messages: ChatMessage[];
  viewport: ChatViewport;
  traces: ToolTrace[];
  activity: ActivityStatus | null;
  showActivity: boolean;
  lastUserIndex: number;
  layout: LayoutConfig;
  isLastVisible: boolean;
}

export function ChatMessageItem({
  msg,
  index,
  visibleIndex,
  messages,
  viewport,
  traces,
  activity,
  showActivity,
  lastUserIndex,
  layout,
  isLastVisible,
}: ChatMessageItemProps) {
  const theme = useTheme();
  const spinner = useSpinnerFrame();
  const inlineTrace = showInlineTraceForMessage(
    messages,
    index,
    lastUserIndex,
    traces,
    activity,
    showActivity,
  );
  const truncateTopRows =
    visibleIndex === 0 ? viewport.truncateFirstMessageRows : null;
  const truncateBottomRows =
    isLastVisible ? viewport.truncateLastMessageRows : null;
  const content = displayMessageContent(
    msg,
    layout.columns,
    truncateTopRows,
    truncateBottomRows,
  );

  return (
    <Box
      flexDirection="column"
      marginTop={visibleIndex === 0 ? 0 : gapBeforeMessage(messages, index)}
    >
      {msg.role === "user" ? (
        <Box flexDirection="column">
          <Box
            paddingX={1}
            paddingY={0}
            backgroundColor={theme.userBg}
            borderStyle="single"
            borderColor={theme.user}
            borderTop={false}
            borderRight={false}
            borderBottom={false}
          >
            <Text bold color={theme.text} wrap="wrap">
              {content}
            </Text>
          </Box>
          <Box justifyContent="flex-end" marginTop={0}>
            <Text dimColor>{formatTimestamp(msg.timestamp)}</Text>
          </Box>
        </Box>
      ) : (
        <>
          {msg.role === "error" ? (
            <Text color={theme.error} bold>
              ERROR
            </Text>
          ) : null}
          {msg.streaming ? <Text color={theme.motion}>{spinner} </Text> : null}
          <FormattedMessage
            content={content}
            color={msg.role === "error" ? theme.error : theme.text}
          />
        </>
      )}

      {inlineTrace ? (
        <InlineTraceFeed
          traces={traces}
          afterTimestamp={msg.timestamp}
          activity={showActivity ? activity : null}
        />
      ) : null}
    </Box>
  );
}
