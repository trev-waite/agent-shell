const SENSITIVE_PATTERNS = [
  /(?:api[_-]?key|apikey|secret|password|token|credential|auth)[\s]*[=:]\s*['"]?[\w-]{8,}/gi,
  /sk-[a-zA-Z0-9]{20,}/g,
  /AIza[a-zA-Z0-9_-]{30,}/g,
  /Bearer\s+[a-zA-Z0-9._-]+/gi,
  /GEMINI_API_KEY\s*=\s*\S+/gi,
  /[A-Z_]+_API_KEY\s*=\s*\S+/gi,
];

const ENV_VAR_PATTERN = /^[A-Z][A-Z0-9_]*$/;

const REDACTED = "[REDACTED]";

export function sanitize(text: string): string {
  let result = text;

  for (const pattern of SENSITIVE_PATTERNS) {
    result = result.replace(pattern, REDACTED);
  }

  const lines = result.split("\n").map((line) => {
    if (line.includes("=") && !line.startsWith("#")) {
      const [key] = line.split("=");
      if (key && ENV_VAR_PATTERN.test(key.trim())) {
        return `${key.trim()}=${REDACTED}`;
      }
    }
    return line;
  });

  return lines.join("\n");
}

export function sanitizeObject(obj: unknown): unknown {
  if (typeof obj === "string") return sanitize(obj);
  if (Array.isArray(obj)) return obj.map(sanitizeObject);
  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = sanitizeObject(value);
    }
    return result;
  }
  return obj;
}
