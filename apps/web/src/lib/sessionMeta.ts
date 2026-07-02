const STORAGE_KEY = "relay-session-meta";

export interface SessionMetaEntry {
  modelId: string;
  updatedAt: number;
}

type MetaMap = Record<string, SessionMetaEntry>;

function load(): MetaMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as MetaMap;
  } catch {
    return {};
  }
}

function save(map: MetaMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Storage may be unavailable in private mode.
  }
}

export function recordSessionModel(sessionId: string, modelId: string): void {
  const map = load();
  map[sessionId] = { modelId, updatedAt: Date.now() };
  save(map);
}

export function getSessionModel(sessionId: string): string | null {
  return load()[sessionId]?.modelId ?? null;
}

export function getAllSessionMeta(): MetaMap {
  return load();
}
