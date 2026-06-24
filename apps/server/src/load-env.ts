import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ALLOWED_ENV_KEYS } from "./env-keys.js";

/** Walk up from this file to find and load allowed keys from the monorepo root `.env`. */
export function loadMonorepoEnv(): void {
  let dir = dirname(fileURLToPath(import.meta.url));

  for (let i = 0; i < 8; i++) {
    const envPath = resolve(dir, ".env");
    if (existsSync(envPath)) {
      applyEnvFile(envPath);
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
}

function applyEnvFile(envPath: string): void {
  const content = readFileSync(envPath, "utf8");

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    if (!ALLOWED_ENV_KEYS.has(key)) continue;

    let value = trimmed.slice(eq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
