import { useState } from "react";
import type { ChatMessage } from "../state";
import { toolOutputIsExpandable } from "../lib/formatTool";

/**
 * Muted, collapsed tool output in the transcript. A few lines by default;
 * tap to expand when there is more.
 */
export function ToolOutput({ message }: { message: ChatMessage }) {
  const [expanded, setExpanded] = useState(false);
  const running = message.toolStatus === "running";
  const content = message.content.trim();
  const hasContent = content.length > 0;
  const expandable = !running && hasContent && toolOutputIsExpandable(content);

  const body = running ? (
    <span className="message-tool-body message-tool-running">
      {hasContent ? content : "Running…"}
    </span>
  ) : hasContent ? (
    <>
      <pre className="message-tool-output">{content}</pre>
      {expandable && (
        <span className="message-tool-hint">
          {expanded ? "Show less" : "Show more"}
        </span>
      )}
    </>
  ) : null;

  if (expandable) {
    return (
      <button
        type="button"
        className="message-tool"
        data-expanded={expanded ? "" : undefined}
        data-expandable=""
        aria-expanded={expanded}
        onClick={() => setExpanded((open) => !open)}
      >
        <span className="message-tool-name">{message.toolName}</span>
        {body}
      </button>
    );
  }

  return (
    <div
      className="message-tool"
      data-running={running ? "" : undefined}
      aria-busy={running || undefined}
    >
      <span className="message-tool-name">{message.toolName}</span>
      {body}
    </div>
  );
}
