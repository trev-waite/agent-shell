import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { motion, AnimatePresence } from "motion/react";
import type { ModelsResponse } from "@relay/sdk";
import { keepPillInputFocused } from "../lib/pillInput";
import {
  PILL_SPRING,
  RAIL_SPRING_COLLAPSE,
  RAIL_SPRING_EXPAND,
} from "../lib/motion";
import type { ThemePreference } from "../theme";
import { InputOptionsTray } from "./InputOptionsTray";

/** Grey settings cap that peeks out to the left of the pill. */
const RAIL_VISIBLE = 40;

export type PromptPillOptions = {
  themePreference: ThemePreference;
  onThemeChange: (preference: ThemePreference) => void;
  models: ModelsResponse | null;
  selectedModel: string;
  onModelChange: (model: string) => void;
};

function SettingsPlusIcon() {
  return (
    <svg
      className="pill-settings-icon"
      viewBox="0 0 16 16"
      width={16}
      height={16}
      aria-hidden="true"
    >
      <path
        d="M8 4.25v7.5M4.25 8h7.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SendArrowIcon() {
  return (
    <svg
      className="pill-send-icon"
      viewBox="0 0 16 16"
      width={18}
      height={18}
      aria-hidden="true"
    >
      <path
        d="M8 12.5V3.5M8 3.5L4.5 7M8 3.5l3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

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
  options,
}: {
  onSubmit: (prompt: string) => void;
  busy?: boolean;
  /** When false, send stays enabled during busy (composer rapid-fire). */
  blockWhileBusy?: boolean;
  layoutId?: string;
  layoutTransition?: { type: "spring"; stiffness: number; damping: number };
  autoFocus?: boolean;
  placeholder?: string;
  options?: PromptPillOptions;
}) {
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const stackRef = useRef<HTMLDivElement>(null);

  const expanded = focused || hovered || menuOpen;

  useEffect(() => {
    const stack = stackRef.current;
    if (!stack) return;

    const syncFocused = () => {
      const isFocused = stack.matches(":focus-within");
      setFocused(isFocused);
      if (!isFocused) setMenuOpen(false);
    };

    syncFocused();
    stack.addEventListener("focusin", syncFocused);
    stack.addEventListener("focusout", syncFocused);
    return () => {
      stack.removeEventListener("focusin", syncFocused);
      stack.removeEventListener("focusout", syncFocused);
    };
  }, []);

  const handleStackMouseLeave = (e: ReactMouseEvent<HTMLDivElement>) => {
    const related = e.relatedTarget;
    if (related instanceof Node && stackRef.current?.contains(related)) {
      return;
    }
    setHovered(false);
    if (!stackRef.current?.matches(":focus-within")) {
      setMenuOpen(false);
    }
  };

  useEffect(() => {
    if (!menuOpen) return;

    const closeMenu = () => setMenuOpen(false);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target;
      if (target instanceof Node && stackRef.current?.contains(target)) return;
      closeMenu();
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [menuOpen]);

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
        className="pill-send"
        type="submit"
        aria-label="Send"
        disabled={(blockWhileBusy && busy) || value.trim() === ""}
      >
        <SendArrowIcon />
      </button>
    </form>
  );

  if (options === undefined) {
    return layoutId !== undefined ? (
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
  }

  const railTransition = expanded ? RAIL_SPRING_EXPAND : RAIL_SPRING_COLLAPSE;

  const stack = (
    <>
      <div className="pill-assembly">
        <motion.div
          className="pill-rail-popout"
          layout={false}
          initial={false}
          transition={railTransition}
          animate={{ x: expanded ? -RAIL_VISIBLE : 0 }}
          aria-hidden={!expanded}
        >
          <div className="pill-rail-tab">
            <button
              type="button"
              className="pill-settings-btn"
              aria-label="Settings"
              aria-expanded={menuOpen}
              aria-haspopup="dialog"
              onMouseDown={keepPillInputFocused}
              onClick={() => setMenuOpen((open) => !open)}
              tabIndex={expanded ? 0 : -1}
            >
              <SettingsPlusIcon />
            </button>
          </div>
        </motion.div>
        <div className="pill">{form}</div>
      </div>
      <AnimatePresence>
        {menuOpen && expanded && (
          <motion.div
            className="pill-settings-menu"
            role="dialog"
            aria-label="Input settings"
            onMouseDown={keepPillInputFocused}
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={RAIL_SPRING_EXPAND}
          >
            <InputOptionsTray
              themePreference={options.themePreference}
              onThemeChange={options.onThemeChange}
              models={options.models}
              selectedModel={options.selectedModel}
              onModelChange={(model) => {
                options.onModelChange(model);
                setMenuOpen(false);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );

  if (layoutId !== undefined) {
    return (
      <motion.div
        ref={stackRef}
        className="pill-stack"
        layoutId={layoutId}
        transition={layoutTransition ?? PILL_SPRING}
        data-expanded={expanded ? "" : undefined}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={handleStackMouseLeave}
      >
        {stack}
      </motion.div>
    );
  }

  return (
    <div
      ref={stackRef}
      className="pill-stack"
      data-expanded={expanded ? "" : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={handleStackMouseLeave}
    >
      {stack}
    </div>
  );
}
