import type { ModelsResponse } from "@relay/sdk";
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
  const enabledModels =
    models?.providers
      .filter((p) => p.enabled && p.models.length > 0)
      .flatMap((p) => p.models) ?? [];

  return (
    <div className="pill-tray-inner">
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

      {enabledModels.length === 0 ? (
        <p className="pill-tray-empty">Models unavailable right now.</p>
      ) : (
        <div className="pill-model-chips" role="listbox" aria-label="Default agent">
          {enabledModels.map((model) => {
            const selected = selectedModel === model.id;
            return (
              <button
                key={model.id}
                type="button"
                role="option"
                className="pill-model-chip"
                aria-selected={selected}
                data-selected={selected ? "" : undefined}
                onClick={() => onModelChange(model.id)}
              >
                {model.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
