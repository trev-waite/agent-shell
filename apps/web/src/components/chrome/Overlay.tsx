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
 * The backdrop deliberately avoids `backdrop-filter` (it can't reach the iOS
 * keyboard accessory gap anyway). Instead, while open, the element with
 * [data-app-content] gets `filter: blur()` applied at the source, which does
 * carry through to Safari's keyboard-gap rendering.
 *
 * See apps/web/docs/SAFARI_CHROME.md.
 */
export function Overlay({
  open,
  onClose,
  panelClassName,
  origin = "center",
  label,
  children,
}: {
  open: boolean;
  onClose: () => void;
  panelClassName: string;
  /** Transform style for the organic expand animation. */
  origin?: "center" | "top-right" | "left" | "right";
  label: string;
  children: ReactNode;
}) {
  useEffect(() => {
    const content = document.querySelector("[data-app-content]");
    if (content) content.classList.toggle("content-blurred", open);
    return () => {
      if (content) content.classList.remove("content-blurred");
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

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
          <motion.div
            className="overlay-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />
          <motion.div
            className={`overlay-panel ${panelClassName}`}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            {...panelMotion}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
