import type { RelayEvent } from "@relay/types";

export interface RelayClientOptions {
  baseUrl?: string;
}

export interface SendOptions {
  prompt: string;
  /** Provider model id (e.g. gemini-3.1-flash-lite). Validated server-side per provider. */
  model?: string;
  /** Continue an existing session with a follow-up message instead of starting a new one. */
  sessionId?: string;
}

export interface ProviderModelsInfo {
  id: string;
  label: string;
  enabled: boolean;
  default?: string;
  models: readonly { id: string; label: string }[];
}

export interface ModelsResponse {
  providers: readonly ProviderModelsInfo[];
}

export interface SubscribeOptions {
  sessionId: string;
  lastEventId?: string;
  onEvent: (event: RelayEvent) => void;
  onConnect?: () => void;
  onError?: (error: Error) => void;
  onClose?: () => void;
}

export interface ReplayOptions {
  sessionId: string;
  onEvent: (event: RelayEvent) => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
}

export interface CheckpointInfo {
  checkpointId: string;
  label?: string;
  timestamp: number;
  iteration?: number;
}

export interface RerunOptions {
  sessionId: string;
  checkpointId?: string;
  model?: string;
}

export interface RelayClient {
  send(opts: SendOptions): Promise<{ sessionId: string }>;
  listModels(): Promise<ModelsResponse>;
  listCheckpoints(sessionId: string): Promise<{ checkpoints: CheckpointInfo[] }>;
  rerun(opts: RerunOptions): Promise<{ sessionId: string }>;
  cancel(sessionId: string): Promise<void>;
  subscribe(opts: SubscribeOptions): () => void;
  replay(opts: ReplayOptions): () => void;
}

const DEFAULT_BASE_URL = "http://localhost:4310";

export function createClient(opts: RelayClientOptions = {}): RelayClient {
  const baseUrl = opts.baseUrl ?? process.env.RELAY_URL ?? DEFAULT_BASE_URL;

  return {
    async send(options: SendOptions): Promise<{ sessionId: string }> {
      const url = options.sessionId
        ? `${baseUrl}/sessions/${options.sessionId}/messages`
        : `${baseUrl}/sessions`;

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: options.prompt,
          ...(options.model !== undefined ? { model: options.model } : {}),
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to send prompt: ${response.status} ${text}`);
      }

      return response.json() as Promise<{ sessionId: string }>;
    },

    async listModels(): Promise<ModelsResponse> {
      const response = await fetch(`${baseUrl}/models`);
      if (!response.ok) {
        throw new Error(`Failed to list models: ${response.status}`);
      }
      return response.json() as Promise<ModelsResponse>;
    },

    async listCheckpoints(sessionId: string): Promise<{ checkpoints: CheckpointInfo[] }> {
      const response = await fetch(`${baseUrl}/sessions/${sessionId}/checkpoints`);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to list checkpoints: ${response.status} ${text}`);
      }
      return response.json() as Promise<{ checkpoints: CheckpointInfo[] }>;
    },

    async rerun(options: RerunOptions): Promise<{ sessionId: string }> {
      const response = await fetch(`${baseUrl}/sessions/${options.sessionId}/rerun`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(options.checkpointId !== undefined ? { checkpointId: options.checkpointId } : {}),
          ...(options.model !== undefined ? { model: options.model } : {}),
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to rerun session: ${response.status} ${text}`);
      }

      return response.json() as Promise<{ sessionId: string }>;
    },

    async cancel(sessionId: string): Promise<void> {
      const response = await fetch(`${baseUrl}/sessions/${sessionId}/cancel`, {
        method: "POST",
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to cancel session: ${response.status} ${text}`);
      }
    },

    subscribe(options: SubscribeOptions): () => void {
      const abortController = new AbortController();
      let lastEventId = options.lastEventId;

      const connect = async () => {
        try {
          const headers: Record<string, string> = {
            Accept: "text/event-stream",
          };
          if (lastEventId) {
            headers["Last-Event-ID"] = lastEventId;
          }

          const url = new URL(`${baseUrl}/sessions/${options.sessionId}/events`);
          if (lastEventId) {
            url.searchParams.set("after", lastEventId);
          }

          const response = await fetch(url.toString(), {
            headers,
            signal: abortController.signal,
          });

          if (!response.ok) {
            throw new Error(`SSE connection failed: ${response.status}`);
          }

          options.onConnect?.();

          const reader = response.body?.getReader();
          if (!reader) throw new Error("No response body");

          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            let eventId: string | undefined;
            let data: string | undefined;

            for (const line of lines) {
              const trimmed = line.replace(/\r$/, "");
              if (trimmed.startsWith(":")) continue;
              if (trimmed.startsWith("id:")) {
                eventId = trimmed.slice(3).trim();
              } else if (trimmed.startsWith("data:")) {
                data = trimmed.slice(5).trim();
              } else if (trimmed === "" && data) {
                try {
                  const event = JSON.parse(data) as RelayEvent;
                  if (eventId) lastEventId = eventId;
                  options.onEvent(event);
                } catch {
                  // skip malformed events
                }
                data = undefined;
                eventId = undefined;
              }
            }
          }

          if (!abortController.signal.aborted) {
            options.onClose?.();
            setTimeout(() => connect(), 1000);
          }
        } catch (err) {
          if (!abortController.signal.aborted) {
            options.onError?.(err instanceof Error ? err : new Error(String(err)));
            setTimeout(() => connect(), 2000);
          }
        }
      };

      connect();

      return () => abortController.abort();
    },

    replay(options: ReplayOptions): () => void {
      const abortController = new AbortController();

      const connect = async () => {
        try {
          const response = await fetch(
            `${baseUrl}/sessions/${options.sessionId}/replay`,
            {
              headers: { Accept: "text/event-stream" },
              signal: abortController.signal,
            },
          );

          if (!response.ok) {
            throw new Error(`Replay failed: ${response.status}`);
          }

          const reader = response.body?.getReader();
          if (!reader) throw new Error("No response body");

          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            let data: string | undefined;

            for (const line of lines) {
              const trimmed = line.replace(/\r$/, "");
              if (trimmed.startsWith(":")) continue;
              if (trimmed.startsWith("data:")) {
                data = trimmed.slice(5).trim();
              } else if (trimmed === "" && data) {
                try {
                  const event = JSON.parse(data) as RelayEvent;
                  options.onEvent(event);
                } catch {
                  // skip malformed events
                }
                data = undefined;
              }
            }
          }

          options.onComplete?.();
        } catch (err) {
          if (!abortController.signal.aborted) {
            options.onError?.(err instanceof Error ? err : new Error(String(err)));
          }
        }
      };

      connect();

      return () => abortController.abort();
    },
  };
}
