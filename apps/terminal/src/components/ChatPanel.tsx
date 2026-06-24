import { Box, Text } from "ink";
import type { ActivityStatus, ChatMessage } from "../state.js";
import { FormattedMessage } from "./FormattedMessage.js";

interface ChatPanelProps {
  messages: ChatMessage[];
  activity: ActivityStatus | null;
  animFrame: number;
}

function messageLabel(msg: ChatMessage): string {
  if (msg.role === "user") return "You";
  if (msg.role === "error") return "Error";
  return "Assistant";
}

function messageColor(msg: ChatMessage): "green" | "cyan" | "red" {
  if (msg.role === "user") return "green";
  if (msg.role === "error") return "red";
  return "cyan";
}

const ACTIVITY_SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function activityDots(animFrame: number): string {
  const count = (Math.floor(animFrame / 5) % 3) + 1;
  return ".".repeat(count);
}

function ActivityLine({
  activity,
  animFrame,
}: {
  activity: ActivityStatus;
  animFrame: number;
}) {
  const spinner = ACTIVITY_SPINNER[animFrame % ACTIVITY_SPINNER.length]!;
  const label = activity.label.replace(/…+$/, "");

  return (
    <Box marginBottom={1} paddingX={1}>
      <Text>
        <Text color="cyan">{spinner} </Text>
        <Text dimColor>
          {label}
          {activityDots(animFrame)}
        </Text>
      </Text>
    </Box>
  );
}

function lastUserMessageIndex(messages: ChatMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") return i;
  }
  return -1;
}

export function ChatPanel({ messages, activity, animFrame }: ChatPanelProps) {
  const lastUserIndex = lastUserMessageIndex(messages);
  const showActivity =
    activity !== null &&
    !messages.some((m) => m.role === "assistant" && m.streaming && m.content.length > 0);

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1} borderStyle="single" borderColor="blue">
      <Text bold color="blue">
        Chat
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {messages.length === 0 && !showActivity ? (
          <Text dimColor>No messages yet. Type a prompt below.</Text>
        ) : (
          messages.map((msg, index) => (
            <Box key={msg.id} flexDirection="column" marginBottom={1}>
              <Text color={messageColor(msg)} bold>
                {messageLabel(msg)}
                {msg.streaming ? " …" : ""}
              </Text>
              {msg.role === "user" ? (
                <Text wrap="wrap">{msg.content}</Text>
              ) : (
                <FormattedMessage
                  content={msg.content}
                  color={msg.role === "error" ? "red" : undefined}
                />
              )}
              {showActivity &&
                activity !== null &&
                msg.role === "user" &&
                index === lastUserIndex && (
                  <ActivityLine activity={activity} animFrame={animFrame} />
                )}
            </Box>
          ))
        )}
        {showActivity && lastUserIndex < 0 && activity !== null && (
          <ActivityLine activity={activity} animFrame={animFrame} />
        )}
      </Box>
    </Box>
  );
}
