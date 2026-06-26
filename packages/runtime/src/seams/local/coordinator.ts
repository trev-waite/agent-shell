import type { SessionCoordinator, SessionLease } from "@relay/types";

export interface LocalSessionCoordinatorOptions {
  /** Invoked by routeCancel — wire to runtime.cancel in the composition root. */
  onCancel?: (sessionId: string) => void;
}

/** Local adapter — in-memory leases. Remote: `packages/coordination` (Redis/etcd). */
export function createLocalSessionCoordinator(
  opts: LocalSessionCoordinatorOptions = {},
): SessionCoordinator {
  const leases = new Map<string, SessionLease>();

  function pruneExpired(sessionId: string): void {
    const lease = leases.get(sessionId);
    if (lease && lease.expiresAt <= Date.now()) {
      leases.delete(sessionId);
    }
  }

  return {
    async acquireLease(sessionId, workerId, ttlMs): Promise<boolean> {
      pruneExpired(sessionId);
      if (leases.has(sessionId)) {
        return false;
      }
      leases.set(sessionId, {
        sessionId,
        workerId,
        expiresAt: Date.now() + ttlMs,
      });
      return true;
    },

    async renewLease(sessionId, workerId, ttlMs): Promise<boolean> {
      pruneExpired(sessionId);
      const existing = leases.get(sessionId);
      if (!existing || existing.workerId !== workerId) {
        return false;
      }
      leases.set(sessionId, {
        sessionId,
        workerId,
        expiresAt: Date.now() + ttlMs,
      });
      return true;
    },

    async releaseLease(sessionId, workerId): Promise<void> {
      const existing = leases.get(sessionId);
      if (existing?.workerId === workerId) {
        leases.delete(sessionId);
      }
    },

    async resolveOwner(sessionId): Promise<string | null> {
      pruneExpired(sessionId);
      return leases.get(sessionId)?.workerId ?? null;
    },

    async routeCancel(sessionId): Promise<void> {
      opts.onCancel?.(sessionId);
    },

    async getActiveSessions(): Promise<string[]> {
      const now = Date.now();
      const active: string[] = [];
      for (const [sessionId, lease] of leases) {
        if (lease.expiresAt > now) {
          active.push(sessionId);
        } else {
          leases.delete(sessionId);
        }
      }
      return active;
    },
  };
}
