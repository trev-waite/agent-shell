import { motion } from "motion/react";
import type { AgentOrbStatus } from "../lib/orbStatus";
import { PILL_SPRING } from "../lib/motion";
import { AgentOrb } from "./AgentOrb";

export const STATUS_DOCK_LAYOUT_ID = "status-dock";

/** Compact status pill showing the agent orb. */
export function StatusDock({
  status = "idle",
  layoutId,
  layoutTransition,
}: {
  status?: AgentOrbStatus;
  layoutId?: string;
  layoutTransition?: { type: "spring"; stiffness: number; damping: number };
}) {
  const inner = (
    <div className="status-dock-inner">
      <AgentOrb status={status} size={56} />
    </div>
  );

  if (layoutId !== undefined) {
    return (
      <motion.div
        className="status-dock"
        layoutId={layoutId}
        transition={layoutTransition ?? PILL_SPRING}
      >
        {inner}
      </motion.div>
    );
  }

  return <div className="status-dock">{inner}</div>;
}
