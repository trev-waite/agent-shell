import { useReducer, useEffect, useState, useCallback, useRef } from "react";
import { render, Box, Text, useInput, useApp } from "ink";
import { createClient } from "@relay/sdk";
import { ChatPanel } from "./components/ChatPanel.js";
import { TracePanel } from "./components/TracePanel.js";
import { MetricsPanel } from "./components/MetricsPanel.js";
import { AnimationContext } from "./hooks/useAnimationFrame.js";
import { uiReducer, initialState } from "./state.js";

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

function App() {
  const [state, dispatch] = useReducer(uiReducer, initialState);
  const [animFrame, setAnimFrame] = useState(0);
  const { exit } = useApp();
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setAnimFrame((f) => f + 1);
    }, 100);
    return () => clearInterval(interval);
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
      sessionIdRef.current = sessionId;
      dispatch({ type: "SET_SESSION", sessionId });

      const replayUnsub = client.replay({
        sessionId,
        onEvent: (event) => dispatch({ type: "EVENT", event }),
        onComplete: () => subscribeToSession(sessionId),
      });

      return () => replayUnsub();
    }
  }, [subscribeToSession]);

  useEffect(() => {
    return () => unsubscribeRef.current?.();
  }, []);

  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === "c")) {
      exit();
      return;
    }

    if (key.return) {
      const prompt = state.input.trim();
      if (!prompt) return;

      if (state.serverOnline === false) {
        dispatch({ type: "SET_INPUT", input: state.input });
        return;
      }

      dispatch({ type: "SET_INPUT", input: "" });

      client.send({ prompt }).then(({ sessionId }) => {
        sessionIdRef.current = sessionId;
        dispatch({ type: "SET_SESSION", sessionId });
        subscribeToSession(sessionId);
      }).catch(() => {
        dispatch({ type: "SET_SERVER_ONLINE", online: false });
      });
      return;
    }

    if (key.backspace || key.delete) {
      dispatch({ type: "SET_INPUT", input: state.input.slice(0, -1) });
      return;
    }

    if (input && !key.ctrl && !key.meta) {
      dispatch({ type: "SET_INPUT", input: state.input + input });
    }
  });

  return (
    <AnimationContext.Provider value={animFrame}>
      <Box flexDirection="column" height="100%">
        <Box marginBottom={1}>
          <Text bold color="white">
            Relay Terminal
          </Text>
          {state.sessionId && (
            <Text dimColor> — session {state.sessionId.slice(0, 8)}</Text>
          )}
        </Box>

        {state.serverOnline === false && (
          <Box marginBottom={1}>
            <Text color="red">
              Runtime server offline — start with: bun run dev:server
            </Text>
          </Box>
        )}

        <ChatPanel messages={state.messages} />

        <Box flexDirection="row" marginTop={1}>
          <TracePanel traces={state.traces} />
          <MetricsPanel
            metrics={state.metrics}
            serverOnline={state.serverOnline}
            streamConnected={state.streamConnected}
            hasSession={state.sessionId !== null}
          />
        </Box>

        <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
          <Text color="green">{"> "}</Text>
          <Text>{state.input}</Text>
          <Text dimColor>_</Text>
        </Box>

        <Box marginTop={1}>
          <Text dimColor>Enter to send · Esc/Ctrl+C to exit (runtime keeps running)</Text>
        </Box>
      </Box>
    </AnimationContext.Provider>
  );
}

render(<App />, { stdin: process.stdin, stdout: process.stdout, stderr: process.stderr });
