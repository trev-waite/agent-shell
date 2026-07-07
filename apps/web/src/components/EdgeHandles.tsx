import { motion } from "motion/react";
import { MENU_TAP_SPRING } from "../lib/motion";

/** Left sessions toggle — lives inside shell-content so it moves with the main page. */
export function EdgeHandles({
  sessionsOpen,
  onToggleSessions,
}: {
  sessionsOpen: boolean;
  onToggleSessions: () => void;
}) {
  return (
    <motion.button
      type="button"
      className="edge-menu-button edge-menu-button-left"
      aria-label="Sessions"
      aria-expanded={sessionsOpen}
      onClick={onToggleSessions}
      whileTap={{ scale: 0.88 }}
      transition={MENU_TAP_SPRING}
    >
      <span className="edge-menu-icon" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    </motion.button>
  );
}
