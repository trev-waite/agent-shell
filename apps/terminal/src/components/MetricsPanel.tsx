import React, { useEffect, useState } from "react";
import { Box } from "ink";
import type { Metrics, ToolTrace } from "../state.js";
import { buildMetricsGrid } from "../projections/metrics.js";
import { MetricCell } from "./ui/MetricCell.js";
import type { LayoutConfig } from "../theme.js";

interface MetricsPanelProps {
  metrics: Metrics;
  traces: ToolTrace[];
  sessionStartedAt: number | null;
  sessionEndedAt: number | null;
  layout: LayoutConfig;
}

function MetricsPanelInner({
  metrics,
  traces,
  sessionStartedAt,
  sessionEndedAt,
  layout,
}: MetricsPanelProps) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (metrics.sessionStatus !== "running") return;
    const interval = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(interval);
  }, [metrics.sessionStatus]);

  const cells = buildMetricsGrid(
    metrics,
    traces,
    sessionStartedAt,
    sessionEndedAt,
    layout.mode,
    now,
  );

  const colWidth = layout.metricsColumns === 3 ? 10 : 14;

  return (
    <Box flexDirection="row" flexWrap="wrap">
      {cells.map((cell) => (
        <MetricCell
          key={cell.id}
          label={cell.label}
          value={cell.value}
          colorKey={cell.colorKey}
          width={colWidth}
        />
      ))}
    </Box>
  );
}

export const MetricsPanel = React.memo(MetricsPanelInner);
