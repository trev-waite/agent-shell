export const PILL_SPRING = {
  type: "spring" as const,
  stiffness: 320,
  damping: 34,
};

/** Shared spring for message entry animations (composer rows, conversation follow-ups). */
export const MESSAGE_SPRING = PILL_SPRING;

export const FADE_IN = {
  duration: 0.3,
  ease: [0.32, 0.72, 0.24, 1] as const,
};

export function openFadeDelay(index: number): number {
  return Math.min(index * 0.04, 0.16);
}

export function openFadeTransition(index: number) {
  return { ...FADE_IN, delay: openFadeDelay(index) };
}

/** Parent variants — staggerChildren runs in DOM order (newest/bottom first in column-reverse). */
export const RESTORE_CONTAINER = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.11,
      delayChildren: 0.05,
    },
  },
};

export function restoreItemVariants(targetOpacity: number) {
  return {
    hidden: { opacity: 0, y: 16 },
    visible: {
      opacity: targetOpacity,
      y: 0,
      transition: {
        duration: 0.38,
        ease: FADE_IN.ease,
      },
    },
  };
}

/** Time for the full bottom-up restore cascade to finish. */
export function restoreCascadeDuration(visibleCount: number): number {
  const stagger = RESTORE_CONTAINER.visible.transition.staggerChildren as number;
  const delay = RESTORE_CONTAINER.visible.transition.delayChildren as number;
  const itemDuration = 0.38;
  return delay + Math.max(0, visibleCount - 1) * stagger + itemDuration + 0.05;
}
