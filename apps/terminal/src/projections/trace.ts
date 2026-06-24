import type { ToolTrace } from "../state.js";

export type TimelineNodeType = "agent-start" | "tool" | "agent-end";

export interface TimelineNode {
  id: string;
  type: TimelineNodeType;
  label: string;
  status?: "running" | "completed" | "failed";
  startedAt?: number;
  completedAt?: number;
  input?: unknown;
  output?: unknown;
  error?: string;
}

export function buildTraceTimeline(
  traces: ToolTrace[],
  sessionStartedAt: number | null,
  sessionStatus: string,
): TimelineNode[] {
  const nodes: TimelineNode[] = [];

  if (sessionStartedAt !== null) {
    nodes.push({
      id: "agent-start",
      type: "agent-start",
      label: "Agent Start",
      startedAt: sessionStartedAt,
      status: "completed",
    });
  }

  for (const trace of traces) {
    const node: TimelineNode = {
      id: trace.id,
      type: "tool",
      label: trace.toolName,
      status: trace.status,
      startedAt: trace.startedAt,
      ...(trace.completedAt !== undefined ? { completedAt: trace.completedAt } : {}),
      ...(trace.input !== undefined ? { input: trace.input } : {}),
      ...(trace.output !== undefined ? { output: trace.output } : {}),
      ...(trace.error !== undefined ? { error: trace.error } : {}),
    };
    nodes.push(node);
  }

  if (sessionStatus === "completed" || sessionStatus === "failed") {
    const lastTrace = traces[traces.length - 1];
    const endNode: TimelineNode = {
      id: "agent-end",
      type: "agent-end",
      label: "Agent End",
      status: sessionStatus === "failed" ? "failed" : "completed",
      ...(lastTrace?.completedAt !== undefined
        ? { completedAt: lastTrace.completedAt }
        : {}),
    };
    nodes.push(endNode);
  }

  return nodes;
}

export function getFocusableTraceIds(nodes: TimelineNode[]): string[] {
  return nodes.filter((n) => n.type === "tool").map((n) => n.id);
}

export function tracesForTurn(traces: ToolTrace[], afterTimestamp: number): ToolTrace[] {
  return traces.filter((t) => t.startedAt >= afterTimestamp);
}
