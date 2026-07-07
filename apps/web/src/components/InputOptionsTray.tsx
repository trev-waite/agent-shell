import type { ModelsResponse, ProviderModelsInfo } from "@relay/sdk";
import type { MouseEvent } from "react";
import type { ThemePreference } from "../theme";

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "Auto" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

function keepInputFocused(e: MouseEvent) {
  e.preventDefault();
}

function refocusInput(from: EventTarget | null) {
  const stack =
    from instanceof Element ? from.closest(".pill-stack") : null;
  stack?.querySelector<HTMLInputElement>(".pill-input")?.focus();
}

export function InputOptionsTray({
  themePreference,
  onThemeChange,
  models,
  selectedModel,
  onModelChange,
  onClose,
}: {
  themePreference: ThemePreference;
  onThemeChange: (preference: ThemePreference) => void;
  models: ModelsResponse | null;
  selectedModel: string;
  onModelChange: (model: string) => void;
  onClose: () => void;
}) {
  const enabledProviders =
    models?.providers.filter((p) => p.enabled && p.models.length > 0) ?? [];

  return (
    <div className="pill-settings-menu-inner">
      <div className="pill-settings-section" role="group" aria-label="Theme">
        <div className="pill-settings-theme-row">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className="pill-settings-choice"
              aria-pressed={themePreference === option.value}
              data-selected={themePreference === option.value ? "" : undefined}
              onMouseDown={keepInputFocused}
              onClick={(e) => {
                onThemeChange(option.value);
                refocusInput(e.currentTarget);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="pill-settings-section" role="group" aria-label="Model">
        {enabledProviders.length === 0 ? (
          <p className="pill-settings-muted">Unavailable</p>
        ) : (
          <div className="pill-settings-models">
            {enabledProviders.map((provider) => (
              <ProviderGroup
                key={provider.id}
                provider={provider}
                selectedModel={selectedModel}
                onModelChange={(id) => {
                  onModelChange(id);
                  onClose();
                  refocusInput(null);
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProviderGroup({
  provider,
  selectedModel,
  onModelChange,
}: {
  provider: ProviderModelsInfo;
  selectedModel: string;
  onModelChange: (id: string) => void;
}) {
  return (
    <div className="pill-settings-provider">
      <span className="pill-settings-provider-label">{provider.label}</span>
      <div
        className="pill-settings-provider-models"
        role="listbox"
        aria-label={`${provider.label} models`}
      >
        {provider.models.map((model) => (
          <button
            key={model.id}
            type="button"
            role="option"
            className="pill-settings-choice"
            aria-selected={selectedModel === model.id}
            data-selected={selectedModel === model.id ? "" : undefined}
            onMouseDown={keepInputFocused}
            onClick={() => onModelChange(model.id)}
          >
            {model.label}
          </button>
        ))}
      </div>
    </div>
  );
}
