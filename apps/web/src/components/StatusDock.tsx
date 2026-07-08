import type { AgentOrbStatus } from "../lib/orbStatus";
import { AgentOrb } from "./AgentOrb";

/** Compact status pill showing the agent orb. */
export function StatusDock({ status = "idle" }: { status?: AgentOrbStatus }) {
  return (
    <div className="status-dock">
      <div className="status-dock-inner">
        <AgentOrb status={status} size={56} />
      </div>
    </div>
  );
}
