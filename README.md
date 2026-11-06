# @lp-labs/notification-queue

Priority-ordered bounded notification queue with active-key deduplication and clock-driven expiration.

Standalone original implementation with zero runtime, peer or sibling dependencies.
Library ID 436. ES2022, strict TypeScript, NodeNext ESM and CommonJS with declarations.

## Install

```bash
npm install @lp-labs/notification-queue
```

CommonJS: `const { createNotificationQueue } = require('@lp-labs/notification-queue')`.

## Quickstart

```js
import { createNotificationQueue } from '@lp-labs/notification-queue';

let now = 0;
const queue = createNotificationQueue({ now: () => now, capacity: 2 });
queue.enqueue({ id: 'job', message: 'Finished', priority: 5, ttl: 100 });
if (queue.list()[0]?.id !== 'job') throw new Error('Queue failed');
now = 100;
if (queue.expire()[0] !== 'job') throw new Error('Expiration failed');
```

## API, customization and contracts

`createNotificationQueue({ now, capacity? })` requires a caller-owned finite monotonic
clock (for example a fake clock in tests). Capacity defaults to 100, integer 1..100000.
No clock is read at import, and there are no scheduled callbacks or wall-clock timers.

`enqueue(notice)` returns 'added', 'duplicate' or 'full'. Active IDs and active dedupKey
values are unique; dedupKey defaults to id. Duplicate attempts do not refresh timestamps,
priority or expiration. Capacity rejects new entries, never evicts an existing notice.
Priority defaults to zero, any finite number; list order is descending priority with stable
insertion ties. ttl is optional finite nonnegative duration in the same units as now.
Omitted ttl never expires; zero ttl expires on the next lifecycle operation.
`expire()` removes entries whose expiresAt <= now and returns removed IDs in insertion order.
`acknowledge(id)` first expires stale entries and returns whether a live notice was removed,
so expiration wins an acknowledgment at the exact deadline.
`list()` expires stale entries and returns copied entries in priority order.

Inputs and snapshots are detached flat records. Empty IDs, invalid messages/priority/ttl
throw TypeError; invalid capacity, regressing/nonfinite clocks or expiration overflow
throw RangeError. The clock callback is captured at construction; operations read it once,
synchronously. A regressing/nonfinite/throwing clock does not expire or remove notices;
thrown values propagate unchanged, including undefined. Clocks should be pure functions.
Enqueue/expire/acknowledge are O(N), list O(N log N), memory O(capacity).
Deduplication only covers active queue records; acknowledged/expired IDs can be reused.

## Complete public declarations

```ts
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
export declare function createNotificationQueue(options: QueueOptions): NotificationQueue;
```

## Scope and performance

In-memory notice lifecycle and acknowledgment; no network delivery, persistence, retries or notification UI.

Complexities and bounds above assume ordinary JavaScript number arithmetic and Map/Set
average constant-time lookup. No runtime or peer dependencies, automatic browser adapters,
global registries or hidden services are included. Importing the module has no browser effects.

## Development

```bash
npm ci --offline --no-audit --no-fund
npm run build
npm run typecheck
npm test
npm run format:check
```

## Support

If this library is useful to you, consider supporting its maintenance with a [donation via PayPal](https://www.paypal.me/LibinPrasanth).

## Author

Created by [Libin Prasanth](https://www.linkedin.com/in/libinprasanth/). Connect on LinkedIn for updates and discussion.
