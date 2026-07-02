import { AnimatePresence, motion } from "motion/react";

/**
 * Inline status where the assistant reply will appear — small, quiet,
 * with a soft left-to-right reflection sweep.
 */
export function ThinkingIndicator({ label }: { label: string }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={label}
        className="thinking-indicator"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.25 }}
        aria-live="polite"
        aria-busy="true"
      >
        <span className="thinking-indicator-text">{label}…</span>
        <span className="thinking-indicator-shine" aria-hidden="true" />
      </motion.div>
    </AnimatePresence>
  );
}
