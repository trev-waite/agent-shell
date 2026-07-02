import { describe, expect, test } from "bun:test";
import { resetCorsOriginsForTests, resolveCorsOrigin } from "./cors.js";

describe("resolveCorsOrigin", () => {
  test("allows default web dev origins", () => {
    resetCorsOriginsForTests();
    expect(resolveCorsOrigin("http://localhost:3000")).toBe(
      "http://localhost:3000",
    );
    expect(resolveCorsOrigin("http://127.0.0.1:3000")).toBe(
      "http://127.0.0.1:3000",
    );
  });

  test("rejects arbitrary localhost ports by default", () => {
    resetCorsOriginsForTests();
    expect(resolveCorsOrigin("http://localhost:5173")).toBeNull();
    expect(resolveCorsOrigin("http://127.0.0.1:4310")).toBeNull();
  });

  test("honors RELAY_CORS_ORIGINS allowlist", () => {
    process.env.RELAY_CORS_ORIGINS =
      "http://localhost:5173,http://127.0.0.1:5173";
    resetCorsOriginsForTests();
    expect(resolveCorsOrigin("http://localhost:5173")).toBe(
      "http://localhost:5173",
    );
    expect(resolveCorsOrigin("http://localhost:3000")).toBeNull();
    delete process.env.RELAY_CORS_ORIGINS;
    resetCorsOriginsForTests();
  });
});
