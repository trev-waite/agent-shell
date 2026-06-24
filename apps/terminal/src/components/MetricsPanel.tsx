import React from "react";
import { Box, Text } from "ink";
import type { Metrics } from "../state.js";

interface MetricsPanelProps {
  metrics: Metrics;
  serverOnline: boolean | null;
  streamConnected: boolean;
  hasSession: boolean;
}

function MetricsPanelInner({
  metrics,
  serverOnline,
  streamConnected,
  hasSession,
}: MetricsPanelProps) {
  const statusColor =
    metrics.sessionStatus === "running"
      ? "yellow"
      : metrics.sessionStatus === "completed"
        ? "green"
        : metrics.sessionStatus === "failed"
          ? "red"
          : "gray";

  const serverLabel =
    serverOnline === null ? "checking…" : serverOnline ? "online" : "offline";
  const serverColor =
    serverOnline === null ? "gray" : serverOnline ? "green" : "red";

  const streamLabel = !hasSession
    ? "standby"
    : streamConnected
      ? "live"
      : "disconnected";
  const streamColor = !hasSession ? "gray" : streamConnected ? "green" : "red";

  return (
    <Box
      flexDirection="column"
      width={28}
      paddingX={1}
      borderStyle="single"
      borderColor="magenta"
    >
      <Text bold color="magenta">
        Metrics
      </Text>
      <Box flexDirection="column" marginTop={1}>
        <Text>
          Status: <Text color={statusColor}>{metrics.sessionStatus}</Text>
        </Text>
        <Text>
          Server: <Text color={serverColor}>{serverLabel}</Text>
        </Text>
        <Text>
          Stream: <Text color={streamColor}>{streamLabel}</Text>
        </Text>
        <Text>Input tokens: {metrics.inputTokens}</Text>
        <Text>Output tokens: {metrics.outputTokens}</Text>
        <Text>
          Cost: {metrics.totalCost.toFixed(6)} {metrics.currency}
        </Text>
      </Box>
    </Box>
  );
}

export const MetricsPanel = React.memo(MetricsPanelInner);
