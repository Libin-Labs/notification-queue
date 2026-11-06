export interface Notice {
  id: string;
  message: string;
  priority?: number;
  dedupKey?: string;
  ttl?: number;
}
export interface QueuedNotice {
  id: string;
  message: string;
  priority: number;
  dedupKey: string;
  createdAt: number;
  expiresAt: number | null;
}
export interface QueueOptions {
  capacity?: number;
  now: () => number;
}
export interface NotificationQueue {
  enqueue(notice: Notice): 'added' | 'duplicate' | 'full';
  acknowledge(id: string): boolean;
  expire(): string[];
  list(): QueuedNotice[];
}
export function createNotificationQueue(options: QueueOptions): NotificationQueue {
  const capacity = options.capacity ?? 100;
  const clock = options.now;
  if (typeof clock !== 'function') throw new TypeError('Clock must be a function');
  if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 100000)
    throw new RangeError('Invalid capacity');
  let last = -Infinity;
  const notices = new Map<string, QueuedNotice>();
  function time(): number {
    const value = clock();
    if (!Number.isFinite(value) || value < last)
      throw new RangeError('Clock must be finite and monotonic');
    last = value;
    return value;
  }
  function expireAt(now: number): string[] {
    const removed: string[] = [];
    for (const [id, n] of notices) {
      if (n.expiresAt !== null && n.expiresAt <= now) {
        notices.delete(id);
        removed.push(id);
      }
    }
    return removed;
  }
  function expire(): string[] {
    return expireAt(time());
  }
  return {
    expire,
    enqueue(notice) {
      const priority = notice.priority ?? 0;
      const ttl = notice.ttl;
      if (
        typeof notice.id !== 'string' ||
        !notice.id ||
        typeof notice.message !== 'string' ||
        (notice.dedupKey !== undefined && typeof notice.dedupKey !== 'string') ||
        !Number.isFinite(priority) ||
        (ttl !== undefined && (!Number.isFinite(ttl) || ttl < 0))
      )
        throw new TypeError('Invalid notice');
      const now = time();
      if (ttl !== undefined && !Number.isFinite(now + ttl))
        throw new RangeError('Expiration overflow');
      expireAt(now);
      const key = notice.dedupKey ?? notice.id;
      if (notices.has(notice.id) || [...notices.values()].some((n) => n.dedupKey === key))
        return 'duplicate';
      if (notices.size === capacity) return 'full';
      notices.set(notice.id, {
        id: notice.id,
        message: notice.message,
        priority,
        dedupKey: key,
        createdAt: now,
        expiresAt: ttl === undefined ? null : now + ttl,
      });
      return 'added';
    },
    acknowledge(id) {
      expire();
      return notices.delete(id);
    },
    list() {
      expire();
      return [...notices.values()].sort((a, b) => b.priority - a.priority).map((n) => ({ ...n }));
    },
  };
}
