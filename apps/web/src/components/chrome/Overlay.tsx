import { useEffect, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";

/**
 * The only sanctioned way to render panels, drawers, and modals.
 *
 * Safari 26 Liquid Glass samples hidden fixed elements (even at opacity: 0
 * with pointer-events: none), so closed overlays must not exist in the render
 * tree at all. AnimatePresence fully unmounts children when `open` is false —
 * the React equivalent of `display: none`.
 *
 * `layer="behind"` renders drawers beneath the elevated main surface instead
 * of sliding over it. See apps/web/docs/SAFARI_CHROME.md.
 */
export function Overlay({
  open,
  onClose,
  panelClassName,
  backdropClassName,
  origin = "center",
  label,
  layer = "front",
  children,
}: {
  open: boolean;
  onClose: () => void;
  panelClassName: string;
  backdropClassName?: string;
  /** Transform style for the organic expand animation. */
  origin?: "center" | "top-right" | "left" | "right";
  label: string;
  /** Behind-layer drawers sit under the elevated main page card. */
  layer?: "front" | "behind";
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const panelTransition =
    layer === "behind"
      ? { duration: 0.32, ease: [0.32, 0.72, 0.24, 1] as const }
      : { type: "spring" as const, stiffness: 380, damping: 32 };

  const panelMotion =
    origin === "left"
      ? {
          initial: { x: "-100%" },
          animate: { x: 0 },
          exit: { x: "-100%" },
        }
      : origin === "right"
        ? {
            initial: { x: "100%" },
            animate: { x: 0 },
            exit: { x: "100%" },
          }
        : {
            initial: { opacity: 0, scale: 0.86 },
            animate: { opacity: 1, scale: 1 },
            exit: { opacity: 0, scale: 0.92 },
            style: {
              transformOrigin:
                origin === "top-right" ? "top right" : "center center",
            },
          };

  return (
    <AnimatePresence>
      {open && (
        <>
          {layer !== "behind" && (
            <motion.div
              className={[
                "overlay-backdrop",
                backdropClassName,
              ]
                .filter(Boolean)
                .join(" ")}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.32, 0.72, 0.24, 1] }}
              onClick={onClose}
            />
          )}
          <motion.div
            className={[
              "overlay-panel",
              panelClassName,
              layer === "behind" ? "overlay-panel-behind" : undefined,
            ]
              .filter(Boolean)
              .join(" ")}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            {...panelMotion}
            transition={panelTransition}
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
