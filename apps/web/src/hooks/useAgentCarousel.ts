import { useCallback, useEffect, useRef } from "react";

const EDGE_ZONE = 64;
const MAX_SCROLL_SPEED = 9;
const PROXIMITY_RADIUS = 120;
const SWIPE_THRESHOLD = 44;

function hasFinePointer(): boolean {
  return window.matchMedia("(pointer: fine)").matches;
}

/**
 * Horizontal agent carousel: edge-proximity scroll + pointer proximity
 * scaling on web; swipe left/right to change selection on touch devices.
 */
export function useAgentCarousel({
  agentIds,
  selectedId,
  onSelect,
}: {
  agentIds: string[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef(new Map<string, HTMLButtonElement>());
  const scrollDirRef = useRef(0);
  const rafRef = useRef(0);

  const registerItem = useCallback((id: string, el: HTMLButtonElement | null) => {
    if (el) itemRefs.current.set(id, el);
    else itemRefs.current.delete(id);
  }, []);

  const scrollSelectedIntoView = useCallback(
    (id: string, behavior: ScrollBehavior = "smooth") => {
      itemRefs.current.get(id)?.scrollIntoView({
        behavior,
        inline: "center",
        block: "nearest",
      });
    },
    [],
  );

  useEffect(() => {
    scrollSelectedIntoView(selectedId, "smooth");
  }, [selectedId, scrollSelectedIntoView]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const tick = () => {
      if (scrollDirRef.current !== 0) {
        track.scrollLeft += scrollDirRef.current;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    const setProximityStyles = (x: number, y: number) => {
      for (const el of itemRefs.current.values()) {
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dist = Math.hypot(x - cx, y - cy);
        const proximity = Math.max(0, 1 - dist / PROXIMITY_RADIUS);
        el.style.setProperty("--proximity", proximity.toFixed(3));
      }
    };

    const clearProximity = () => {
      for (const el of itemRefs.current.values()) {
        el.style.removeProperty("--proximity");
      }
    };

    const scrollFromPointer = (x: number, y: number) => {
      if (!hasFinePointer()) return;

      const rect = track.getBoundingClientRect();
      if (y < rect.top - 12 || y > rect.bottom + 12) {
        scrollDirRef.current = 0;
        return;
      }

      // Edge zones: faster scroll the closer you are to the rim.
      if (x < rect.left + EDGE_ZONE) {
        const t = 1 - (x - rect.left) / EDGE_ZONE;
        scrollDirRef.current = -MAX_SCROLL_SPEED * t;
        return;
      }
      if (x > rect.right - EDGE_ZONE) {
        const t = 1 - (rect.right - x) / EDGE_ZONE;
        scrollDirRef.current = MAX_SCROLL_SPEED * t;
        return;
      }

      // Near an agent chip: drift that chip toward the center.
      let bestEl: HTMLButtonElement | null = null;
      let bestProx = 0;
      for (const el of itemRefs.current.values()) {
        const ir = el.getBoundingClientRect();
        const cx = ir.left + ir.width / 2;
        const cy = ir.top + ir.height / 2;
        const dist = Math.hypot(x - cx, y - cy);
        const proximity = Math.max(0, 1 - dist / PROXIMITY_RADIUS);
        if (proximity > bestProx) {
          bestProx = proximity;
          bestEl = el;
        }
      }

      if (!bestEl || bestProx < 0.2) {
        scrollDirRef.current = 0;
        return;
      }

      const ir = bestEl.getBoundingClientRect();
      const itemCenter = ir.left + ir.width / 2;
      const trackCenter = rect.left + rect.width / 2;
      const offset = itemCenter - trackCenter;

      if (Math.abs(offset) < 6) {
        scrollDirRef.current = 0;
        return;
      }

      scrollDirRef.current =
        Math.sign(offset) *
        Math.min(MAX_SCROLL_SPEED * bestProx, Math.abs(offset) * 0.12);
    };

    const onMouseMove = (e: MouseEvent) => {
      setProximityStyles(e.clientX, e.clientY);
      scrollFromPointer(e.clientX, e.clientY);
    };

    const onMouseLeave = () => {
      scrollDirRef.current = 0;
      clearProximity();
    };

    let touchStartX = 0;
    let touchStartY = 0;

    const onTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
    };

    const onTouchEnd = (e: TouchEvent) => {
      const touch = e.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - touchStartX;
      const dy = touch.clientY - touchStartY;
      if (Math.abs(dx) < SWIPE_THRESHOLD) return;
      if (Math.abs(dy) > Math.abs(dx) * 0.75) return;

      const idx = agentIds.indexOf(selectedId);
      if (idx < 0) return;

      if (dx < 0 && idx < agentIds.length - 1) {
        onSelect(agentIds[idx + 1]!);
      } else if (dx > 0 && idx > 0) {
        onSelect(agentIds[idx - 1]!);
      }
    };

    track.addEventListener("mousemove", onMouseMove);
    track.addEventListener("mouseleave", onMouseLeave);
    track.addEventListener("touchstart", onTouchStart, { passive: true });
    track.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      cancelAnimationFrame(rafRef.current);
      track.removeEventListener("mousemove", onMouseMove);
      track.removeEventListener("mouseleave", onMouseLeave);
      track.removeEventListener("touchstart", onTouchStart);
      track.removeEventListener("touchend", onTouchEnd);
    };
  }, [agentIds, onSelect, selectedId]);

  return { trackRef, registerItem };
}
