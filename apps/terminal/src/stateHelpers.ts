import { getEnabledProviders } from "@relay/types";
import type { UIState } from "./state.js";

export function modelOverlayState(state: UIState): {
  menuProviderIndex: number;
  menuModelIndex: number;
} {
  const enabled = getEnabledProviders();
  const providerIndex = Math.max(
    0,
    enabled.findIndex((provider) => provider.id === state.selectedProviderId),
  );
  const provider = enabled[providerIndex] ?? enabled[0];
  const modelIndex = Math.max(
    0,
    provider?.models.findIndex((model) => model.id === state.selectedModel) ?? 0,
  );
  return { menuProviderIndex: providerIndex, menuModelIndex: modelIndex };
}

export function openModelOverlayState(state: UIState): UIState {
  const { menuProviderIndex, menuModelIndex } = modelOverlayState(state);
  return {
    ...state,
    activeOverlay: "model",
    menuProviderIndex,
    menuModelIndex,
    input: "",
    slashMenuIndex: 0,
  };
}

export function preservePreferences(state: UIState): Pick<
  UIState,
  | "selectedProviderId"
  | "selectedModel"
  | "colorSchemePreference"
  | "serverOnline"
  | "streamConnected"
> {
  return {
    selectedProviderId: state.selectedProviderId,
    selectedModel: state.selectedModel,
    colorSchemePreference: state.colorSchemePreference,
    serverOnline: state.serverOnline,
    streamConnected: state.streamConnected,
  };
}

export function isPanelOverlay(panel: UIState["activeOverlay"]): boolean {
  return panel === "trace" || panel === "metrics";
}

/** True while the agent is thinking, streaming, or running a tool. */
export function isSessionBusy(state: UIState): boolean {
  return state.activity !== null || state.metrics.sessionStatus === "running";
}
