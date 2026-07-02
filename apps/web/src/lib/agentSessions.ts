import type { Session } from "@relay/types";
import type { ModelsResponse } from "@relay/sdk";
import type { SessionMetaEntry } from "../lib/sessionMeta";

export interface AgentInfo {
  id: string;
  label: string;
  providerLabel: string;
}

export interface AgentRosterEntry {
  agent: AgentInfo;
  sessionCount: number;
  latestAt: number;
}

export function listAgents(models: ModelsResponse | null): AgentInfo[] {
  if (!models) return [];
  const agents: AgentInfo[] = [];
  for (const provider of models.providers) {
    if (!provider.enabled || provider.models.length === 0) continue;
    for (const model of provider.models) {
      agents.push({
        id: model.id,
        label: model.label,
        providerLabel: provider.label,
      });
    }
  }
  return agents;
}

function sortSessions(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) => b.createdAt - a.createdAt);
}

function resolveSessionAgentId(
  session: Session,
  meta: Record<string, SessionMetaEntry>,
  agentIds: Set<string>,
): string {
  const modelId = meta[session.id]?.modelId;
  if (modelId && agentIds.has(modelId)) return modelId;
  return "__unassigned__";
}

/** Flat thread list for one selected agent — no model grouping in the UI. */
export function sessionsForAgent(
  sessions: Session[],
  meta: Record<string, SessionMetaEntry>,
  agentId: string,
  agents: AgentInfo[],
): Session[] {
  const agentIds = new Set(agents.map((a) => a.id));
  return sortSessions(
    sessions.filter(
      (session) =>
        resolveSessionAgentId(session, meta, agentIds) === agentId,
    ),
  );
}

/** Agents for the horizontal picker: those with threads, plus the active agent. */
export function buildAgentRoster(
  agents: AgentInfo[],
  sessions: Session[],
  meta: Record<string, SessionMetaEntry>,
  activeModelId: string,
): AgentRosterEntry[] {
  const agentIds = new Set(agents.map((a) => a.id));
  const counts = new Map<string, { count: number; latestAt: number }>();

  for (const session of sessions) {
    const id = resolveSessionAgentId(session, meta, agentIds);
    const bucket = counts.get(id) ?? { count: 0, latestAt: 0 };
    bucket.count += 1;
    bucket.latestAt = Math.max(bucket.latestAt, session.createdAt);
    counts.set(id, bucket);
  }

  const roster: AgentRosterEntry[] = [];

  for (const agent of agents) {
    const bucket = counts.get(agent.id);
    if (!bucket && agent.id !== activeModelId) continue;
    roster.push({
      agent,
      sessionCount: bucket?.count ?? 0,
      latestAt: bucket?.latestAt ?? 0,
    });
  }

  const unassigned = counts.get("__unassigned__");
  if (unassigned) {
    roster.push({
      agent: { id: "__unassigned__", label: "Other", providerLabel: "" },
      sessionCount: unassigned.count,
      latestAt: unassigned.latestAt,
    });
  }

  roster.sort((a, b) => {
    if (a.latestAt !== b.latestAt) return b.latestAt - a.latestAt;
    return a.agent.label.localeCompare(b.agent.label);
  });

  if (
    activeModelId &&
    !roster.some((e) => e.agent.id === activeModelId) &&
    agents.some((a) => a.id === activeModelId)
  ) {
    const agent = agents.find((a) => a.id === activeModelId)!;
    roster.push({
      agent,
      sessionCount: 0,
      latestAt: 0,
    });
  }

  return roster;
}

export function formatSessionWhen(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (sameDay) {
    return date.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
