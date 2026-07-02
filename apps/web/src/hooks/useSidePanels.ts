import { useCallback, useState } from "react";
import { useEdgeSwipe } from "./useEdgeSwipe";

export type SidePanel = "none" | "sessions" | "settings";

export function useSidePanels() {
  const [panel, setPanel] = useState<SidePanel>("none");

  const openSessions = useCallback(() => setPanel("sessions"), []);
  const openSettings = useCallback(() => setPanel("settings"), []);
  const close = useCallback(() => setPanel("none"), []);
  const toggleSessions = useCallback(
    () => setPanel((p) => (p === "sessions" ? "none" : "sessions")),
    [],
  );
  const toggleSettings = useCallback(
    () => setPanel((p) => (p === "settings" ? "none" : "settings")),
    [],
  );

  useEdgeSwipe({
    enabled: panel === "none",
    onSwipeRight: openSessions,
    onSwipeLeft: openSettings,
  });

  useEdgeSwipe({
    enabled: panel === "sessions",
    onSwipeLeft: close,
  });

  useEdgeSwipe({
    enabled: panel === "settings",
    onSwipeRight: close,
  });

  return {
    panel,
    openSessions,
    openSettings,
    close,
    toggleSessions,
    toggleSettings,
    sessionsOpen: panel === "sessions",
    settingsOpen: panel === "settings",
  };
}
