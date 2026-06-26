import { Box, Text } from "ink";
import type { ActivityStatus, ToolTrace } from "../state.js";
import { tracesForTurn } from "../projections/trace.js";
import { useTheme } from "../hooks/ThemeContext.js";
import type { LayoutConfig } from "../theme.js";
import {
  formatDuration,
  formatToolInputOneLine,
  formatTraceResult,
} from "../utils/format.js";
import { useSpinnerFrame, useActivityDots } from "./ui/Spinner.js";

interface InlineTraceFeedProps {
  traces: ToolTrace[];
  afterTimestamp: number;
  activity: ActivityStatus | null;
  layout: LayoutConfig;
}

export function InlineTraceFeed({
  traces,
  afterTimestamp,
  activity,
  layout,
}: InlineTraceFeedProps) {
  const theme = useTheme();
  const spinner = useSpinnerFrame();
  const dots = useActivityDots();
  const turnTraces = tracesForTurn(traces, afterTimestamp);
  const maxCols = layout.columns - 6;

  return (
    <Box flexDirection="column" marginTop={1} marginBottom={1} paddingLeft={2}>
      {turnTraces.map((trace) => {
        const duration =
          trace.completedAt !== undefined
            ? ` · ${formatDuration(trace.completedAt - trace.startedAt)}`
            : "";

        return (
          <Box key={trace.id} flexDirection="column">
            <Text>
              <Text color={theme.motion}>◆ </Text>
              <Text dimColor>Tool Call · </Text>
              <Text color={theme.agent}>{trace.toolName}</Text>
              {trace.status === "running" ? (
                <Text color={theme.motion}> {spinner}</Text>
              ) : (
                <Text dimColor>{duration}</Text>
              )}
            </Text>
            {trace.input !== undefined && layout.mode !== "compact" && (
              <Text wrap="wrap">
                <Text dimColor>  Input </Text>
                <Text color={theme.motion}>
                  {formatToolInputOneLine(trace.input, maxCols)}
                </Text>
              </Text>
            )}
            {trace.status === "completed" && trace.output !== undefined && (
              <Text>
                <Text dimColor>  Result </Text>
                <Text color={theme.status}>{formatTraceResult(trace.output)}</Text>
              </Text>
            )}
            {trace.error && (
              <Text color={theme.error}>  {trace.error}</Text>
            )}
          </Box>
        );
      })}
      {activity && (
        <Text>
          <Text color={theme.motion}>◆ </Text>
          <Text dimColor>
            {activity.label.replace(/…+$/, "")}
            {dots}
          </Text>
        </Text>
      )}
    </Box>
  );
}
