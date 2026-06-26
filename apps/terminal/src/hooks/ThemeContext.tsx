import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  resolveTheme,
  type ColorScheme,
  type ColorSchemePreference,
  type Theme,
} from "../theme.js";
import { detectTerminalColorScheme } from "./useColorScheme.js";
import { useTerminalSize } from "./useTerminalSize.js";

interface ThemeContextValue {
  theme: Theme;
  scheme: ColorScheme;
  preference: ColorSchemePreference;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

interface ThemeProviderProps {
  preference: ColorSchemePreference;
  children: ReactNode;
}

export function ThemeProvider({ preference, children }: ThemeProviderProps) {
  const [detected, setDetected] = useState<ColorScheme>(() => detectTerminalColorScheme());
  const { columns } = useTerminalSize();

  useEffect(() => {
    setDetected(detectTerminalColorScheme());
  }, [columns]);

  const scheme: ColorScheme = preference === "auto" ? detected : preference;
  const theme = useMemo(() => resolveTheme(scheme), [scheme]);

  const value = useMemo(
    () => ({ theme, scheme, preference }),
    [theme, scheme, preference],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx.theme;
}

export function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useThemeContext must be used within ThemeProvider");
  }
  return ctx;
}
