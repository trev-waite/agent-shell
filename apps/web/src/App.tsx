import { useCallback, useEffect, useReducer, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import type { ModelsResponse } from "@relay/sdk";
import "./index.css";
import { relayClient } from "./client";
import {
  appReducer,
  createLocalId,
  getTurnBySessionId,
  initialAppState,
  isTurnInFlight,
} from "./state";
import {
  applyTheme,
  getThemePreference,
  setThemePreference,
  watchSystemTheme,
  type ThemePreference,
} from "./theme";
import { getSessionModel, recordSessionModel } from "./lib/sessionMeta";
import { useTurnFleet } from "./hooks/useTurnFleet";
import { FADE_IN, PILL_SPRING } from "./lib/motion";
import { ChromeSafeFixed } from "./components/chrome/ChromeSafeFixed";
import { PromptPill } from "./components/PromptPill";
import { Conversation } from "./components/Conversation";
import { ComposerStage } from "./components/ComposerStage";
import { ComposerMessageStack } from "./components/ComposerMessageStack";
import { EdgePanels } from "./components/EdgePanels";
import { EdgeHandles } from "./components/EdgeHandles";
import { useSidePanels } from "./hooks/useSidePanels";

const PILL_LAYOUT_ID = "prompt-pill";

function agentReachError(err: unknown): string {
  return err instanceof Error
    ? `Couldn't reach the agent. ${err.message}`
    : "Couldn't reach the agent.";
}

export function App() {
  const [state, dispatch] = useReducer(appReducer, initialAppState);
  const [themePreference, setThemePref] = useState<ThemePreference>(() =>
    getThemePreference(),
  );
  const [models, setModels] = useState<ModelsResponse | null>(null);
  const [sessionsRefreshKey, setSessionsRefreshKey] = useState(0);

  useTurnFleet(state, dispatch);

  const isComposer = state.viewMode === "composer";

  useEffect(() => {
    applyTheme(themePreference);
    return watchSystemTheme(() => themePreference);
  }, [themePreference]);

  useEffect(() => {
    relayClient
      .listModels()
      .then(setModels)
      .catch(() => setModels(null));
  }, []);

  const handleThemeChange = useCallback((preference: ThemePreference) => {
    setThemePreference(preference);
    setThemePref(preference);
  }, []);

  const handleComposerSend = useCallback(
    async (prompt: string) => {
      const localId = createLocalId();
      dispatch({ type: "SUBMIT_TURN", prompt, localId });
      try {
        const { sessionId } = await relayClient.send({
          prompt,
          model: state.selectedModel,
        });
        recordSessionModel(sessionId, state.selectedModel);
        dispatch({ type: "TURN_SET_SESSION", localId, sessionId });
        setSessionsRefreshKey((k) => k + 1);
      } catch (err) {
        dispatch({
          type: "TURN_SEND_FAILED",
          localId,
          message: agentReachError(err),
        });
      }
    },
    [state.selectedModel],
  );

  const handleConversationSend = useCallback(
    async (prompt: string) => {
      const sessionId = state.focusedSessionId;
      if (sessionId === null) return;

      const localId = createLocalId();
      dispatch({ type: "CONVERSATION_PROMPT", prompt, localId });
      try {
        await relayClient.send({
          prompt,
          model: state.selectedModel,
          sessionId,
        });
      } catch (err) {
        dispatch({
          type: "CONVERSATION_SEND_FAILED",
          sessionId,
          message: agentReachError(err),
        });
      }
    },
    [state.focusedSessionId, state.selectedModel],
  );

  const handleOpenConversation = useCallback((sessionId: string) => {
    dispatch({ type: "OPEN_CONVERSATION", sessionId });
  }, []);

  const handleCloseConversation = useCallback(() => {
    dispatch({ type: "CLOSE_CONVERSATION" });
  }, []);

  const handleSelectSession = useCallback(
    (sessionId: string, prompt?: string) => {
      const model = getSessionModel(sessionId);
      if (model) dispatch({ type: "SET_MODEL", model });
      dispatch({
        type: "OPEN_CONVERSATION",
        sessionId,
        ...(prompt !== undefined ? { prompt } : {}),
      });
    },
    [],
  );

  const focusedTurn =
    state.focusedSessionId !== null
      ? getTurnBySessionId(state, state.focusedSessionId)
      : undefined;

  const conversationBusy =
    focusedTurn !== undefined && isTurnInFlight(focusedTurn);

  const activeTurn = state.turns[0];
  const composerBusy =
    activeTurn !== undefined && isTurnInFlight(activeTurn);

  const currentSessionId =
    state.viewMode === "conversation"
      ? state.focusedSessionId
      : (state.turns.find((t) => t.sessionId !== null)?.sessionId ?? null);

  const {
    panel,
    close: closePanel,
    toggleSessions,
    toggleSettings,
    sessionsOpen,
    settingsOpen,
  } = useSidePanels();

  return (
    <LayoutGroup>
      <div className="shell">
        <div
          className="shell-content"
          data-app-content
          data-panel-open={panel !== "none" ? panel : undefined}
        >
          <EdgeHandles
            sessionsOpen={sessionsOpen}
            settingsOpen={settingsOpen}
            onToggleSessions={toggleSessions}
            onToggleSettings={toggleSettings}
          />
          <div className="shell-content-surface">
            {isComposer ? (
              <div className="composer-view">
                <ComposerStage hasTurns={state.turns.length > 0} />
              </div>
            ) : (
              <div className="conversation-view">
                <motion.button
                  type="button"
                  className="conversation-back"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={FADE_IN}
                  onClick={handleCloseConversation}
                >
                  Back
                </motion.button>
                {focusedTurn && (
                  <Conversation
                    key={state.focusedSessionId ?? "pending"}
                    messages={focusedTurn.messages}
                    activity={focusedTurn.activity}
                  />
                )}
              </div>
            )}
          </div>

          <AnimatePresence>
            {isComposer && state.turns.length > 0 && (
              <motion.div
                key="composer-messages"
                className="composer-messages-layer"
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: FADE_IN.ease }}
              >
                <ComposerMessageStack
                  turns={state.turns}
                  onOpen={handleOpenConversation}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {isComposer && (
            <div className="composer-pill-slot">
              <PromptPill
                layoutId={PILL_LAYOUT_ID}
                onSubmit={handleComposerSend}
                busy={composerBusy}
                blockWhileBusy={false}
                autoFocus
                layoutTransition={PILL_SPRING}
              />
            </div>
          )}

          {!isComposer && (
            <ChromeSafeFixed
              edge="bottom"
              surface={<div className="dock-veil" />}
            >
              <div className="dock-row">
                <PromptPill
                  layoutId={PILL_LAYOUT_ID}
                  onSubmit={handleConversationSend}
                  busy={conversationBusy}
                  autoFocus
                  layoutTransition={PILL_SPRING}
                />
              </div>
            </ChromeSafeFixed>
          )}
        </div>

        <EdgePanels
          currentSessionId={currentSessionId}
          activeModelId={state.selectedModel}
          models={models}
          themePreference={themePreference}
          onThemeChange={handleThemeChange}
          onModelChange={(model) => dispatch({ type: "SET_MODEL", model })}
          onSelectSession={handleSelectSession}
          onSelectAgent={(model) => dispatch({ type: "SET_MODEL", model })}
          sessionsRefreshKey={sessionsRefreshKey}
          close={closePanel}
          sessionsOpen={sessionsOpen}
          settingsOpen={settingsOpen}
        />
      </div>
    </LayoutGroup>
  );
}

export default App;
