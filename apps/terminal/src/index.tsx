import { useReducer, useEffect, useState, useCallback, useRef } from "react";
import type { Dispatch } from "react";
import { render, useInput, useApp } from "ink";
import { createClient } from "@relay/sdk";
import { isGeminiModelId } from "@relay/types";
import { AppShell } from "./components/AppShell.js";
import { AnimationContext } from "./hooks/useAnimationFrame.js";
import { ThemeProvider } from "./hooks/ThemeContext.js";
import { useLayoutMode } from "./hooks/useLayoutMode.js";
import { handleKey } from "./keyboard.js";
import {
  runSlashCommand,
  isSlashCommand,
} from "./commands.js";
import {
  uiReducer,
  initialState,
  type QueuedMessage,
  type UIAction,
  type UIState,
} from "./state.js";
import { isSessionBusy } from "./stateHelpers.js";

const client = createClient();

async function checkServerHealth(): Promise<boolean> {
  const baseUrl = process.env.RELAY_URL ?? "http://localhost:4310";
  try {
    const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
}

function formatSubmitError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return `Send failed: ${error.message}`;
  }
  return "Send failed — check the server and try again.";
}

function cancelServerSession(sessionId: string | null): void {
  if (!sessionId) return;
  void client.cancel(sessionId).catch(() => {
    // Session may already be idle or the server may be offline.
  });
}

function submitPrompt(
  prompt: string,
  state: UIState,
  dispatch: Dispatch<UIAction>,
  subscribeToSession: (sessionId: string, lastEventId?: string) => void,
  setSubmitPending: (pending: boolean) => void,
  restoreOnFailure?: QueuedMessage,
): void {
  setSubmitPending(true);

  const request = state.sessionId
    ? { prompt, model: state.selectedModel, sessionId: state.sessionId }
    : { prompt, model: state.selectedModel };

  client.send(request).then(({ sessionId }) => {
    dispatch({ type: "SET_SESSION", sessionId });
    subscribeToSession(sessionId, state.lastEventId ?? undefined);
  }).catch((error) => {
    if (restoreOnFailure) {
      dispatch({ type: "RESTORE_QUEUE_HEAD", item: restoreOnFailure });
    }
    dispatch({ type: "SET_COMMAND_NOTICE", message: formatSubmitError(error) });
  }).finally(() => {
    setSubmitPending(false);
  });
}

function handleInputSubmit(
  state: UIState,
  dispatch: Dispatch<UIAction>,
  subscribeToSession: (sessionId: string, lastEventId?: string) => void,
  options: {
    submitPending: boolean;
    setSubmitPending: (pending: boolean) => void;
    endSessionStream: () => void;
  },
): void {
  const prompt = state.input.trim();
  if (!prompt) return;

  if (isSlashCommand(prompt)) {
    runSlashCommand(prompt, dispatch, {
      onNewSession: () => {
        options.endSessionStream();
        cancelServerSession(state.sessionId);
      },
      menuIndex: state.slashMenuIndex,
    });
    return;
  }

  if (state.serverOnline === false) return;

  dispatch({ type: "SET_INPUT", input: "" });

  if (options.submitPending || isSessionBusy(state)) {
    dispatch({ type: "ENQUEUE_MESSAGE", prompt });
    return;
  }

  submitPrompt(prompt, state, dispatch, subscribeToSession, options.setSubmitPending);
}

function TerminalApp() {
  const [state, dispatch] = useReducer(uiReducer, initialState);
  const [animFrame, setAnimFrame] = useState(0);
  const layout = useLayoutMode();
  const { exit } = useApp();
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const submitPendingRef = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  const endSessionStream = useCallback(() => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    dispatch({ type: "SET_STREAM_CONNECTED", connected: false });
  }, []);

  const subscribeToSession = useCallback((sessionId: string, lastEventId?: string) => {
    unsubscribeRef.current?.();
    dispatch({ type: "SET_STREAM_CONNECTED", connected: false });

    const unsub = client.subscribe({
      sessionId,
      ...(lastEventId !== undefined ? { lastEventId } : {}),
      onConnect: () => dispatch({ type: "SET_STREAM_CONNECTED", connected: true }),
      onEvent: (event) => dispatch({ type: "EVENT", event }),
      onError: () => dispatch({ type: "SET_STREAM_CONNECTED", connected: false }),
      onClose: () => dispatch({ type: "SET_STREAM_CONNECTED", connected: false }),
    });

    unsubscribeRef.current = unsub;
  }, []);

  const flushMessageQueue = useCallback(() => {
    if (submitPendingRef.current) return;

    const current = stateRef.current;
    if (current.serverOnline === false) return;
    if (isSessionBusy(current)) return;
    if (current.messageQueue.length === 0) return;

    const head = current.messageQueue[0]!;
    dispatch({ type: "REMOVE_QUEUE_HEAD" });

    const snapshot = stateRef.current;
    submitPrompt(
      head.prompt,
      snapshot,
      dispatch,
      subscribeToSession,
      (pending) => {
        submitPendingRef.current = pending;
      },
      head,
    );
  }, [subscribeToSession]);

  useEffect(() => {
    flushMessageQueue();
  }, [
    state.activity,
    state.metrics.sessionStatus,
    state.messageQueue.length,
    state.serverOnline,
    flushMessageQueue,
  ]);

  useEffect(() => {
    const interval = setInterval(() => {
      setAnimFrame((f) => f + 1);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;

    client.listModels().then((response) => {
      if (!cancelled) {
        const gemini = response.providers.find((provider) => provider.id === "gemini");
        if (gemini?.default && isGeminiModelId(gemini.default)) {
          dispatch({ type: "SET_SELECTED_MODEL", model: gemini.default });
        }
      }
    }).catch(() => {
      // keep bundled default when server is offline
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      const online = await checkServerHealth();
      if (!cancelled) dispatch({ type: "SET_SERVER_ONLINE", online });
    };

    poll();
    const interval = setInterval(poll, 10_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const args = process.argv.slice(2);
    const sessionIdx = args.indexOf("--session");
    if (sessionIdx >= 0 && args[sessionIdx + 1]) {
      const sessionId = args[sessionIdx + 1]!;
      dispatch({ type: "SET_SESSION", sessionId });

      let lastReplayedEventId: string | undefined;

      const replayUnsub = client.replay({
        sessionId,
        onEvent: (event) => {
          lastReplayedEventId = event.id;
          dispatch({ type: "EVENT", event });
        },
        onComplete: () => subscribeToSession(sessionId, lastReplayedEventId),
      });

      return () => replayUnsub();
    }
  }, [subscribeToSession]);

  useEffect(() => {
    return () => unsubscribeRef.current?.();
  }, []);

  useEffect(() => {
    if (!state.commandNotice) return;
    const timeout = setTimeout(() => {
      dispatch({ type: "SET_COMMAND_NOTICE", message: null });
    }, 5000);
    return () => clearTimeout(timeout);
  }, [state.commandNotice]);

  useInput((input, key) => {
    const current = stateRef.current;
    const result = handleKey(
      input,
      key,
      {
        state: current,
        layout,
        exit,
        onNewSession: () => {
          endSessionStream();
          cancelServerSession(current.sessionId);
        },
      },
      dispatch,
    );
    if (result === "submit") {
      handleInputSubmit(current, dispatch, subscribeToSession, {
        submitPending: submitPendingRef.current,
        setSubmitPending: (pending) => {
          submitPendingRef.current = pending;
        },
        endSessionStream,
      });
    }
  });

  return (
    <ThemeProvider preference={state.colorSchemePreference}>
      <AnimationContext.Provider value={animFrame}>
        <AppShell state={state} layout={layout} />
      </AnimationContext.Provider>
    </ThemeProvider>
  );
}

render(<TerminalApp />, { stdin: process.stdin, stdout: process.stdout, stderr: process.stderr });
