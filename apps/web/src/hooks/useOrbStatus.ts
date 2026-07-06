import { useEffect, useRef, useState } from "react";
import type { Turn } from "../state";
import { deriveOrbStatus, type AgentOrbStatus } from "../lib/orbStatus";

const SUCCESS_FLASH_MS = 1500;

export function useOrbStatus(turn: Turn | undefined): AgentOrbStatus {
  const [flashSuccess, setFlashSuccess] = useState(false);
  const prevStatusRef = useRef(turn?.status);
  const prevLocalIdRef = useRef(turn?.localId);

  useEffect(() => {
    if (turn === undefined) {
      prevLocalIdRef.current = undefined;
      prevStatusRef.current = undefined;
      setFlashSuccess(false);
      return;
    }

    if (turn.localId !== prevLocalIdRef.current) {
      prevLocalIdRef.current = turn.localId;
      prevStatusRef.current = turn.status;
      setFlashSuccess(false);
      return;
    }

    const prevStatus = prevStatusRef.current;
    prevStatusRef.current = turn.status;

    if (
      turn.status === "complete" &&
      prevStatus !== undefined &&
      prevStatus !== "complete"
    ) {
      setFlashSuccess(true);
      const timer = setTimeout(() => setFlashSuccess(false), SUCCESS_FLASH_MS);
      return () => clearTimeout(timer);
    }
  }, [turn]);

  if (flashSuccess) return "success";
  return deriveOrbStatus(turn);
}
