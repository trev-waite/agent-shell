import { useRef } from "react";

/**
 * Captures a snapshot at first render (e.g. message ids already on screen).
 * Used to skip entry animations when expanding composer → conversation.
 */
export function useMountSnapshot<T>(items: T[], getKey: (item: T) => string) {
  const keysRef = useRef<Set<string> | null>(null);
  if (keysRef.current === null) {
    keysRef.current = new Set(items.map(getKey));
  }
  return (key: string) => keysRef.current!.has(key);
}
