import type { Metrics } from "../state.js";
import { formatCost, formatTokens } from "../utils/format.js";

export function formatHeaderUsage(metrics: Metrics): string {
  const tokens = formatTokens(metrics.inputTokens + metrics.outputTokens);
  const cost = formatCost(metrics.totalCost, metrics.currency);
  return `${tokens} tok · ${cost} (est)`;
}
