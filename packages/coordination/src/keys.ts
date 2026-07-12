import type { RedisClientType } from "redis";

export type RelayRedisClient = RedisClientType;

export const LEASE_KEY_PREFIX = "relay:lease:";
export const CANCEL_CHANNEL_PREFIX = "relay:cancel:";
export const CANCEL_FLAG_PREFIX = "relay:cancel-flag:";
export const SESSION_ADMISSION_KEY_PREFIX = "relay:admission:";

export function leaseKey(sessionId: string): string {
  return `${LEASE_KEY_PREFIX}${sessionId}`;
}

export function cancelChannel(workerId: string): string {
  return `${CANCEL_CHANNEL_PREFIX}${workerId}`;
}

export function cancelFlagKey(sessionId: string): string {
  return `${CANCEL_FLAG_PREFIX}${sessionId}`;
}

export function sessionAdmissionKey(sessionId: string): string {
  return `${SESSION_ADMISSION_KEY_PREFIX}${sessionId}`;
}
