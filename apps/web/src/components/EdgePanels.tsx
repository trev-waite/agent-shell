import type { ModelsResponse } from "@relay/sdk";
import type { ThemePreference } from "../theme";
import { Overlay } from "./chrome/Overlay";
import { SessionsPanel } from "./panels/SessionsPanel";
import { SettingsPanel } from "./panels/SettingsPanel";

/**
 * Symmetric edge drawers: sessions on the left, settings on the right.
 * Drawers sit behind the elevated main surface; tap handles or swipe to open.
 */
export function EdgePanels({
  currentSessionId,
  activeModelId,
  models,
  themePreference,
  onThemeChange,
  onModelChange,
  onSelectSession,
  onSelectAgent,
  sessionsRefreshKey = 0,
  close,
  sessionsOpen,
  settingsOpen,
}: {
  currentSessionId: string | null;
  activeModelId: string;
  models: ModelsResponse | null;
  themePreference: ThemePreference;
  onThemeChange: (preference: ThemePreference) => void;
  onModelChange: (model: string) => void;
  onSelectSession: (sessionId: string, prompt?: string) => void;
  onSelectAgent: (modelId: string) => void;
  sessionsRefreshKey?: number;
  close: () => void;
  sessionsOpen: boolean;
  settingsOpen: boolean;
}) {
  return (
    <>
      <Overlay
        open={sessionsOpen}
        onClose={close}
        panelClassName="panel-drawer panel-drawer-left"
        origin="left"
        label="Sessions"
        layer="behind"
      >
        <SessionsPanel
          currentSessionId={currentSessionId}
          activeModelId={activeModelId}
          models={models}
          refreshKey={sessionsRefreshKey}
          onSelectSession={(sessionId, prompt) => {
            close();
            onSelectSession(sessionId, prompt);
          }}
          onSelectAgent={onSelectAgent}
        />
      </Overlay>

      <Overlay
        open={settingsOpen}
        onClose={close}
        panelClassName="panel-drawer panel-drawer-right"
        origin="right"
        label="Settings"
        layer="behind"
      >
        <SettingsPanel
          themePreference={themePreference}
          onThemeChange={onThemeChange}
          models={models}
          selectedModel={activeModelId}
          onModelChange={onModelChange}
        />
      </Overlay>
    </>
  );
}
