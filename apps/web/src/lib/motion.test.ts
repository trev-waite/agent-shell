import { describe, expect, test } from "bun:test";
import {
  openFadeDelay,
  openFadeTransition,
  restoreCascadeDuration,
  restoreItemVariants,
} from "./motion";

describe("openFadeDelay", () => {
  test("staggers by index with a cap", () => {
    expect(openFadeDelay(0)).toBe(0);
    expect(openFadeDelay(1)).toBe(0.04);
    expect(openFadeDelay(4)).toBe(0.16);
    expect(openFadeDelay(10)).toBe(0.16);
  });
});

describe("openFadeTransition", () => {
  test("includes fade timing and delay", () => {
    expect(openFadeTransition(2)).toEqual({
      duration: 0.3,
      ease: [0.32, 0.72, 0.24, 1],
      delay: 0.08,
    });
  });
});

describe("restoreItemVariants", () => {
  test("targets depth-based opacity on visible state", () => {
    const variants = restoreItemVariants(0.41);
    expect(variants.hidden).toEqual({ opacity: 0, y: 16 });
    expect(variants.visible.opacity).toBe(0.41);
    expect(variants.visible.y).toBe(0);
  });
});

describe("restoreCascadeDuration", () => {
  test("covers delay, stagger, and item duration", () => {
    expect(restoreCascadeDuration(1)).toBeCloseTo(0.05 + 0.38 + 0.05, 5);
    expect(restoreCascadeDuration(3)).toBeCloseTo(0.05 + 2 * 0.11 + 0.38 + 0.05, 5);
    expect(restoreCascadeDuration(0)).toBeCloseTo(0.05 + 0.38 + 0.05, 5);
  });
});
