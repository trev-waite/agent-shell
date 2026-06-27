import type { ActivityStatus, Metrics } from "../state.js";

export type StatusDotVariant = "success" | "active" | "error" | "warning" | "muted";

export interface FooterStatus {
  label: string;
  dotVariant: StatusDotVariant;
}

export function deriveFooterStatus(
  metrics: Metrics,
  activity: ActivityStatus | null,
  serverOnline: boolean | null,
): FooterStatus {
  if (serverOnline === false) {
    return { label: "OFFLINE", dotVariant: "error" };
  }

  if (serverOnline === null) {
    return { label: "CHECKING", dotVariant: "warning" };
  }

  if (activity !== null || metrics.sessionStatus === "running") {
    return { label: "RUNNING", dotVariant: "active" };
  }

  if (metrics.sessionStatus === "failed") {
    return { label: "FAILED", dotVariant: "error" };
  }

  if (metrics.sessionStatus === "completed") {
    return { label: "DONE", dotVariant: "success" };
  }

  return { label: "READY", dotVariant: "success" };
}
