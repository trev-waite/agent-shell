import { useEffect, useRef, type Dispatch } from "react";
import type { RelayEvent } from "@relay/types";
import { relayClient } from "../client";
import type { AppAction, AppState } from "../state";
import { isTurnInFlight } from "../state";

const COMPLETE_GRACE_MS = 5000;
const HYDRATION_TIMEOUT_MS = 15_000;

type SubEntry = {
  unsubscribe: () => void;
  graceTimer?: ReturnType<typeof setTimeout>;
  hydrationTimer?: ReturnType<typeof setTimeout>;
};

function clearGraceTimer(entry: SubEntry) {
  if (!entry.graceTimer) return;
  clearTimeout(entry.graceTimer);
  delete entry.graceTimer;
}

function clearHydrationTimer(entry: SubEntry) {
  if (!entry.hydrationTimer) return;
  clearTimeout(entry.hydrationTimer);
  delete entry.hydrationTimer;
}

function teardownEntry(
  subs: Map<string, SubEntry>,
  sessionId: string,
  entry: SubEntry,
) {
  clearGraceTimer(entry);
  clearHydrationTimer(entry);
  entry.unsubscribe();
  subs.delete(sessionId);
}

function scheduleTeardown(
  subs: Map<string, SubEntry>,
  sessionId: string,
  entry: SubEntry,
) {
  if (entry.graceTimer) return;
  entry.graceTimer = setTimeout(() => {
    teardownEntry(subs, sessionId, entry);
  }, COMPLETE_GRACE_MS);
}

function scheduleHydrationTimeout(
  dispatch: Dispatch<AppAction>,
  sessionId: string,
  entry: SubEntry,
) {
  if (entry.hydrationTimer) return;
  entry.hydrationTimer = setTimeout(() => {
    delete entry.hydrationTimer;
    dispatch({
      type: "TURN_STREAM_FAILED",
      sessionId,
      message: "Couldn't load this conversation.",
    });
  }, HYDRATION_TIMEOUT_MS);
}

/**
 * Maintains one SSE subscription per in-flight turn session so rapid-fire
 * prompts can run concurrently without blocking the composer input.
 */
export function useTurnFleet(
  state: AppState,
  dispatch: Dispatch<AppAction>,
) {
  const subsRef = useRef(new Map<string, SubEntry>());

  useEffect(() => {
    const subs = subsRef.current;
    const sessionIdsInState = new Set(
      state.turns
        .map((t) => t.sessionId)
        .filter((id): id is string => id !== null),
    );

    for (const turn of state.turns) {
      const sessionId = turn.sessionId;
      if (sessionId === null) continue;

      const entry = subs.get(sessionId);

      if (turn.messages.length > 0 && entry) {
        clearHydrationTimer(entry);
      }

      if (isTurnInFlight(turn)) {
        if (entry) {
          clearGraceTimer(entry);
        } else {
          const unsubscribe = relayClient.subscribe({
            sessionId,
            onEvent: (event: RelayEvent) => {
              const active = subs.get(sessionId);
              if (active) clearHydrationTimer(active);
              dispatch({ type: "TURN_EVENT", sessionId, event });
            },
            onConnect: () =>
              dispatch({
                type: "TURN_STREAM_CONNECTED",
                sessionId,
                connected: true,
              }),
            onError: () => {
              const active = subs.get(sessionId);
              if (active) clearHydrationTimer(active);
              dispatch({
                type: "TURN_STREAM_CONNECTED",
                sessionId,
                connected: false,
              });
              dispatch({
                type: "TURN_STREAM_FAILED",
                sessionId,
                message: "Lost connection to the agent.",
              });
            },
            onClose: () => {
              dispatch({
                type: "TURN_STREAM_CONNECTED",
                sessionId,
                connected: false,
              });
            },
          });

          const nextEntry: SubEntry = { unsubscribe };
          if (turn.messages.length === 0) {
            scheduleHydrationTimeout(dispatch, sessionId, nextEntry);
          }
          subs.set(sessionId, nextEntry);
        }
      } else if (turn.status === "complete" || turn.status === "error") {
        if (entry) scheduleTeardown(subs, sessionId, entry);
      }
    }

    for (const [sessionId, entry] of subs) {
      if (!sessionIdsInState.has(sessionId)) {
        teardownEntry(subs, sessionId, entry);
      }
    }
  }, [state.turns, dispatch]);

  useEffect(() => {
    const subs = subsRef.current;
    return () => {
      for (const [sessionId, entry] of subs) {
        teardownEntry(subs, sessionId, entry);
      }
    };
  }, []);
}
