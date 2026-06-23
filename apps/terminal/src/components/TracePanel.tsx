import React from "react";
import { Box, Text } from "ink";
import type { ToolTrace } from "../state.js";
import { useAnimationFrame } from "../hooks/useAnimationFrame.js";

interface TracePanelProps {
  traces: ToolTrace[];
}

function TracePanelInner({ traces }: TracePanelProps) {
  const frame = useAnimationFrame();
  const spinner = ["|", "/", "-", "\\"][frame % 4]!;

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1} borderStyle="single" borderColor="yellow">
      <Text bold color="yellow">
        Trace
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {traces.length === 0 ? (
          <Text dimColor>No tool calls yet.</Text>
        ) : (
          traces.map((trace) => (
            <Box key={trace.id} flexDirection="column" marginBottom={1}>
              <Text>
                {trace.status === "running" ? (
                  <Text color="yellow">{spinner} </Text>
                ) : trace.status === "completed" ? (
                  <Text color="green">✓ </Text>
                ) : (
                  <Text color="red">✗ </Text>
                )}
                <Text bold>{trace.toolName}</Text>
                {trace.completedAt
                  ? ` (${trace.completedAt - trace.startedAt}ms)`
                  : ""}
              </Text>
              {trace.error && <Text color="red">{trace.error}</Text>}
            </Box>
          ))
        )}
      </Box>
    </Box>
  );
}

export const TracePanel = React.memo(TracePanelInner);
