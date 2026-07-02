/** Default web dev origins (Bun `serve()` default port). Override via RELAY_CORS_ORIGINS. */
const DEFAULT_DEV_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

let allowedOrigins: Set<string> | null = null;

function loadAllowedOrigins(): Set<string> {
  const raw = process.env.RELAY_CORS_ORIGINS;
  if (raw?.trim()) {
    return new Set(
      raw
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    );
  }
  return new Set(DEFAULT_DEV_ORIGINS);
}

function getAllowedOrigins(): Set<string> {
  if (!allowedOrigins) {
    allowedOrigins = loadAllowedOrigins();
  }
  return allowedOrigins;
}

/** @internal Test helper */
export function resetCorsOriginsForTests(): void {
  allowedOrigins = null;
}

export function resolveCorsOrigin(
  origin: string | undefined,
): string | null {
  if (!origin) return null;
  return getAllowedOrigins().has(origin) ? origin : null;
}

/** Headers for hijacked SSE responses (bypass @fastify/cors). */
export function corsOriginHeaders(
  origin: string | undefined,
): Record<string, string> {
  const allowed = resolveCorsOrigin(origin);
  if (!allowed) return {};
  return {
    "Access-Control-Allow-Origin": allowed,
    Vary: "Origin",
  };
}
