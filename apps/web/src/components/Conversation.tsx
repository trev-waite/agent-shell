import { motion } from "motion/react";
import type { Activity, ChatMessage } from "../state";
import { getActivityStatusLabel, hasStreamingAssistant } from "../state";
import { MESSAGE_SPRING, openFadeTransition } from "../lib/motion";
import { useConversationScroll } from "../hooks/useConversationScroll";
import { useMountSnapshot } from "../hooks/useMountSnapshot";
import { ThinkingIndicator } from "./ThinkingIndicator";
import { ToolOutput } from "./ToolOutput";

function ConversationMessage({
  message,
  index,
  animateEntry,
  registerMessageRef,
}: {
  message: ChatMessage;
  index: number;
  animateEntry: boolean;
  registerMessageRef: (id: string, el: HTMLDivElement | null) => void;
}) {
  const ref = (el: HTMLDivElement | null) => registerMessageRef(message.id, el);
  const isTool = message.role === "tool";

  if (!animateEntry) {
    return (
      <motion.div
        key={message.id}
        ref={ref}
        className={isTool ? undefined : `message-${message.role}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={openFadeTransition(index)}
      >
        {isTool ? <ToolOutput message={message} /> : message.content}
      </motion.div>
    );
  }

  return (
    <motion.div
      key={message.id}
      ref={ref}
      className={isTool ? undefined : `message-${message.role}`}
      initial={{ opacity: 0, y: isTool ? 8 : 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={isTool ? { duration: 0.2 } : MESSAGE_SPRING}
    >
      {isTool ? <ToolOutput message={message} /> : message.content}
    </motion.div>
  );
}

/**
 * Full transcript view. Entry animations run only for messages added after
 * Opening from composer: soft opacity fade in place (no y shift).
 * Follow-ups added later: fade + rise.
 */
export function Conversation({
  messages,
  activity,
}: {
  messages: ChatMessage[];
  activity: Activity;
}) {
  const wasPresentAtMount = useMountSnapshot(messages, (m) => m.id);

  const {
    containerRef,
    registerMessageRef,
    showJumpToLatest,
    scrollToLatest,
    isStreaming,
  } = useConversationScroll(messages);

  const statusLabel = getActivityStatusLabel(activity);
  const showThinking =
    statusLabel !== null &&
    activity.phase !== "tool" &&
    !hasStreamingAssistant(messages);

  return (
    <>
      <div ref={containerRef} className="conversation">
        <div className="conversation-inner">
          {messages.map((message, index) => (
            <ConversationMessage
              key={message.id}
              message={message}
              index={index}
              animateEntry={!wasPresentAtMount(message.id)}
              registerMessageRef={registerMessageRef}
            />
          ))}

          {showThinking && <ThinkingIndicator label={statusLabel} />}
        </div>
      </div>

      {showJumpToLatest && (
        <button
          type="button"
          className="jump-to-latest"
          onClick={scrollToLatest}
          aria-live="polite"
        >
          {isStreaming ? "Response streaming…" : "New messages"}
          <span className="jump-to-latest-action">Jump to latest</span>
        </button>
      )}
    </>
  );
}
