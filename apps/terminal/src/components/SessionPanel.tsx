import { Box, Text } from "ink";
import type { UIState } from "../state.js";
import type { LayoutConfig } from "../theme.js";
import { MetricsPanel } from "./MetricsPanel.js";
import { TracePanel } from "./TracePanel.js";
import { OverlayPanel } from "./ui/OverlayPanel.js";
import { useTheme } from "../hooks/ThemeContext.js";

interface SessionPanelProps {
  state: UIState;
  layout: LayoutConfig;
}

export function SessionPanel({ state, layout }: SessionPanelProps) {
  const theme = useTheme();
  const leftWidth = Math.floor(layout.columns / 2);
  const rightWidth = layout.columns - leftWidth;
  const traceLayout: LayoutConfig = {
    ...layout,
    columns: Math.max(20, leftWidth - 2),
    showTraceJson: layout.mode === "wide",
  };
  const metricsLayout: LayoutConfig = {
    ...layout,
    columns: Math.max(20, rightWidth - 2),
    metricsColumns: 2,
  };

  return (
    <OverlayPanel title="SESSION" width={layout.columns}>
      <Box flexDirection="row" width={layout.columns}>
        <Box width={leftWidth} flexDirection="column" paddingRight={1}>
          <Box marginBottom={1}>
            <Text bold color={theme.text}>
              Trace
            </Text>
            <Text dimColor> · [ expand · ] collapse</Text>
          </Box>
          <TracePanel
            traces={state.traces}
            sessionStartedAt={state.sessionStartedAt}
            sessionStatus={state.metrics.sessionStatus}
            expandedTraceIds={state.expandedTraceIds}
            focusedTraceIndex={state.focusedTraceIndex}
            layout={traceLayout}
          />
        </Box>
        <Box width={1}>
          <Text dimColor>│</Text>
        </Box>
        <Box width={rightWidth - 1} flexDirection="column" paddingLeft={1}>
          <Box marginBottom={1}>
            <Text bold color={theme.text}>
              Metrics
            </Text>
          </Box>
          <MetricsPanel
            metrics={state.metrics}
            traces={state.traces}
            sessionStartedAt={state.sessionStartedAt}
            sessionEndedAt={state.sessionEndedAt}
            layout={metricsLayout}
          />
        </Box>
      </Box>
    </OverlayPanel>
  );
}
