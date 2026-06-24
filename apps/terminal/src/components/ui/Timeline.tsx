import type { ReactNode } from "react";
import { Box } from "ink";

interface TimelineProps {
  children: ReactNode;
}

export function Timeline({ children }: TimelineProps) {
  return (
    <Box flexDirection="column" marginTop={1}>
      {children}
    </Box>
  );
}

export function TimelineDetail({ children }: { children: ReactNode }) {
  return (
    <Box flexDirection="column" paddingLeft={4} marginBottom={1}>
      {children}
    </Box>
  );
}
