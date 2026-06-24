import { Box, Text } from "ink";
import { filterSlashCommands } from "../commands.js";
import { useTheme } from "../hooks/ThemeContext.js";
import type { LayoutConfig } from "../theme.js";
import { OverlayPanel } from "./ui/OverlayPanel.js";

interface SlashPaletteProps {
  input: string;
  selectedIndex: number;
  layout: LayoutConfig;
}

export function SlashPalette({ input, selectedIndex, layout }: SlashPaletteProps) {
  const theme = useTheme();
  const commands = filterSlashCommands(input);

  return (
    <OverlayPanel width={layout.columns}>
      {commands.length === 0 ? (
        <Text dimColor>No matching commands</Text>
      ) : (
        commands.map((cmd, index) => {
          const highlighted = index === selectedIndex;
          const descWidth = Math.max(12, layout.columns - cmd.name.length - 6);

          return (
            <Box key={cmd.name}>
              <Text {...(highlighted ? { inverse: true } : {})}>
                <Text color={highlighted ? theme.motion : theme.text}>
                  /{cmd.name}
                </Text>
                <Text>{" ".repeat(Math.max(1, 14 - cmd.name.length))}</Text>
                <Text dimColor={!highlighted} {...(highlighted ? {} : { color: theme.muted })}>
                  {cmd.description.slice(0, descWidth)}
                </Text>
              </Text>
            </Box>
          );
        })
      )}
    </OverlayPanel>
  );
}
