import { Box, Text } from "ink";
import type { ActivityStatus, ToolTrace } from "../state.js";
import { tracesForTurn } from "../projections/trace.js";
import { useTheme } from "../hooks/ThemeContext.js";
import { formatDuration } from "../utils/format.js";
import { useSpinnerFrame, useActivityDots } from "./ui/Spinner.js";

interface InlineTraceFeedProps {
  traces: ToolTrace[];
  afterTimestamp: number;
  activity: ActivityStatus | null;
}

export function InlineTraceFeed({
  traces,
  afterTimestamp,
  activity,
}: InlineTraceFeedProps) {
  const theme = useTheme();
  const spinner = useSpinnerFrame();
  const dots = useActivityDots();
  const turnTraces = tracesForTurn(traces, afterTimestamp);

  return (
    <Box flexDirection="column" marginTop={1} marginBottom={1} paddingLeft={2}>
      {turnTraces.map((trace) => {
        const duration =
          trace.completedAt !== undefined
            ? ` · ${formatDuration(trace.completedAt - trace.startedAt)}`
            : "";

        return (
          <Text key={trace.id}>
            <Text color={theme.motion}>◆ </Text>
            <Text dimColor>Tool Call · </Text>
            <Text color={trace.error ? theme.error : theme.agent}>{trace.toolName}</Text>
            {trace.status === "running" ? (
              <Text color={theme.motion}> {spinner}</Text>
            ) : trace.error ? (
              <Text color={theme.error}> · failed{duration}</Text>
            ) : (
              <Text dimColor>{duration}</Text>
            )}
          </Text>
        );
      })}
      {activity ? (
        <Text>
          <Text color={theme.motion}>◆ </Text>
          <Text dimColor>
            {activity.label.replace(/…+$/, "")}
            {dots}
          </Text>
        </Text>
      ) : null}
    </Box>
  );
}
