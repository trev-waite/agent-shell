export const TASK_STREAM_KEY = "relay:tasks";
export const TASK_GROUP = "relay-workers";
export const IDEMPOTENCY_KEY_PREFIX = "relay:idempotency:";
export const SESSION_ADMISSION_KEY_PREFIX = "relay:admission:";

export function idempotencyKey(key: string): string {
  return `${IDEMPOTENCY_KEY_PREFIX}${key}`;
}

export function sessionAdmissionKey(sessionId: string): string {
  return `${SESSION_ADMISSION_KEY_PREFIX}${sessionId}`;
}
