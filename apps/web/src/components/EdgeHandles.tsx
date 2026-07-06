/** Left edge toggle — lives inside shell-content so it moves with the main page. */
export function EdgeHandles({
  sessionsOpen,
  onToggleSessions,
}: {
  sessionsOpen: boolean;
  onToggleSessions: () => void;
}) {
  return (
    <button
      type="button"
      className="edge-handle edge-handle-left"
      aria-label="Sessions"
      aria-expanded={sessionsOpen}
      onClick={onToggleSessions}
    />
  );
}
