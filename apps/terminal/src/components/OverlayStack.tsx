import type { UIState } from "../state.js";
import type { LayoutConfig } from "../theme.js";
import { MetricsPanel } from "./MetricsPanel.js";
import { ModelSelectorMenu } from "./ModelSelector.js";
import { SlashPalette } from "./SlashPalette.js";
import { TracePanel } from "./TracePanel.js";
import { OverlayPanel } from "./ui/OverlayPanel.js";

interface OverlayStackProps {
  state: UIState;
  layout: LayoutConfig;
}

export function OverlayStack({ state, layout }: OverlayStackProps) {
  switch (state.activeOverlay) {
    case "slash":
      return (
        <SlashPalette
          input={state.input}
          selectedIndex={state.slashMenuIndex}
          layout={layout}
        />
      );
    case "trace":
      return (
        <OverlayPanel title="TRACE" width={layout.columns}>
          <TracePanel
            traces={state.traces}
            sessionStartedAt={state.sessionStartedAt}
            sessionStatus={state.metrics.sessionStatus}
            expandedTraceIds={state.expandedTraceIds}
            focusedTraceIndex={state.focusedTraceIndex}
            layout={layout}
          />
        </OverlayPanel>
      );
    case "metrics":
      return (
        <OverlayPanel title="METRICS" width={layout.columns}>
          <MetricsPanel
            metrics={state.metrics}
            traces={state.traces}
            sessionStartedAt={state.sessionStartedAt}
            sessionEndedAt={state.sessionEndedAt}
            layout={layout}
          />
        </OverlayPanel>
      );
    case "model":
      return (
        <ModelSelectorMenu
          selectedProviderId={state.selectedProviderId}
          selectedModel={state.selectedModel}
          menuProviderIndex={state.menuProviderIndex}
          menuModelIndex={state.menuModelIndex}
          layout={layout}
        />
      );
    default:
      return null;
  }
}
