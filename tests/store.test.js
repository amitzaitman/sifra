// lib/store.js (architecture 3.9, 4.3): no throw on a broken storage, migrate, caps, quota, export.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAPS, KEY, SCHEMA, capped, childOf, exportFile, load, migrate, newChild, save } from '../lib/store.js';

const newId = () => 'c0000abcd';
const DAY = '2026-10-14';

/** A Storage in memory; setItem can be made to throw. */
function memory(initial = {}, failWith = null) {
  const items = new Map(Object.entries(initial));
  return {
    items,
    writes: 0,
    failWith,
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem(key, value) {
      if (this.failWith) {
        const err = this.failWith;
        this.failWith = null;
        throw err;
      }
      this.writes += 1;
      items.set(key, String(value));
    },
  };
}
const throwing = new Proxy({}, { get() { throw new Error('SecurityError: storage is off'); } });

test('importing and loading with a storage that throws on any access does not throw', async () => {
  await import('../lib/store.js?again');
  const store = load(throwing, newId, DAY);
  assert.equal(store.data.current, 'c0000abcd');
  assert.deepEqual(childOf(store), newChild(DAY));
  assert.equal(save(store), false);
  assert.equal(load(null, newId, DAY).data.schema, SCHEMA);
  assert.doesNotThrow(() => exportFile(throwing, new Date(), null, DAY));
});

test('migrate: missing, unparsable or broken gives a new value; schema 1 stays', () => {
  for (const raw of [null, '', '{', '"text"', '[]', '{"schema":0}', '{"schema":1,"current":"x","children":{}}']) {
    const { data, writable } = migrate(raw, newId, DAY);
    assert.equal(writable, true, raw);
    assert.deepEqual(data, { schema: 1, current: 'c0000abcd', children: { c0000abcd: newChild(DAY) } }, raw);
  }
  const stored = { schema: 1, current: 'c1', children: { c1: { ...newChild('2026-01-01'), sessions: 4 } } };
  assert.deepEqual(migrate(JSON.stringify(stored), newId, DAY), { data: stored, writable: true });
});

test('migrate: a newer schema plays from memory and is never written', () => {
  const raw = JSON.stringify({ schema: SCHEMA + 1, current: 'c1', children: { c1: newChild('2026-01-01') } });
  const storage = memory({ [KEY]: raw });
  const store = load(storage, newId, DAY);
  assert.equal(store.writable, false);
  assert.equal(store.data.current, 'c0000abcd');
  assert.equal(save(store), false);
  assert.equal(storage.getItem(KEY), raw);
  // A newer schema of another shape is not "broken": still never written.
  const other = JSON.stringify({ schema: SCHEMA + 1, current: 'p1', profiles: { p1: {} } });
  const storage2 = memory({ [KEY]: other });
  const store2 = load(storage2, newId, DAY);
  assert.equal(store2.writable, false);
  assert.equal(save(store2), false);
  assert.equal(storage2.getItem(KEY), other);
  assert.equal(migrate('{"schema":2,"current":"x","children":{}}', newId, DAY).writable, false);
});

test('save and load round-trip under one key', () => {
  const storage = memory();
  const store = load(storage, newId, DAY);
  childOf(store).sessions = 3;
  assert.equal(save(store), true);
  assert.deepEqual([...storage.items.keys()], [KEY]);
  assert.equal(childOf(load(storage, () => 'other', DAY)).sessions, 3);
});

test('caps: 4000 attempts and 500 events, oldest first out', () => {
  assert.deepEqual(CAPS, { attempts: 4000, events: 500 });
  const list = [];
  for (let i = 0; i < 4003; i++) capped(list, i, CAPS.attempts);
  assert.equal(list.length, 4000);
  assert.equal(list[0], 3);
  const events = [];
  for (let i = 0; i < 501; i++) capped(events, i, CAPS.events);
  assert.deepEqual([events.length, events[0]], [500, 1]);
});

test('a quota error drops the oldest half of the attempts and retries once', () => {
  const quota = Object.assign(new Error('full'), { name: 'QuotaExceededError' });
  const storage = memory({}, quota);
  const store = load(storage, newId, DAY);
  childOf(store).attempts.push(...Array.from({ length: 10 }, (_, i) => ({ i })));
  assert.equal(save(store), true);
  assert.deepEqual(childOf(store).attempts.map((a) => a.i), [5, 6, 7, 8, 9]);
  assert.equal(storage.writes, 1);
  // Two quota errors in a row: give up, without throwing.
  const twice = memory({}, quota);
  const store2 = load(twice, newId, DAY);
  twice.setItem = () => { throw quota; };
  assert.equal(save(store2), false);
  // Any other error: no retry, nothing dropped.
  const other = memory({}, new Error('broken'));
  const store3 = load(other, newId, DAY);
  childOf(store3).attempts.push({ i: 0 }, { i: 1 });
  assert.equal(save(store3), false);
  assert.equal(childOf(store3).attempts.length, 2);
});

test('export: the stored value as is, with key, schema, time and persisted', () => {
  const stored = { schema: 1, current: 'c1234abcd', children: { c1234abcd: newChild('2026-10-01') } };
  // 00:30 in Israel is still the day before in UTC: the name takes the local day it is given.
  const file = exportFile(memory({ [KEY]: JSON.stringify(stored) }), new Date('2026-10-13T21:30:00Z'), true, '2026-10-14');
  assert.equal(file.name, 'sifra-c1234abcd-2026-10-14.json');
  assert.deepEqual(JSON.parse(file.text), { key: 'sifra', schema: 1, exported: '2026-10-13T21:30:00.000Z', persisted: true, data: stored });
  assert.equal(JSON.parse(exportFile(memory({ [KEY]: '{oops' }), new Date(), null, DAY).text).data, '{oops');
  assert.equal(exportFile(memory(), new Date('2026-10-14T08:00:00Z'), null, DAY).name, 'sifra-none-2026-10-14.json');
});
