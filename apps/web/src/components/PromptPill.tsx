import { useState, type FormEvent } from "react";
import { motion } from "motion/react";
import type { ModelsResponse } from "@relay/sdk";
import { PILL_SPRING } from "../lib/motion";
import type { AgentOrbStatus } from "../lib/orbStatus";
import type { ThemePreference } from "../theme";
import { AgentOrb } from "./AgentOrb";
import { InputOptionsTray } from "./InputOptionsTray";

export type PromptPillOptions = {
  themePreference: ThemePreference;
  onThemeChange: (preference: ThemePreference) => void;
  models: ModelsResponse | null;
  selectedModel: string;
  onModelChange: (model: string) => void;
};

/**
 * The rounded input pill from the mockups. When given a `layoutId` the shell
 * morphs (via motion shared layout) into the user's message bubble on entry;
 * the input itself is never part of the shared layout projection.
 */
export function PromptPill({
  onSubmit,
  busy = false,
  orbStatus = "idle",
  blockWhileBusy = true,
  layoutId,
  layoutTransition,
  autoFocus = false,
  placeholder = "",
  options,
}: {
  onSubmit: (prompt: string) => void;
  busy?: boolean;
  orbStatus?: AgentOrbStatus;
  /** When false, send stays enabled during busy (composer rapid-fire). */
  blockWhileBusy?: boolean;
  layoutId?: string;
  layoutTransition?: { type: "spring"; stiffness: number; damping: number };
  autoFocus?: boolean;
  placeholder?: string;
  options?: PromptPillOptions;
}) {
  const [value, setValue] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const prompt = value.trim();
    if (!prompt) return;
    setValue("");
    onSubmit(prompt);
  };

  const form = (
    <form className="pill-form" onSubmit={handleSubmit}>
      <input
        className="pill-input"
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-label="Message"
        enterKeyHint="send"
        autoComplete="off"
      />
      <button
        className="pill-sphere"
        type="submit"
        aria-label="Send"
        disabled={(blockWhileBusy && busy) || value.trim() === ""}
      >
        <AgentOrb status={orbStatus} size={72} />
      </button>
    </form>
  );

  const pill =
    layoutId !== undefined ? (
      <motion.div
        className="pill"
        layoutId={layoutId}
        transition={layoutTransition ?? PILL_SPRING}
      >
        {form}
      </motion.div>
    ) : (
      <div className="pill">{form}</div>
    );

  if (options === undefined) {
    return pill;
  }

  return (
    <div className="pill-stack">
      {pill}
      <div className="pill-tray">
        <InputOptionsTray
          themePreference={options.themePreference}
          onThemeChange={options.onThemeChange}
          models={options.models}
          selectedModel={options.selectedModel}
          onModelChange={options.onModelChange}
        />
      </div>
    </div>
  );
}
