import type { RelayEvent } from "@relay/types";

/** Decode SSE frames independently of HTTP chunk and UTF-8 byte boundaries. */
export async function readEventStream(
  response: Response,
  onEvent: (event: RelayEvent, id?: string) => void,
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");
  const decoder = new TextDecoder();
  let buffer = "";
  let eventId: string | undefined;
  let data: string[] = [];

  const acceptLine = (line: string) => {
    if (line === "") {
      const body = data.join("\n");
      const id = eventId;
      data = [];
      eventId = undefined;
      if (!body) return;
      let event: RelayEvent;
      try {
        event = JSON.parse(body) as RelayEvent;
      } catch {
        return; // Ignore malformed frames, not errors in the consumer callback.
      }
      onEvent(event, id);
      return;
    }
    if (line.startsWith(":")) return;
    const colon = line.indexOf(":");
    const field = colon < 0 ? line : line.slice(0, colon);
    let value = colon < 0 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "data") data.push(value);
    if (field === "id" && !value.includes("\0")) eventId = value;
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let start = 0;
      for (let i = 0; i < buffer.length; i++) {
        const char = buffer[i];
        if (char !== "\r" && char !== "\n") continue;
        // A CRLF pair may itself straddle two network chunks.
        if (char === "\r" && i === buffer.length - 1 && !done) break;
        acceptLine(buffer.slice(start, i));
        if (char === "\r" && buffer[i + 1] === "\n") i++;
        start = i + 1;
      }
      buffer = buffer.slice(start);
      if (done) break; // An unterminated frame is replayed after reconnect.
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
