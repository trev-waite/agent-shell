export function formatTimestamp(ms: number): string {
  const date = new Date(ms);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(2)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}m ${String(secs).padStart(2, "0")}s`;
}

/** Latency metrics (TTFT, response time) — cap millisecond precision to 2 decimal places. */
export function formatLatencyMs(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(2)}ms`;
  return formatDuration(ms);
}

export function formatTokens(n: number): string {
  return n.toLocaleString("en-US");
}

export function formatTokPerSec(value: number): string {
  if (value < 10) return `${value.toFixed(1)} t/s`;
  return `${Math.round(value)} t/s`;
}

/** Display cost with enough precision for sub-cent API usage. */
export function formatCost(totalCost: number, currency: string): string {
  if (totalCost === 0) return `0.0000 ${currency}`;
  if (totalCost < 0.0001) return `${totalCost.toFixed(6)} ${currency}`;
  return `${totalCost.toFixed(4)} ${currency}`;
}

export function formatJson(value: unknown, maxCols: number): string {
  let text: string;
  try {
    text = JSON.stringify(value, null, 2);
  } catch {
    text = String(value);
  }
  if (text.length <= maxCols) return text;
  return text.slice(0, Math.max(0, maxCols - 1)) + "…";
}

export function formatToolInputOneLine(input: unknown, maxCols: number): string {
  if (input === undefined || input === null) return "—";
  let text: string;
  if (typeof input === "string") {
    text = input.trim();
  } else {
    try {
      text = JSON.stringify(input);
    } catch {
      text = String(input);
    }
  }
  if (text.length <= maxCols) return text;
  return text.slice(0, Math.max(0, maxCols - 1)) + "…";
}

export function formatTraceResult(output: unknown): string {
  if (output === null || output === undefined) return "—";
  if (typeof output === "string") {
    const trimmed = output.trim();
    if (trimmed.length <= 60) return trimmed;
    return trimmed.slice(0, 59) + "…";
  }
  if (typeof output === "number") return String(output);
  if (typeof output === "boolean") return output ? "true" : "false";
  if (Array.isArray(output)) return `${output.length} items`;
  if (typeof output === "object") {
    const record = output as Record<string, unknown>;
    if ("rows" in record && typeof record.rows === "number") {
      return `${record.rows} rows`;
    }
    if ("count" in record && typeof record.count === "number") {
      return `${record.count} results`;
    }
    const keys = Object.keys(record);
    return keys.length > 0 ? `{ ${keys.slice(0, 3).join(", ")} }` : "{}";
  }
  return String(output);
}

export function truncateToWidth(text: string, maxCols: number): string {
  const singleLine = text.replace(/\s+/g, " ").trim();
  if (singleLine.length <= maxCols) return singleLine;
  return singleLine.slice(0, Math.max(0, maxCols - 1)) + "…";
}
