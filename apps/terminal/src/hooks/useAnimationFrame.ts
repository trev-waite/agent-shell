import { createContext, useContext } from "react";

export const AnimationContext = createContext(0);

export function useAnimationFrame(): number {
  return useContext(AnimationContext);
}
