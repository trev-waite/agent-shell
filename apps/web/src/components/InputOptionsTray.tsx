import type { ModelsResponse, ProviderModelsInfo } from "@relay/sdk";
import { keepPillInputFocused, refocusPillInput } from "../lib/pillInput";
import type { ThemePreference } from "../theme";

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "Auto" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

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
  const enabledProviders =
    models?.providers.filter((p) => p.enabled && p.models.length > 0) ?? [];

  return (
    <>
      <div className="pill-settings-section" role="group" aria-label="Theme">
        <div className="pill-settings-theme-row">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className="pill-settings-choice"
              aria-pressed={themePreference === option.value}
              data-selected={themePreference === option.value ? "" : undefined}
              onMouseDown={keepPillInputFocused}
              onClick={(e) => {
                onThemeChange(option.value);
                refocusPillInput(e.currentTarget);
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
                onModelChange={onModelChange}
              />
            ))}
          </div>
        )}
      </div>
    </>
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
            onMouseDown={keepPillInputFocused}
            onClick={() => onModelChange(model.id)}
          >
            {model.label}
          </button>
        ))}
      </div>
    </div>
  );
}
