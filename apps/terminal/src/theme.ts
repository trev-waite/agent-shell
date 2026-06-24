export type ColorScheme = "dark" | "light";
export type ColorSchemePreference = "auto" | ColorScheme;

export type ThemeColorKey = "text" | "muted" | "border" | "status" | "motion" | "error" | "warning" | "user" | "agent";

export interface Theme {
  text: string;
  muted: string;
  border: string;
  status: string;
  motion: string;
  user: string;
  agent: string;
  error: string;
  warning: string;
}

/** Earthy accent palette — orange (#CB7A5C) intentionally excluded. */
export const palette = {
  olive: "#757F64",
  cream: "#E9E2D8",
  sage: "#C7CDBF",
  slate: "#5C757A",
} as const;

export const darkTheme: Theme = {
  text: "#e8e8e8",
  muted: "gray",
  border: "gray",
  status: palette.olive,
  motion: palette.cream,
  user: palette.sage,
  agent: palette.slate,
  error: "red",
  warning: "gray",
};

export const lightTheme: Theme = {
  text: "#2a2a2a",
  muted: "gray",
  border: "gray",
  status: palette.olive,
  motion: palette.slate,
  user: palette.olive,
  agent: palette.slate,
  error: "red",
  warning: "gray",
};

export function resolveTheme(scheme: ColorScheme): Theme {
  return scheme === "light" ? lightTheme : darkTheme;
}

export const COMPACT_BREAKPOINT = 50;
export const HINT_BREAKPOINT = 60;
export const SESSION_ID_BREAKPOINT = 100;

export type LayoutMode = "wide" | "medium" | "compact";

export interface LayoutConfig {
  mode: LayoutMode;
  columns: number;
  rows: number;
  showTraceJson: boolean;
  metricsColumns: 2 | 3;
  showSessionId: boolean;
}

export function computeLayoutMode(columns: number, rows: number): LayoutConfig {
  if (columns < COMPACT_BREAKPOINT) {
    return {
      mode: "compact",
      columns,
      rows,
      showTraceJson: false,
      metricsColumns: 2,
      showSessionId: false,
    };
  }

  if (columns < HINT_BREAKPOINT) {
    return {
      mode: "medium",
      columns,
      rows,
      showTraceJson: false,
      metricsColumns: 2,
      showSessionId: false,
    };
  }

  if (columns < SESSION_ID_BREAKPOINT) {
    return {
      mode: "medium",
      columns,
      rows,
      showTraceJson: true,
      metricsColumns: 2,
      showSessionId: false,
    };
  }

  return {
    mode: "wide",
    columns,
    rows,
    showTraceJson: true,
    metricsColumns: 3,
    showSessionId: true,
  };
}
