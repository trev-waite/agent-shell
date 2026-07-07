import type { ModelsResponse } from "@relay/sdk";
import { Overlay } from "./chrome/Overlay";
import { SessionsPanel } from "./panels/SessionsPanel";

/** Sessions edge drawer on the left. Tap handle or swipe to open. */
export function EdgePanels({
  currentSessionId,
  activeModelId,
  models,
  onSelectSession,
  onSelectAgent,
  sessionsRefreshKey = 0,
  close,
  sessionsOpen,
}: {
  currentSessionId: string | null;
  activeModelId: string;
  models: ModelsResponse | null;
  onSelectSession: (sessionId: string, prompt?: string) => void;
  onSelectAgent: (modelId: string) => void;
  sessionsRefreshKey?: number;
  close: () => void;
  sessionsOpen: boolean;
}) {
  return (
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
  );
}
