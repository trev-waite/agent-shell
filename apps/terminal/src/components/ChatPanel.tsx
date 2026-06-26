import { Box, Text } from "ink";
import type { ActivityStatus, ChatMessage, ToolTrace } from "../state.js";
import { FormattedMessage } from "./FormattedMessage.js";
import { InlineTraceFeed } from "./InlineTraceFeed.js";
import { useSpinnerFrame } from "./ui/Spinner.js";
import { useTheme } from "../hooks/ThemeContext.js";
import { gapBeforeMessage } from "../projections/chatViewport.js";
import type { LayoutConfig } from "../theme.js";
import { formatTimestamp } from "../utils/format.js";

interface ChatPanelProps {
  messages: ChatMessage[];
  traces: ToolTrace[];
  activity: ActivityStatus | null;
  layout: LayoutConfig;
}

function lastUserMessageIndex(messages: ChatMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") return i;
  }
  return -1;
}

export function ChatPanel({
  messages,
  traces,
  activity,
  layout,
}: ChatPanelProps) {
  const theme = useTheme();
  const spinner = useSpinnerFrame();
  const lastUserIndex = lastUserMessageIndex(messages);
  const showActivity =
    activity !== null &&
    !messages.some((m) => m.role === "assistant" && m.streaming && m.content.length > 0);

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      flexShrink={1}
      width={layout.columns}
      marginTop={1}
      paddingX={1}
    >
      {messages.length === 0 && !showActivity ? (
        <Box
          flexGrow={1}
          flexDirection="column"
          justifyContent="center"
          alignItems="center"
        >
          <Box marginBottom={1}>
            <Text bold color={theme.text}>
              Hello There!
            </Text>
          </Box>
          <Text dimColor>No messages yet. Type a prompt below.</Text>
        </Box>
      ) : (
        <>
          {messages.map((msg, index) => {
            const isLastUser = msg.role === "user" && index === lastUserIndex;
            const showInlineTrace =
              isLastUser &&
              (traces.some((t) => t.startedAt >= msg.timestamp) ||
                (showActivity && activity !== null));

            return (
              <Box
                key={msg.id}
                flexDirection="column"
                marginTop={gapBeforeMessage(messages, index)}
              >
                {msg.role === "user" ? (
                  <Box flexDirection="column">
                    <Box flexDirection="row">
                      <Text color={theme.motion}>❯ </Text>
                      <Text color={theme.user} wrap="wrap">
                        {msg.content}
                      </Text>
                    </Box>
                    <Box justifyContent="flex-end">
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
                    {msg.streaming && (
                      <Text color={theme.motion}>{spinner} </Text>
                    )}
                    <FormattedMessage
                      content={msg.content}
                      color={msg.role === "error" ? theme.error : theme.text}
                    />
                  </>
                )}

                {showInlineTrace && (
                  <InlineTraceFeed
                    traces={traces}
                    afterTimestamp={msg.timestamp}
                    activity={showActivity && isLastUser ? activity : null}
                    layout={layout}
                  />
                )}
              </Box>
            );
          })}
          {showActivity && lastUserIndex < 0 && activity !== null && (
            <InlineTraceFeed
              traces={traces}
              afterTimestamp={0}
              activity={activity}
              layout={layout}
            />
          )}
        </>
      )}
    </Box>
  );
}
