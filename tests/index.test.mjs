import test from 'node:test';
import assert from 'node:assert/strict';
import { createNotificationQueue } from '../dist/esm/index.js';

test('priority descending with stable equal-priority insertion', () => {
  const q = createNotificationQueue({ now: () => 0 });
  q.enqueue({ id: 'a', message: 'A', priority: 1 });
  q.enqueue({ id: 'b', message: 'B', priority: 3 });
  q.enqueue({ id: 'c', message: 'C', priority: 1 });
  assert.deepEqual(
    q.list().map((n) => n.id),
    ['b', 'a', 'c'],
  );
});
test('dedup checks both ID and dedup key without refreshing expiry', () => {
  let now = 0;
  const q = createNotificationQueue({ now: () => now });
  assert.equal(q.enqueue({ id: 'a', message: 'A', dedupKey: 'task', ttl: 10 }), 'added');
  now = 5;
  assert.equal(q.enqueue({ id: 'b', message: 'B', dedupKey: 'task', ttl: 20 }), 'duplicate');
  assert.equal(q.enqueue({ id: 'a', message: 'A', dedupKey: 'other' }), 'duplicate');
  now = 10;
  assert.deepEqual(q.expire(), ['a']);
  assert.equal(q.enqueue({ id: 'b', message: 'B', dedupKey: 'task' }), 'added');
});
test('capacity rejects rather than evicts and expired items free capacity', () => {
  let now = 0;
  const q = createNotificationQueue({ now: () => now, capacity: 1 });
  q.enqueue({ id: 'a', message: 'A', ttl: 3 });
  assert.equal(q.enqueue({ id: 'b', message: 'B', priority: 99 }), 'full');
  now = 3;
  assert.equal(q.enqueue({ id: 'b', message: 'B' }), 'added');
  assert.equal(q.acknowledge('b'), true);
  assert.equal(q.acknowledge('b'), false);
});
test('expiration boundary wins acknowledgment race and zero TTL expires immediately', () => {
  let now = 0;
  const q = createNotificationQueue({ now: () => now });
  q.enqueue({ id: 'a', message: 'A', ttl: 1 });
  now = 1;
  assert.equal(q.acknowledge('a'), false);
  q.enqueue({ id: 'zero', message: '', ttl: 0 });
  assert.deepEqual(q.list(), []);
});
test('snapshot and input mutations cannot alter queue', () => {
  const q = createNotificationQueue({ now: () => 0 });
  const notice = { id: 'a', message: 'A' };
  q.enqueue(notice);
  notice.message = 'B';
  const copy = q.list();
  copy[0].message = 'C';
  assert.equal(q.list()[0].message, 'A');
});
test('invalid capacity and notices are rejected', () => {
  assert.throws(() => createNotificationQueue({ now: () => 0, capacity: 0 }), RangeError);
  const q = createNotificationQueue({ now: () => 0 });
  for (const n of [
    { id: '', message: 'A' },
    { id: 'a', message: 'A', ttl: -1 },
    { id: 'a', message: 'A', priority: Infinity },
  ]) {
    assert.throws(() => q.enqueue(n), TypeError);
  }
  assert.deepEqual(q.list(), []);
});
test('fake clock rejects regression, NaN and expiration overflow', () => {
  let now = 10;
  const q = createNotificationQueue({ now: () => now });
  q.list();
  now = 9;
  assert.throws(() => q.expire(), RangeError);
  now = NaN;
  assert.throws(() => q.list(), RangeError);
  now = Number.MAX_VALUE;
  assert.throws(() => q.enqueue({ id: 'a', message: '', ttl: Number.MAX_VALUE }), RangeError);
});

test('one synchronous clock sample per operation avoids intra-operation deadline races', () => {
  let now = 0;
  const queue = createNotificationQueue({ now: () => ++now });
  queue.enqueue({ id: 'a', message: '', ttl: 2 });
  assert.equal(now, 1);
  assert.equal(queue.list()[0].expiresAt, 3);
  assert.equal(now, 2);
  assert.deepEqual(queue.expire(), ['a']);
  assert.equal(now, 3);
});

test('regressing or throwing clocks cannot expire or acknowledge live state', () => {
  let now = 5,
    throwing = false;
  const options = {
    now: () => {
      if (throwing) throw undefined;
      return now;
    },
  };
  const queue = createNotificationQueue(options);
  queue.enqueue({ id: 'a', message: 'A', ttl: 5 });
  options.now = () => 1000;
  now = 4;
  assert.throws(() => queue.acknowledge('a'), RangeError);
  throwing = true;
  let caught = false;
  try {
    queue.expire();
  } catch (error) {
    caught = true;
    assert.equal(error, undefined);
  }
  assert.equal(caught, true);
  throwing = false;
  now = 5;
  assert.equal(queue.list()[0].id, 'a');
  now = 10;
  assert.deepEqual(queue.expire(), ['a']);
});
