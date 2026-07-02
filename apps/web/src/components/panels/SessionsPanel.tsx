import { useEffect, useState } from "react";
import type { Session } from "@relay/types";
import type { ModelsResponse } from "@relay/sdk";
import { relayClient } from "../../client";
import { getAllSessionMeta } from "../../lib/sessionMeta";
import {
  buildAgentRoster,
  formatSessionWhen,
  listAgents,
  sessionsForAgent,
} from "../../lib/agentSessions";
import { AgentCarousel } from "./AgentCarousel";

export function SessionsPanel({
  currentSessionId,
  activeModelId,
  models,
  refreshKey = 0,
  onSelectSession,
  onSelectAgent,
}: {
  currentSessionId: string | null;
  activeModelId: string;
  models: ModelsResponse | null;
  refreshKey?: number;
  onSelectSession: (sessionId: string, prompt?: string) => void;
  onSelectAgent: (modelId: string) => void;
}) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewAgentId, setViewAgentId] = useState(activeModelId);

  useEffect(() => {
    setViewAgentId(activeModelId);
  }, [activeModelId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    relayClient
      .listSessions()
      .then((data) => {
        if (!cancelled) setSessions(data);
      })
      .catch(() => {
        if (!cancelled) setSessions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const meta = getAllSessionMeta();
  const agents = listAgents(models);
  const roster = buildAgentRoster(agents, sessions, meta, activeModelId);

  const effectiveViewId = roster.some((e) => e.agent.id === viewAgentId)
    ? viewAgentId
    : (roster[0]?.agent.id ?? activeModelId);

  const visibleSessions = sessionsForAgent(
    sessions,
    meta,
    effectiveViewId,
    agents,
  );

  const handleAgentSelect = (id: string) => {
    setViewAgentId(id);
    if (id !== "__unassigned__") onSelectAgent(id);
  };

  return (
    <div className="drawer-body">
      <header className="drawer-header drawer-header-compact">
        <h2 className="drawer-title">Sessions</h2>
      </header>

      {!loading && roster.length > 0 && (
        <AgentCarousel
          entries={roster}
          selectedId={effectiveViewId}
          onSelect={handleAgentSelect}
        />
      )}

      {loading && <p className="drawer-empty">Loading…</p>}

      {!loading && roster.length === 0 && (
        <p className="drawer-empty">No agents available.</p>
      )}

      {!loading && roster.length > 0 && (
        <section className="session-panel-section">
          {visibleSessions.length === 0 ? (
            <p className="drawer-empty">No threads yet.</p>
          ) : (
            <ul className="session-list">
              {visibleSessions.map((session) => {
                const isCurrent = session.id === currentSessionId;
                return (
                  <li key={session.id}>
                    <button
                      type="button"
                      className="session-row"
                      data-current={isCurrent ? "" : undefined}
                      onClick={() =>
                        onSelectSession(
                          session.id,
                          session.prompt,
                        )
                      }
                    >
                      <span className="session-preview">
                        {session.prompt.length > 72
                          ? `${session.prompt.slice(0, 72)}…`
                          : session.prompt}
                      </span>
                      <span className="session-when">
                        {formatSessionWhen(session.createdAt)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
