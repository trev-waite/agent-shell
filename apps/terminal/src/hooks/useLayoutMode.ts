import { useMemo } from "react";
import { computeLayoutMode, type LayoutConfig } from "../theme.js";
import { useTerminalSize } from "./useTerminalSize.js";

export function useLayoutMode(): LayoutConfig {
  const { columns, rows } = useTerminalSize();

  return useMemo(
    () => computeLayoutMode(columns, rows),
    [columns, rows],
  );
}
