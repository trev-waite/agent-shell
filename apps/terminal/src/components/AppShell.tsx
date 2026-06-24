import { Box, Text } from "ink";
import { useTheme } from "../hooks/ThemeContext.js";
import { deriveFooterStatus } from "../projections/footer.js";
import type { LayoutConfig } from "../theme.js";
import type { UIState } from "../state.js";
import { ChatPanel } from "./ChatPanel.js";
import { Footer } from "./Footer.js";
import { Header } from "./Header.js";
import { InputBox } from "./InputBox.js";
import { OverlayStack } from "./OverlayStack.js";

interface AppShellProps {
  state: UIState;
  layout: LayoutConfig;
}

export function AppShell({ state, layout }: AppShellProps) {
  const theme = useTheme();
  const footerStatus = deriveFooterStatus(
    state.metrics,
    state.activity,
    state.serverOnline,
  );

  return (
    <Box flexDirection="column" height="100%" width={layout.columns}>
      <Header
        serverOnline={state.serverOnline}
        sessionId={state.sessionId}
        metrics={state.metrics}
        layout={layout}
      />

      {state.serverOnline === false && (
        <Box marginTop={1} paddingX={1} width={layout.columns}>
          <Text color={theme.error}>
            Runtime server offline — start with: bun run dev:server
          </Text>
        </Box>
      )}

      <ChatPanel
        messages={state.messages}
        traces={state.traces}
        activity={state.activity}
        layout={layout}
      />

      <Box flexDirection="column" marginTop={4} width={layout.columns}>
        <OverlayStack state={state} layout={layout} />
        <InputBox
          value={state.input}
          layout={layout}
          selectedProviderId={state.selectedProviderId}
          selectedModel={state.selectedModel}
          notice={state.commandNotice}
        />
        <Box marginTop={1}>
          <Footer status={footerStatus} width={layout.columns} />
        </Box>
      </Box>
    </Box>
  );
}
