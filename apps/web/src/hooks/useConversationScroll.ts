import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ChatMessage } from "../state";

const LIVE_EDGE_THRESHOLD = 48;
/** Space above a new user turn so prior context stays visible (rules 4–6). */
const NEW_TURN_TOP_OFFSET = 72;

export function useConversationScroll(messages: ChatMessage[]) {
  const containerRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef(new Map<string, HTMLElement>());
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const prevLengthRef = useRef(messages.length);
  const lastContentSigRef = useRef("");
  const isFollowingRef = useRef(false);
  const programmaticScrollRef = useRef(false);
  const didInitialScrollRef = useRef(false);

  const registerMessageRef = useCallback(
    (id: string, el: HTMLElement | null) => {
      if (el) messageRefs.current.set(id, el);
      else messageRefs.current.delete(id);
    },
    [],
  );

  const isNearLiveEdge = useCallback(() => {
    const el = containerRef.current;
    if (!el) return true;
    return (
      el.scrollHeight - el.scrollTop - el.clientHeight <= LIVE_EDGE_THRESHOLD
    );
  }, []);

  const syncFollowState = useCallback(() => {
    const atEdge = isNearLiveEdge();
    isFollowingRef.current = atEdge;
    if (atEdge) setShowJumpToLatest(false);
    return atEdge;
  }, [isNearLiveEdge]);

  const afterLayout = useCallback((fn: () => void) => {
    requestAnimationFrame(() => requestAnimationFrame(fn));
  }, []);

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = "auto") => {
      const el = containerRef.current;
      if (!el) return;
      programmaticScrollRef.current = true;
      el.scrollTo({ top: el.scrollHeight, behavior });
      afterLayout(() => {
        programmaticScrollRef.current = false;
        syncFollowState();
      });
    },
    [afterLayout, syncFollowState],
  );

  const placeNewTurn = useCallback(
    (messageId: string) => {
      const container = containerRef.current;
      const messageEl = messageRefs.current.get(messageId);
      if (!container || !messageEl) return;
      programmaticScrollRef.current = true;
      const top = messageEl.offsetTop - NEW_TURN_TOP_OFFSET;
      container.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      afterLayout(() => {
        programmaticScrollRef.current = false;
        syncFollowState();
      });
    },
    [afterLayout, syncFollowState],
  );

  const scrollToLatest = useCallback(() => {
    scrollToBottom("smooth");
  }, [scrollToBottom]);

  const stopFollowing = useCallback(() => {
    isFollowingRef.current = false;
  }, []);

  const hasLiveContentBelow = useCallback(() => {
    return messages.some(
      (m) =>
        m.role === "assistant" ||
        m.role === "tool" ||
        (m.streaming ?? false),
    );
  }, [messages]);

  const maybeShowJump = useCallback(() => {
    afterLayout(() => {
      if (!isNearLiveEdge() && hasLiveContentBelow()) {
        setShowJumpToLatest(true);
      } else {
        syncFollowState();
      }
    });
  }, [afterLayout, isNearLiveEdge, hasLiveContentBelow, syncFollowState]);

  // Pin to latest before first paint when opening a thread (no mid-screen flash).
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el || messages.length === 0 || didInitialScrollRef.current) return;
    el.scrollTop = el.scrollHeight;
    didInitialScrollRef.current = true;
    isFollowingRef.current = true;
  }, [messages.length]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => {
      if (programmaticScrollRef.current) return;
      syncFollowState();
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [syncFollowState]);

  useEffect(() => {
    const onSelectionChange = () => {
      const sel = document.getSelection();
      if (!sel || sel.isCollapsed) return;
      const container = containerRef.current;
      if (!container) return;
      if (
        container.contains(sel.anchorNode) ||
        container.contains(sel.focusNode)
      ) {
        stopFollowing();
        maybeShowJump();
      }
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, [stopFollowing, maybeShowJump]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) {
        stopFollowing();
        maybeShowJump();
      }
    };
    el.addEventListener("wheel", onWheel, { passive: true });
    return () => el.removeEventListener("wheel", onWheel);
  }, [stopFollowing, maybeShowJump]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const scrollKeys = ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home"];
      if (!scrollKeys.includes(e.key)) return;
      const target = e.target as Node;
      if (!el.contains(target)) return;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      stopFollowing();
      maybeShowJump();
    };
    el.addEventListener("keydown", onKeyDown);
    return () => el.removeEventListener("keydown", onKeyDown);
  }, [stopFollowing, maybeShowJump]);

  useEffect(() => {
    const prev = prevLengthRef.current;
    const next = messages.length;
    if (next > prev) {
      const added = messages.slice(prev);
      const newUser = added.find((m) => m.role === "user" && m.local);
      if (newUser) {
        afterLayout(() => placeNewTurn(newUser.id));
      } else if (isNearLiveEdge()) {
        scrollToBottom("smooth");
      } else {
        maybeShowJump();
      }
    }
    prevLengthRef.current = next;
  }, [
    messages,
    placeNewTurn,
    scrollToBottom,
    isNearLiveEdge,
    maybeShowJump,
    afterLayout,
  ]);

  const isStreaming = messages.some((m) => m.streaming);

  const contentSig = messages
    .map((m) => `${m.id}:${m.content.length}:${m.toolStatus ?? ""}`)
    .join("|");

  useEffect(() => {
    if (contentSig === lastContentSigRef.current) return;
    lastContentSigRef.current = contentSig;

    afterLayout(() => {
      if (isNearLiveEdge()) {
        scrollToBottom("auto");
      } else if (hasLiveContentBelow()) {
        setShowJumpToLatest(true);
      }
    });
  }, [contentSig, scrollToBottom, isNearLiveEdge, hasLiveContentBelow, afterLayout]);

  return {
    containerRef,
    registerMessageRef,
    showJumpToLatest,
    scrollToLatest,
    isStreaming,
  };
}
