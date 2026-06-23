import { Box, Text } from "ink";
import type { ChatMessage } from "../state.js";

interface ChatPanelProps {
  messages: ChatMessage[];
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

export function ChatPanel({ messages }: ChatPanelProps) {
  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1} borderStyle="single" borderColor="blue">
      <Text bold color="blue">
        Chat
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {messages.length === 0 ? (
          <Text dimColor>No messages yet. Type a prompt below.</Text>
        ) : (
          messages.map((msg) => (
            <Box key={msg.id} flexDirection="column" marginBottom={1}>
              <Text color={messageColor(msg)} bold>
                {messageLabel(msg)}
                {msg.streaming ? " ..." : ""}
              </Text>
              <Text
                wrap="wrap"
                {...(msg.role === "error" ? { color: "red" as const } : {})}
              >
                {msg.content}
              </Text>
            </Box>
          ))
        )}
      </Box>
    </Box>
  );
}
