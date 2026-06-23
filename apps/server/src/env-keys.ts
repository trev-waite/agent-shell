/** Env vars the server may load from the monorepo root `.env` file. */
export const ALLOWED_ENV_KEYS = new Set([
  "GEMINI_API_KEY",
  "GEMINI_MODEL",
  "RELAY_PORT",
  "RELAY_DB_PATH",
  "RELAY_URL",
]);
