// shell/rng.js (architecture 3.8, 4.3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demoSeed, rng, seedFrom } from '../shell/rng.js';

test('the same seed gives the same sequence; another seed another', () => {
  const draw = (seed) => Array.from({ length: 50 }, rng(seed).next);
  assert.deepEqual(draw(42), draw(42));
  assert.notDeepEqual(draw(42), draw(43));
  for (const x of draw(7)) assert.ok(x >= 0 && x < 1);
});

test('int stays in bounds over 10,000 draws and reaches both ends', () => {
  const r = rng(1);
  const seen = new Set();
  for (let i = 0; i < 10000; i++) {
    const n = r.int(3, 9);
    assert.ok(Number.isInteger(n) && n >= 3 && n <= 9, `${n}`);
    seen.add(n);
  }
  assert.equal(seen.size, 7);
});

test('pick takes an element; shuffle is a new permutation', () => {
  const r = rng(5);
  const list = [1, 2, 3, 4, 5, 6, 7, 8];
  assert.ok(list.includes(r.pick(list)));
  const mixed = r.shuffle(list);
  assert.notEqual(mixed, list);
  assert.deepEqual([...mixed].sort((a, b) => a - b), list);
  assert.deepEqual(list, [1, 2, 3, 4, 5, 6, 7, 8]);
});

test('derived seeds are uint32; the demo seed differs from the round seed', () => {
  const r = rng(9);
  for (let i = 0; i < 100; i++) {
    const s = seedFrom(r);
    assert.ok(Number.isInteger(s) && s >= 0 && s < 2 ** 32);
  }
  assert.equal(demoSeed(1), (1 ^ 0x9e3779b9) >>> 0);
  assert.notEqual(demoSeed(12345), 12345);
});
