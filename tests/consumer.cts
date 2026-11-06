import { createNotificationQueue } from '@lp-labs/notification-queue';

let now = 0;
const queue = createNotificationQueue({ now: () => now, capacity: 2 });
queue.enqueue({ id: 'job', message: 'Finished', priority: 5, ttl: 100 });
if (queue.list()[0]?.id !== 'job') throw new Error('Queue failed');
now = 100;
if (queue.expire()[0] !== 'job') throw new Error('Expiration failed');

// @ts-expect-error invalid public API input must be rejected
createNotificationQueue({ now: () => 'now' });
