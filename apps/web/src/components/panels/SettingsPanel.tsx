import type { ModelsResponse } from "@relay/sdk";
import type { ThemePreference } from "../../theme";

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "Auto" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function SettingsPanel({
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
    <div className="drawer-body">
      <header className="drawer-header">
        <h2 className="drawer-title">Settings</h2>
        <p className="drawer-lead">Appearance and default agent.</p>
      </header>

      <section className="drawer-section">
        <h3 className="drawer-section-title">Appearance</h3>
        <div className="segmented" role="group" aria-label="Theme">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className="segmented-option"
              aria-pressed={themePreference === option.value}
              onClick={() => onThemeChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section className="drawer-section">
        <h3 className="drawer-section-title">Default agent</h3>
        {enabledProviders.length === 0 && (
          <p className="drawer-empty">Models unavailable right now.</p>
        )}
        {enabledProviders.map((provider) => (
          <div key={provider.id} className="model-provider">
            <p className="model-provider-label">{provider.label}</p>
            <ul className="model-list">
              {provider.models.map((model) => {
                const selected = selectedModel === model.id;
                return (
                  <li key={model.id}>
                    <button
                      type="button"
                      className="model-row"
                      data-selected={selected ? "" : undefined}
                      aria-pressed={selected}
                      onClick={() => onModelChange(model.id)}
                    >
                      {model.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
