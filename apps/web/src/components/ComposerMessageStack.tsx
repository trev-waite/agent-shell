import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { RESTORE_CONTAINER, restoreCascadeDuration } from "../lib/motion";
import type { Turn } from "../state";
import { ComposerTurnRow } from "./ComposerTurnRow";

const MAX_VISIBLE = 6;
const SCROLL_EDGE = 24;

export function ComposerMessageStack({
  turns,
  onOpen,
}: {
  turns: Turn[];
  onOpen: (sessionId: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const prevTurnCountRef = useRef(turns.length);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const [softRestore, setSoftRestore] = useState(true);

  const visible = turns.slice(0, MAX_VISIBLE);
  const overflow = turns.length - MAX_VISIBLE;

  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  };

  // End restore cascade once; visible count is fixed at mount (stack only mounts with turns).
  useEffect(() => {
    const ms = restoreCascadeDuration(visible.length) * 1000;
    const t = setTimeout(() => setSoftRestore(false), ms);
    return () => clearTimeout(t);
  }, [visible.length]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onScroll = () => {
      pinnedRef.current =
        el.scrollHeight - el.scrollTop - el.clientHeight <= SCROLL_EDGE;
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (turns.length > prevTurnCountRef.current) {
      pinnedRef.current = true;
    }
    prevTurnCountRef.current = turns.length;

    if (!pinnedRef.current) return;
    requestAnimationFrame(scrollToBottom);
  }, [turns.length]);

  const rows = visible.map((turn, index) => {
    const isNew = !knownIdsRef.current.has(turn.localId);
    if (isNew) knownIdsRef.current.add(turn.localId);

    return (
      <ComposerTurnRow
        key={turn.localId}
        turn={turn}
        depth={index}
        isActive={index === 0}
        onOpen={onOpen}
        entry={softRestore ? "restore" : isNew ? "new" : "none"}
      />
    );
  });

  const innerContent = (
    <>
      {overflow > 0 && (
        <p className="composer-messages-overflow">
          {overflow} more in Sessions
        </p>
      )}
      {rows}
    </>
  );

  return (
    <div
      ref={scrollRef}
      className="composer-messages"
      aria-label="Recent messages"
      onWheel={(e) => e.stopPropagation()}
    >
      {softRestore ? (
        <motion.div
          className="composer-messages-inner"
          initial="hidden"
          animate="visible"
          variants={RESTORE_CONTAINER}
        >
          {innerContent}
        </motion.div>
      ) : (
        <div className="composer-messages-inner">{innerContent}</div>
      )}
    </div>
  );
}
