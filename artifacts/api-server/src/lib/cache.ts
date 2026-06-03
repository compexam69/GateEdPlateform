/**
 * Lightweight in-memory TTL cache.
 *
 * Used to reduce repeated Supabase round-trips for read-heavy endpoints
 * (e.g. /dashboard/summary, /subjects) where 30 seconds of stale data is
 * acceptable and the query cost is non-trivial.
 *
 * Not shared across Node.js workers / Pods — each process has its own store.
 * For a multi-replica deployment, replace with Redis; the API surface is the same.
 */

interface Entry<T> {
  value: T;
  expiresAt: number;
}

export class SimpleCache<T = unknown> {
  private store = new Map<string, Entry<T>>();
  private readonly ttlMs: number;

  constructor(ttlMs: number) {
    this.ttlMs = ttlMs;
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  /** Remove every key that starts with the given prefix. */
  deleteByPrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }

  /**
   * Start a periodic sweep that evicts expired entries.
   * Without this, stale keys accumulate memory until they are read.
   * Call once at server startup; keep a reference if you need to stop it.
   */
  startPrune(intervalMs = 5 * 60_000): ReturnType<typeof setInterval> {
    return setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.store.entries()) {
        if (now > entry.expiresAt) this.store.delete(key);
      }
    }, intervalMs);
  }
}

// ── Singleton caches ─────────────────────────────────────────────────────────

/** Per-user dashboard summary — 30 s TTL. */
export const dashboardCache = new SimpleCache<unknown>(30_000);

/**
 * Subjects list / item — 30 s TTL.
 * Keyed as  "list:<userId>"  or  "item:<subjectId>:<userId>"
 * so role-filtered results never bleed between users.
 */
export const subjectsCache = new SimpleCache<unknown>(30_000);
