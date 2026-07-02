import { useState, type FormEvent } from "react";
import { motion } from "motion/react";
import { PILL_SPRING } from "../lib/motion";
import { DitherSphere } from "./DitherSphere";

/**
 * The rounded input pill from the mockups. When given a `layoutId` the shell
 * morphs (via motion shared layout) into the user's message bubble on entry;
 * the input itself is never part of the shared layout projection.
 */
export function PromptPill({
  onSubmit,
  busy = false,
  blockWhileBusy = true,
  layoutId,
  layoutTransition,
  autoFocus = false,
  placeholder = "",
}: {
  onSubmit: (prompt: string) => void;
  busy?: boolean;
  /** When false, send stays enabled during busy (composer rapid-fire). */
  blockWhileBusy?: boolean;
  layoutId?: string;
  layoutTransition?: { type: "spring"; stiffness: number; damping: number };
  autoFocus?: boolean;
  placeholder?: string;
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
        <DitherSphere busy={busy} size={72} />
      </button>
    </form>
  );

  if (layoutId !== undefined) {
    return (
      <motion.div
        className="pill"
        layoutId={layoutId}
        transition={layoutTransition ?? PILL_SPRING}
      >
        {form}
      </motion.div>
    );
  }

  return <div className="pill">{form}</div>;
}
