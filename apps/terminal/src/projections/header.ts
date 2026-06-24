import type { Metrics } from "../state.js";
import { formatTokens } from "../utils/format.js";

export function formatHeaderUsage(metrics: Metrics): string {
  const tokens = formatTokens(metrics.inputTokens + metrics.outputTokens);
  const cost = `${metrics.totalCost.toFixed(4)} ${metrics.currency}`;
  return `${tokens} tok · ${cost}`;
}
