import type { ModelsResponse, ProviderModelsInfo } from "@relay/sdk";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import type { ThemePreference } from "../theme";

type TrayPanel = "theme" | "model";

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "Auto" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

/** Keep focus on the input so the tray stays open while picking options. */
function keepInputFocused(e: MouseEvent) {
  e.preventDefault();
}

function refocusInput(from: EventTarget | null) {
  const stack =
    from instanceof Element ? from.closest(".pill-stack") : null;
  const input = stack?.querySelector<HTMLInputElement>(".pill-input");
  input?.focus();
}

function themeLabel(preference: ThemePreference): string {
  return THEME_OPTIONS.find((o) => o.value === preference)?.label ?? "Auto";
}

function selectedModelLabel(
  providers: readonly ProviderModelsInfo[],
  selectedModel: string,
): string {
  for (const provider of providers) {
    const model = provider.models.find((m) => m.id === selectedModel);
    if (model) return model.label;
  }
  return providers[0]?.models[0]?.label ?? "—";
}

export function InputOptionsTray({
  themePreference,
  onThemeChange,
  models,
  selectedModel,
  onModelChange,
}: {
  themePreference: ThemePreference;
  onThemeChange: (preference: ThemePreference) => void;
  models: ModelsResponse | null;
  selectedModel: string;
  onModelChange: (model: string) => void;
}) {
  const [openPanel, setOpenPanel] = useState<TrayPanel | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stack = sheetRef.current?.closest(".pill-stack");
    if (!stack) return;
    const resetIfClosed = () => {
      requestAnimationFrame(() => {
        if (!stack.matches(":focus-within")) setOpenPanel(null);
      });
    };
    stack.addEventListener("focusout", resetIfClosed);
    return () => stack.removeEventListener("focusout", resetIfClosed);
  }, []);

  const enabledProviders =
    models?.providers.filter((p) => p.enabled && p.models.length > 0) ?? [];

  const togglePanel = (panel: TrayPanel) => {
    setOpenPanel((current) => (current === panel ? null : panel));
  };

  return (
    <div ref={sheetRef} className="pill-tray-sheet">
      <section
        className="pill-tray-field pill-tray-field-theme"
        data-open={openPanel === "theme" ? "" : undefined}
      >
        <button
          type="button"
          className="pill-tray-field-head"
          aria-expanded={openPanel === "theme"}
          onMouseDown={keepInputFocused}
          onClick={() => togglePanel("theme")}
        >
          <span className="pill-tray-field-label">Theme</span>
          <span className="pill-tray-field-value">
            {themeLabel(themePreference)}
          </span>
        </button>
        <div className="pill-tray-field-body" role="group" aria-label="Theme">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className="pill-tray-choice"
              aria-pressed={themePreference === option.value}
              data-selected={themePreference === option.value ? "" : undefined}
              onMouseDown={keepInputFocused}
              onClick={(e) => {
                onThemeChange(option.value);
                setOpenPanel(null);
                refocusInput(e.currentTarget);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section
        className="pill-tray-field pill-tray-field-model"
        data-open={openPanel === "model" ? "" : undefined}
      >
        <button
          type="button"
          className="pill-tray-field-head"
          aria-expanded={openPanel === "model"}
          onMouseDown={keepInputFocused}
          onClick={() => togglePanel("model")}
        >
          <span className="pill-tray-field-label">Agent</span>
          <span className="pill-tray-field-value">
            {enabledProviders.length > 0
              ? selectedModelLabel(enabledProviders, selectedModel)
              : "Unavailable"}
          </span>
        </button>
        <div className="pill-tray-field-body">
          {enabledProviders.length === 0 ? (
            <p className="pill-tray-muted">Models unavailable right now.</p>
          ) : (
            enabledProviders.map((provider) => (
              <div key={provider.id} className="pill-tray-provider">
                <span className="pill-tray-provider-label">{provider.label}</span>
                <div
                  className="pill-tray-provider-models"
                  role="listbox"
                  aria-label={`${provider.label} models`}
                >
                  {provider.models.map((model) => (
                    <button
                      key={model.id}
                      type="button"
                      role="option"
                      className="pill-tray-choice"
                      aria-selected={selectedModel === model.id}
                      data-selected={
                        selectedModel === model.id ? "" : undefined
                      }
                      onMouseDown={keepInputFocused}
                      onClick={(e) => {
                        onModelChange(model.id);
                        setOpenPanel(null);
                        refocusInput(e.currentTarget);
                      }}
                    >
                      {model.label}
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
