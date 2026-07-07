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

/** Quick press rebound for chrome menu buttons. */
export const MENU_TAP_SPRING = {
  type: "spring" as const,
  stiffness: 520,
  damping: 26,
  mass: 0.75,
};

/** Settings rail slides out from the pill. */
export const RAIL_SPRING_EXPAND = {
  type: "spring" as const,
  stiffness: 340,
  damping: 28,
  mass: 0.9,
};

/** Magnetic pull-back when focus leaves the input. */
export const RAIL_SPRING_COLLAPSE = {
  type: "spring" as const,
  stiffness: 520,
  damping: 38,
  mass: 0.7,
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
