import { AnimatePresence, motion } from "motion/react";

export function ComposerStage({ hasTurns }: { hasTurns: boolean }) {
  const showGreeting = !hasTurns;

  return (
    <div className="composer-stage">
      <AnimatePresence>
        {showGreeting && (
          <motion.h1
            key="greeting"
            className="composer-greeting"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            Hello There.
          </motion.h1>
        )}
      </AnimatePresence>
    </div>
  );
}
