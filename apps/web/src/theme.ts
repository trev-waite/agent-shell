/**
 * Theme resolution: system preference by default, with an explicit
 * light/dark override persisted to localStorage. The resolved theme is
 * applied as a class on <html> so tokens.css can switch every token at once
 * and Safari 26 always samples an explicit root background color.
 */

export type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "relay-theme";
const darkQuery = () => window.matchMedia("(prefers-color-scheme: dark)");

export function getThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // storage unavailable (private mode etc.) — fall through to system
  }
  return "system";
}

export function resolveTheme(preference: ThemePreference): "light" | "dark" {
  if (preference === "system") {
    return darkQuery().matches ? "dark" : "light";
  }
  return preference;
}

export function applyTheme(preference: ThemePreference): void {
  const resolved = resolveTheme(preference);
  const root = document.documentElement;
  root.classList.toggle("theme-dark", resolved === "dark");
  root.classList.toggle("theme-light", resolved === "light");
}

export function setThemePreference(preference: ThemePreference): void {
  try {
    if (preference === "system") {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, preference);
    }
  } catch {
    // non-fatal: theme still applies for this visit
  }
  applyTheme(preference);
}

/** Re-applies the theme when the system scheme changes (only in system mode). */
export function watchSystemTheme(
  getPreference: () => ThemePreference,
): () => void {
  const query = darkQuery();
  const onChange = () => {
    if (getPreference() === "system") applyTheme("system");
  };
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
