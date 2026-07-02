import { useEffect } from "react";

const EDGE_ZONE = 28;
const MIN_SWIPE = 56;

/**
 * Edge-only swipe detection for opening/closing side panels on mobile.
 * Ignores mostly-vertical gestures so conversation scroll stays natural.
 */
export function useEdgeSwipe({
  onSwipeRight,
  onSwipeLeft,
  enabled = true,
}: {
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
  enabled?: boolean;
}) {
  useEffect(() => {
    if (!enabled) return;

    let startX = 0;
    let startY = 0;
    let fromEdge = false;

    const onTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      startX = touch.clientX;
      startY = touch.clientY;
      fromEdge =
        startX <= EDGE_ZONE ||
        startX >= window.innerWidth - EDGE_ZONE;
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!fromEdge) return;
      const touch = e.changedTouches[0];
      if (!touch) return;

      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (Math.abs(dy) > Math.abs(dx) * 0.85) return;
      if (Math.abs(dx) < MIN_SWIPE) return;

      if (dx > 0 && startX <= EDGE_ZONE) onSwipeRight?.();
      if (dx < 0 && startX >= window.innerWidth - EDGE_ZONE) onSwipeLeft?.();

      fromEdge = false;
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [enabled, onSwipeLeft, onSwipeRight]);
}
