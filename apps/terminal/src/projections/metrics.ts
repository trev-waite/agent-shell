import type { LayoutMode } from "../theme.js";
import type { Metrics, ToolTrace } from "../state.js";
import { formatCost, formatDuration, formatTokens } from "../utils/format.js";

export type MetricColorKey = "text" | "status" | "motion" | "error";

export interface MetricCellData {
  id: string;
  label: string;
  value: string;
  colorKey: MetricColorKey;
}

export function buildMetricsGrid(
  metrics: Metrics,
  traces: ToolTrace[],
  sessionStartedAt: number | null,
  sessionEndedAt: number | null,
  layoutMode: LayoutMode,
  now: number = Date.now(),
): MetricCellData[] {
  const totalTimeMs =
    sessionStartedAt !== null
      ? (sessionEndedAt ?? now) - sessionStartedAt
      : 0;

  const allCells: MetricCellData[] = [
    {
      id: "total-time",
      label: "TOTAL TIME",
      value: sessionStartedAt !== null ? formatDuration(totalTimeMs) : "—",
      colorKey: "text",
    },
    {
      id: "tokens",
      label: "TOKENS",
      value: formatTokens(metrics.inputTokens + metrics.outputTokens),
      colorKey: "text",
    },
    {
      id: "tool-calls",
      label: "TOOL CALLS",
      value: String(traces.length),
      colorKey: "text",
    },
    {
      id: "status",
      label: "STATUS",
      value: metrics.sessionStatus.toUpperCase(),
      colorKey: statusColorKey(metrics.sessionStatus),
    },
    {
      id: "input",
      label: "INPUT",
      value: formatTokens(metrics.inputTokens),
      colorKey: "text",
    },
    {
      id: "output",
      label: "OUTPUT",
      value: formatTokens(metrics.outputTokens),
      colorKey: "text",
    },
    {
      id: "cost",
      label: "COST",
      value: formatCost(metrics.totalCost, metrics.currency),
      colorKey: "text",
    },
  ];

  if (layoutMode === "compact") {
    return allCells.filter((c) =>
      ["total-time", "tokens", "status", "cost"].includes(c.id),
    );
  }

  if (layoutMode === "medium") {
    return allCells.filter((c) => c.id !== "input" && c.id !== "output");
  }

  return allCells;
}

function statusColorKey(status: string): MetricColorKey {
  if (status === "running") return "motion";
  if (status === "completed") return "status";
  if (status === "failed") return "error";
  return "text";
}
