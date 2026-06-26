import { useAnimationFrame } from "../../hooks/useAnimationFrame.js";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function useSpinnerFrame(): string {
  const frame = useAnimationFrame();
  return FRAMES[frame % FRAMES.length]!;
}

export function useActivityDots(): string {
  const frame = useAnimationFrame();
  const count = (Math.floor(frame / 5) % 3) + 1;
  return ".".repeat(count);
}
