import { isTurnInFlight, type Turn } from "../state";

export type AgentOrbStatus =
  | "idle"
  | "thinking"
  | "working"
  | "error"
  | "success";

const STATUS_SPEED: Record<AgentOrbStatus, number> = {
  idle: 0.3,
  thinking: 1.0,
  working: 0.85,
  error: 1.5,
  success: 0.75,
};

const ERROR_PALETTE = ["#3b1219", "#7f1d1d", "#c41e3a", "#ff3355"];

export function deriveOrbStatus(turn: Turn | undefined): AgentOrbStatus {
  if (turn === undefined) return "idle";
  if (turn.status === "error") return "error";
  if (!isTurnInFlight(turn)) return "idle";

  if (turn.status === "sending") return "thinking";

  switch (turn.activity.phase) {
    case "tool":
    case "streaming":
      return "working";
    case "thinking":
      return "thinking";
    default:
      return "thinking";
  }
}

export function orbSpeed(status: AgentOrbStatus): number {
  return STATUS_SPEED[status];
}

function parseHex(hex: string): [number, number, number] | null {
  const normalized = hex.replace("#", "").trim();
  if (normalized.length === 3) {
    const [r, g, b] = normalized.split("");
    if (r === undefined || g === undefined || b === undefined) return null;
    return [
      parseInt(r + r, 16),
      parseInt(g + g, 16),
      parseInt(b + b, 16),
    ];
  }
  if (normalized.length !== 6) return null;
  return [
    parseInt(normalized.slice(0, 2), 16),
    parseInt(normalized.slice(2, 4), 16),
    parseInt(normalized.slice(4, 6), 16),
  ];
}

function toHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${[clamp(r), clamp(g), clamp(b)]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("")}`;
}

function mix(a: string, b: string, t: number): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (ca === null || cb === null) return a;
  return toHex(
    ca[0] + (cb[0] - ca[0]) * t,
    ca[1] + (cb[1] - ca[1]) * t,
    ca[2] + (cb[2] - ca[2]) * t,
  );
}

function accentLadder(
  accent: string,
  sphereFront: string,
  isDark: boolean,
  intensity: number,
): string[] {
  const dim = isDark ? "#1a1a1a" : "#1a2a33";
  const mid = mix(dim, accent, isDark ? 0.35 : 0.45);
  const bright = mix(accent, sphereFront, 0.35 * intensity);
  const peak = mix(accent, sphereFront, 0.65 * intensity);
  return [dim, mid, bright, peak];
}

function sanitizeHexColor(value: string, fallback: string): string {
  const candidate = value.trim().startsWith("#")
    ? value.trim()
    : `#${value.trim()}`;
  return parseHex(candidate) !== null ? candidate : fallback;
}

export function orbPalette(
  status: AgentOrbStatus,
  accent: string,
  sphereFront: string,
  isDark: boolean,
): string[] {
  const safeAccent = sanitizeHexColor(accent, "#00b2ff");
  const safeSphereFront = sanitizeHexColor(sphereFront, safeAccent);

  if (status === "error") return ERROR_PALETTE;

  switch (status) {
    case "idle":
      return accentLadder(safeAccent, safeSphereFront, isDark, 0.5);
    case "thinking":
      return accentLadder(safeAccent, safeSphereFront, isDark, 0.75);
    case "working":
      return accentLadder(safeAccent, safeSphereFront, isDark, 1);
    case "success":
      return accentLadder(safeAccent, safeSphereFront, isDark, 0.9);
    default:
      return accentLadder(safeAccent, safeSphereFront, isDark, 0.5);
  }
}
