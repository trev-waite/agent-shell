import { motion } from "motion/react";
import type { Turn } from "../state";
import {
  getActivityStatusLabel,
  getAssistantReply,
  hasStreamingAssistant,
  isTurnInFlight,
} from "../state";
import { FADE_IN, MESSAGE_SPRING, restoreItemVariants } from "../lib/motion";
import { ThinkingIndicator } from "./ThinkingIndicator";

function fadeForDepth(depth: number, isActive: boolean): number {
  if (isActive) return 1;
  return Math.max(0.12, 0.55 - depth * 0.14);
}

export function ComposerTurnRow({
  turn,
  depth,
  isActive,
  onOpen,
  entry = "none",
}: {
  turn: Turn;
  depth: number;
  isActive: boolean;
  onOpen: (sessionId: string) => void;
  /** restore = fade in on return from conversation; new = submit entry; none = already visible */
  entry?: "restore" | "new" | "none";
}) {
  const opacity = fadeForDepth(depth, isActive);
  const statusLabel = getActivityStatusLabel(turn.activity);
  const showThinking =
    isActive &&
    statusLabel !== null &&
    turn.activity.phase !== "tool" &&
    !hasStreamingAssistant(turn.messages);
  const reply = getAssistantReply(turn);
  const inFlight = isTurnInFlight(turn);
  const streaming = hasStreamingAssistant(turn.messages);
  const canOpen = turn.sessionId !== null;

  const queuedPreview =
    !isActive &&
    (reply && !inFlight
      ? reply.length > 56
        ? `${reply.slice(0, 56)}…`
        : reply
      : inFlight
        ? `${turn.activity.label ?? "thinking"}…`
        : turn.status === "error"
          ? "Couldn't reach the agent"
          : null);

  const motionProps =
    entry === "restore"
      ? { variants: restoreItemVariants(opacity) }
      : entry === "new"
        ? {
            initial: { opacity: 0, y: 10 } as const,
            animate: { opacity, y: 0 } as const,
            transition: isActive
              ? MESSAGE_SPRING
              : { duration: 0.22, ease: FADE_IN.ease },
          }
        : {
            initial: false as const,
            animate: { opacity, y: 0 } as const,
            transition: { duration: 0.2, ease: FADE_IN.ease },
          };

  return (
    <motion.div
      className={`composer-turn${isActive ? " composer-turn-active" : " composer-turn-queued"}`}
      {...motionProps}
    >
      <button
        type="button"
        className="composer-turn-hit"
        disabled={!canOpen}
        onClick={() => turn.sessionId !== null && onOpen(turn.sessionId)}
        aria-label={canOpen ? `Open thread: ${turn.prompt}` : undefined}
        aria-busy={isActive && inFlight}
      >
        <p
          className={
            isActive
              ? "composer-turn-prompt composer-turn-prompt-active"
              : "composer-turn-prompt"
          }
        >
          {turn.prompt}
        </p>

        {queuedPreview && (
          <span className="composer-turn-preview">{queuedPreview}</span>
        )}

        {showThinking && (
          <div className="composer-turn-thinking">
            <ThinkingIndicator label={statusLabel} />
          </div>
        )}

        {isActive && turn.activity.phase === "tool" && statusLabel && (
          <p className="composer-turn-tool">{statusLabel}…</p>
        )}

        {isActive && reply && !inFlight && !streaming && (
          <motion.p
            className="composer-turn-reply"
            initial={entry === "none" ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={MESSAGE_SPRING}
          >
            {reply}
          </motion.p>
        )}

        {isActive && streaming && (
          <p className="composer-turn-reply composer-turn-reply-streaming">
            {turn.messages.find((m) => m.role === "assistant" && m.streaming)
              ?.content ?? ""}
          </p>
        )}

        {isActive && turn.status === "error" && !reply && (
          <p className="composer-turn-error">Couldn't reach the agent.</p>
        )}
      </button>
    </motion.div>
  );
}
