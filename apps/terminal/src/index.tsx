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
  dispatchSlashResult,
  isSlashCommand,
  parseSlashCommand,
} from "./commands.js";
import { uiReducer, initialState, type UIAction, type UIState } from "./state.js";

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

function submitPrompt(
  prompt: string,
  state: UIState,
  dispatch: Dispatch<UIAction>,
  subscribeToSession: (sessionId: string, lastEventId?: string) => void,
): void {
  dispatch({ type: "SET_INPUT", input: "" });

  client.send({ prompt, model: state.selectedModel }).then(({ sessionId }) => {
    dispatch({ type: "SET_SESSION", sessionId });
    subscribeToSession(sessionId);
  }).catch((error) => {
    dispatch({ type: "SET_COMMAND_NOTICE", message: formatSubmitError(error) });
  });
}

function handleInputSubmit(
  state: UIState,
  dispatch: Dispatch<UIAction>,
  subscribeToSession: (sessionId: string, lastEventId?: string) => void,
): void {
  const prompt = state.input.trim();
  if (!prompt) return;

  if (isSlashCommand(prompt)) {
    const slash = parseSlashCommand(prompt);
    if (slash) dispatchSlashResult(dispatch, slash);
    return;
  }

  if (state.serverOnline === false) return;
  submitPrompt(prompt, state, dispatch, subscribeToSession);
}

function TerminalApp() {
  const [state, dispatch] = useReducer(uiReducer, initialState);
  const [animFrame, setAnimFrame] = useState(0);
  const layout = useLayoutMode();
  const { exit } = useApp();
  const unsubscribeRef = useRef<(() => void) | null>(null);

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
    const result = handleKey(input, key, { state, layout, exit }, dispatch);
    if (result === "submit") {
      handleInputSubmit(state, dispatch, subscribeToSession);
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
