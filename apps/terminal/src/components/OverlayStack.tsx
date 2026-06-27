import type { UIState } from "../state.js";
import type { LayoutConfig } from "../theme.js";
import { ModelSelectorMenu } from "./ModelSelector.js";
import { SessionPanel } from "./SessionPanel.js";
import { SlashPalette } from "./SlashPalette.js";

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
    case "session":
      return <SessionPanel state={state} layout={layout} />;
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
