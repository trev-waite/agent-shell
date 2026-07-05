/** Edge toggles — live inside shell-content so they move with the main page. */
export function EdgeHandles({
  sessionsOpen,
  settingsOpen,
  onToggleSessions,
  onToggleSettings,
}: {
  sessionsOpen: boolean;
  settingsOpen: boolean;
  onToggleSessions: () => void;
  onToggleSettings: () => void;
}) {
  return (
    <>
      <button
        type="button"
        className="edge-handle edge-handle-left"
        aria-label="Sessions"
        aria-expanded={sessionsOpen}
        onClick={onToggleSessions}
      />
      <button
        type="button"
        className="edge-handle edge-handle-right"
        aria-label="Settings"
        aria-expanded={settingsOpen}
        onClick={onToggleSettings}
      />
    </>
  );
}
