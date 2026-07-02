import type { ModelsResponse } from "@relay/sdk";
import type { ThemePreference } from "../theme";
import { Overlay } from "./chrome/Overlay";
import { useSidePanels } from "../hooks/useSidePanels";
import { SessionsPanel } from "./panels/SessionsPanel";
import { SettingsPanel } from "./panels/SettingsPanel";

/**
 * Symmetric edge drawers: sessions on the left, settings on the right.
 * Tap the edge handles or swipe from the screen edge on mobile.
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
}) {
  const {
    sessionsOpen,
    settingsOpen,
    close,
    toggleSessions,
    toggleSettings,
  } = useSidePanels();

  return (
    <>
      <button
        type="button"
        className="edge-handle edge-handle-left"
        aria-label="Sessions"
        aria-expanded={sessionsOpen}
        onClick={toggleSessions}
      />
      <button
        type="button"
        className="edge-handle edge-handle-right"
        aria-label="Settings"
        aria-expanded={settingsOpen}
        onClick={toggleSettings}
      />

      <Overlay
        open={sessionsOpen}
        onClose={close}
        panelClassName="panel-drawer panel-drawer-left"
        origin="left"
        label="Sessions"
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
