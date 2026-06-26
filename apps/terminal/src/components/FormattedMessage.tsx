import { Box, Text } from "ink";

interface FormattedMessageProps {
  content: string;
  color?: string;
}

type InlinePart =
  | { kind: "text"; value: string }
  | { kind: "bold"; value: string }
  | { kind: "code"; value: string };

const INLINE_PATTERN = /(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__)/g;
const LIST_LINE = /^(\s*)([-*]|\d+\.)\s+(.*)$/;

function parseInline(line: string): InlinePart[] {
  const parts: InlinePart[] = [];
  let lastIndex = 0;

  for (const match of line.matchAll(INLINE_PATTERN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      parts.push({ kind: "text", value: line.slice(lastIndex, index) });
    }

    const token = match[0]!;
    if (token.startsWith("`")) {
      parts.push({ kind: "code", value: token.slice(1, -1) });
    } else {
      parts.push({ kind: "bold", value: token.slice(2, -2) });
    }

    lastIndex = index + token.length;
  }

  if (lastIndex < line.length) {
    parts.push({ kind: "text", value: line.slice(lastIndex) });
  }

  return parts.length > 0 ? parts : [{ kind: "text", value: line }];
}

function InlineRow({ parts, color }: { parts: InlinePart[]; color?: string }) {
  return (
    <Box flexDirection="row" flexWrap="wrap">
      {parts.map((part, index) => {
        switch (part.kind) {
          case "bold":
            return (
              <Text key={index} bold {...(color ? { color } : {})}>
                {part.value}
              </Text>
            );
          case "code":
            return (
              <Text key={index} dimColor {...(color ? { color } : {})}>
                {part.value}
              </Text>
            );
          default:
            return (
              <Text key={index} {...(color ? { color } : {})}>
                {part.value}
              </Text>
            );
        }
      })}
    </Box>
  );
}

function FormattedLine({ line, color }: { line: string; color?: string }) {
  const list = line.match(LIST_LINE);
  if (list) {
    const indent = list[1] ?? "";
    const marker = list[2] ?? "-";
    const text = list[3] ?? "";
    const prefix = /^\d/.test(marker) ? `${marker} ` : "• ";
    const marginLeft = Math.min(indent.length + 1, 4);

    return (
      <Box marginLeft={marginLeft} flexDirection="row" flexWrap="wrap">
        <Text dimColor>{prefix}</Text>
        <InlineRow parts={parseInline(text)} {...(color ? { color } : {})} />
      </Box>
    );
  }

  return <InlineRow parts={parseInline(line)} {...(color ? { color } : {})} />;
}

export function FormattedMessage({ content, color }: FormattedMessageProps) {
  const lines = content.split("\n");

  return (
    <Box flexDirection="column">
      {lines.map((line, index) =>
        line.length === 0 ? (
          <Box key={index} height={1} />
        ) : (
          <FormattedLine key={index} line={line} {...(color ? { color } : {})} />
        ),
      )}
    </Box>
  );
}
