import React from "react";
import { Box, Text } from "ink";
import type { ToolTrace } from "../state.js";
import { buildTraceTimeline, type TimelineNode } from "../projections/trace.js";
import { Timeline, TimelineDetail } from "./ui/Timeline.js";
import { useSpinnerFrame } from "./ui/Spinner.js";
import { useTheme } from "../hooks/ThemeContext.js";
import type { LayoutConfig } from "../theme.js";
import {
  formatDuration,
  formatJson,
  formatToolInputOneLine,
  formatTraceResult,
  formatTimestamp,
} from "../utils/format.js";

interface TracePanelProps {
  traces: ToolTrace[];
  sessionStartedAt: number | null;
  sessionStatus: string;
  expandedTraceIds: string[];
  focusedTraceIndex: number;
  layout: LayoutConfig;
}

function TraceNodeHeader({
  node,
  isFocused,
}: {
  node: TimelineNode;
  isFocused: boolean;
}) {
  const theme = useTheme();
  const spinner = useSpinnerFrame();

  const statusIcon =
    node.status === "running" ? (
      <Text color={theme.motion}>{spinner} </Text>
    ) : node.status === "completed" ? (
      <Text color={theme.status}>✓ </Text>
    ) : node.status === "failed" ? (
      <Text color={theme.error}>✗ </Text>
    ) : (
      <Text dimColor>○ </Text>
    );

  const duration =
    node.startedAt && node.completedAt
      ? ` · ${formatDuration(node.completedAt - node.startedAt)}`
      : "";

  const timestamp =
    node.startedAt !== undefined ? ` · ${formatTimestamp(node.startedAt)}` : "";

  if (node.type === "tool") {
    return (
      <Text>
        {statusIcon}
        <Text dimColor>Tool Call · </Text>
        <Text bold color={isFocused ? theme.motion : theme.agent}>
          {node.label}
        </Text>
        {duration}
      </Text>
    );
  }

  return (
    <Text>
      {statusIcon}
      <Text bold color={isFocused ? theme.motion : theme.text}>
        {node.label}
      </Text>
      {timestamp}
      {duration}
    </Text>
  );
}

function ToolCallDetails({
  node,
  layout,
  expanded,
}: {
  node: TimelineNode;
  layout: LayoutConfig;
  expanded: boolean;
}) {
  const theme = useTheme();
  const maxCols = Math.max(20, layout.columns) - 8;

  if (node.type !== "tool") return null;

  const showFull = expanded && layout.showTraceJson;

  return (
    <TimelineDetail>
      <Box flexDirection="column">
        {node.input !== undefined && (
          <Text wrap="wrap">
            <Text dimColor>Input </Text>
            <Text color={theme.text}>
              {showFull
                ? formatJson(node.input, maxCols)
                : formatToolInputOneLine(node.input, maxCols)}
            </Text>
          </Text>
        )}
        {node.status === "running" && (
          <Text color={theme.motion}>Running…</Text>
        )}
        {node.status === "completed" && node.output !== undefined && (
          <Text wrap="wrap">
            <Text dimColor>Result </Text>
            <Text color={theme.status}>{formatTraceResult(node.output)}</Text>
          </Text>
        )}
        {node.status === "failed" && node.error && (
          <Text color={theme.error}>{node.error}</Text>
        )}
        {showFull && node.output !== undefined && node.status === "completed" && (
          <Text wrap="wrap">
            <Text dimColor>Output </Text>
            <Text color={theme.text}>{formatJson(node.output, maxCols)}</Text>
          </Text>
        )}
      </Box>
    </TimelineDetail>
  );
}

function TracePanelInner({
  traces,
  sessionStartedAt,
  sessionStatus,
  expandedTraceIds,
  focusedTraceIndex,
  layout,
}: TracePanelProps) {
  const nodes = buildTraceTimeline(traces, sessionStartedAt, sessionStatus);
  const toolIds = nodes.filter((n) => n.type === "tool").map((n) => n.id);
  const focusedId = toolIds[focusedTraceIndex];

  return (
    <Timeline>
      {nodes.length === 0 ? (
        <Text dimColor>No tool calls yet.</Text>
      ) : (
        nodes.map((node, index) => {
          const isLast = index === nodes.length - 1;
          const isFocused = node.id === focusedId;
          const isExpanded =
            node.type === "tool" && expandedTraceIds.includes(node.id);
          const showToolDetails =
            node.type === "tool" &&
            (layout.mode !== "compact" || node.status !== "running");

          return (
            <Box key={node.id} flexDirection="column">
              <Box>
                <Text dimColor>{isLast ? "└─" : "├─"} </Text>
                <TraceNodeHeader node={node} isFocused={isFocused} />
              </Box>
              {!isLast && (
                <Box paddingLeft={2}>
                  <Text dimColor>│</Text>
                </Box>
              )}
              {showToolDetails && (
                <ToolCallDetails
                  node={node}
                  layout={layout}
                  expanded={isExpanded}
                />
              )}
            </Box>
          );
        })
      )}
    </Timeline>
  );
}

export const TracePanel = React.memo(TracePanelInner);
