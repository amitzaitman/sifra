// The rounds lock (architecture 4.1): each registered game's rounds against tests/rounds.lock.json,
// rebuilt in memory by scripts/lock-rounds.js. Rounds that change need a meta.version bump (2.1),
// a locked game or level id stays (2.2), and the lock follows a bump (run npm run lock).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as registry from '../games/registry.js';
import { compare, digest, lockOf, readLock } from '../scripts/lock-rounds.js';

const problems = compare(readLock(), lockOf(Object.values(registry)));
/** @type {(kind: string) => string[]} */
const of = (kind) => problems.filter((p) => p.kind === kind).map((p) => p.text);

test('rounds that changed come with a meta.version bump', () => {
  assert.deepEqual(of('version'), []);
});

test('every locked game and level id is still there (storage keys on them)', () => {
  assert.deepEqual(of('level'), []);
});

test('tests/rounds.lock.json is up to date (run npm run lock)', () => {
  assert.deepEqual(of('stale'), [], 'run npm run lock');
});

test('compare: a changed level without a bump, a gone game or level id and a bump each fail as their kind', () => {
  const was = { g: { version: 2, levels: { a: '1', b: '2' } } };
  const kinds = (now) => compare(was, now).map((p) => p.kind);
  assert.deepEqual(kinds(was), []);
  assert.deepEqual(kinds({ g: { version: 2, levels: { a: '1', b: '3' } } }), ['version']);
  assert.deepEqual(kinds({ g: { version: 3, levels: { a: '1', b: '3' } } }), ['stale']);
  assert.deepEqual(kinds({ g: { version: 1, levels: { a: '1', b: '2' } } }), ['version']);
  assert.deepEqual(kinds({ g: { version: 3, levels: { a: '1' } } }), ['level', 'stale']);
  assert.deepEqual(kinds({ g: { version: 2, levels: { a: '1', b: '2', c: '4' } } }), ['stale']);
  assert.deepEqual(kinds({ g: was.g, h: { version: 1, levels: {} } }), ['stale']);
  assert.deepEqual(kinds({}), ['level']);
  assert.deepEqual(kinds({ renamed: was.g }), ['level', 'stale']);
});

test('digest: a level whose range changes has another digest', () => {
  for (const game of Object.values(registry)) {
    const level = game.levels.find((l) => typeof l.max === 'number');
    if (!level) continue;
    assert.notEqual(digest(game, { ...level, max: level.max - 1 }), digest(game, level), `${game.meta.id} ${level.id}`);
  }
});
