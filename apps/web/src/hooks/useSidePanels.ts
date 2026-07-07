import { useCallback, useState } from "react";
import { useEdgeSwipe } from "./useEdgeSwipe";

export type SidePanel = "none" | "sessions";

export function useSidePanels() {
  const [panel, setPanel] = useState<SidePanel>("none");

  const openSessions = useCallback(() => setPanel("sessions"), []);
  const close = useCallback(() => setPanel("none"), []);
  const toggleSessions = useCallback(
    () => setPanel((p) => (p === "sessions" ? "none" : "sessions")),
    [],
  );

  useEdgeSwipe({
    enabled: panel === "none",
    onSwipeRight: openSessions,
  });

  useEdgeSwipe({
    enabled: panel === "sessions",
    onSwipeLeft: close,
  });

  return {
    panel,
    close,
    toggleSessions,
    sessionsOpen: panel === "sessions",
  };
}
