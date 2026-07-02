import { createClient } from "@relay/sdk";

// import.meta.env is inlined by Bun for BUN_PUBLIC_* vars in browser bundles
// (process.env does not exist in the browser).
export const relayBaseUrl =
  (import.meta.env?.BUN_PUBLIC_RELAY_URL as string | undefined) ??
  "http://localhost:4310";

export const relayClient = createClient({ baseUrl: relayBaseUrl });
