import type { AgentRosterEntry } from "../../lib/agentSessions";
import { useAgentCarousel } from "../../hooks/useAgentCarousel";

function threadLabel(count: number): string {
  if (count === 0) return "No threads";
  if (count === 1) return "1 thread";
  return `${count} threads`;
}

export function AgentCarousel({
  entries,
  selectedId,
  onSelect,
}: {
  entries: AgentRosterEntry[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const agentIds = entries.map((e) => e.agent.id);
  const { trackRef, registerItem } = useAgentCarousel({
    agentIds,
    selectedId,
    onSelect,
  });

  if (entries.length === 0) return null;

  return (
    <div
      ref={trackRef}
      className="agent-carousel"
      role="listbox"
      aria-label="Agents"
    >
      <div className="agent-carousel-track">
        {entries.map((entry) => {
          const selected = entry.agent.id === selectedId;
          return (
            <button
              key={entry.agent.id}
              ref={(el) => registerItem(entry.agent.id, el)}
              type="button"
              role="option"
              aria-selected={selected}
              className="agent-carousel-item"
              data-selected={selected ? "" : undefined}
              onClick={() => onSelect(entry.agent.id)}
            >
              <span className="agent-carousel-name">{entry.agent.label}</span>
              {entry.agent.providerLabel && (
                <span className="agent-carousel-provider">
                  {entry.agent.providerLabel}
                </span>
              )}
              <span className="agent-carousel-count">
                {threadLabel(entry.sessionCount)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
