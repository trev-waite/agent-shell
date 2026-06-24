import type { ActivityStatus, Metrics } from "../state.js";
import type { ThemeColorKey } from "../theme.js";

export interface FooterStatus {
  label: string;
  colorKey: ThemeColorKey;
}

export function deriveFooterStatus(
  metrics: Metrics,
  activity: ActivityStatus | null,
  serverOnline: boolean | null,
): FooterStatus {
  if (serverOnline === false) {
    return { label: "OFFLINE", colorKey: "error" };
  }

  if (serverOnline === null) {
    return { label: "CHECKING", colorKey: "warning" };
  }

  if (activity !== null || metrics.sessionStatus === "running") {
    return { label: "RUNNING", colorKey: "motion" };
  }

  if (metrics.sessionStatus === "failed") {
    return { label: "FAILED", colorKey: "error" };
  }

  if (metrics.sessionStatus === "completed") {
    return { label: "DONE", colorKey: "status" };
  }

  return { label: "READY", colorKey: "status" };
}
