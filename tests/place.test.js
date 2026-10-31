// lib/place.js, the answer's place (R4; decisions.md 2026-10-31, "מקום התשובה"), on a made-up round:
// the answer 5, real errors a (9, over it), b (2) and c (3) under it, d (7, over it) and e (1, under
// it) after the others, and a slip 4 or 6.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { place } from '../lib/place.js';
import { rng } from '../shell/rng.js';

const ANSWER = 5;
const RULES = { a: [9], b: [2], c: [3], d: [7], e: [1], 'slip.near': [4, 6] };
/** @type {(c: { value: number }) => boolean} */
const below = (c) => c.value < ANSWER;

/**
 * The rules in their order, each value with room on its side, until the cards are full.
 * @param {string[]} order
 * @param {number} n
 */
const dealer = (order, n) => (/** @type {{ below: number, above: number }} */ room, /** @type {(rule: string) => boolean} */ leave) => {
  const left = { ...room };
  /** @type {{ value: number, rule: string }[]} */
  const wrong = [];
  for (const rule of order) {
    if (wrong.length === n - 1) break;
    if (leave(rule)) continue;
    const value = RULES[rule].find((v) => left[v < ANSWER ? 'below' : 'above'] > 0);
    if (value === undefined) continue;
    left[value < ANSWER ? 'below' : 'above'] -= 1;
    wrong.push({ value, rule });
  }
  return wrong;
};

/** The sets place() deals over 3000 seeds, by their values in order, with how often. */
function dealt(order, n) {
  /** @type {Map<string, number>} */
  const seen = new Map();
  for (let seed = 1; seed <= 3000; seed++) {
    const set = place(n, dealer(order, n), below, rng(seed)) ?? [];
    const key = set.map((c) => `${c.value}:${c.rule}`).sort().join(' ');
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return seen;
}

test('place: the free deal, one place up (the last real error over the answer gives way to the next value under it) and one down (the last under it to a slip over it), each alike', () => {
  const seen = dealt(['a', 'b', 'c', 'slip.near'], 4);
  // Free: a, b, c (the answer third). Up: b, c and the slip 4 under it (fourth). Down: a, b and the slip 6 (second).
  assert.deepEqual([...seen.keys()].sort(), ['2:b 3:c 4:slip.near', '2:b 3:c 9:a', '2:b 6:slip.near 9:a']);
  for (const n of seen.values()) assert.ok(n > 850 && n < 1150, JSON.stringify([...seen]));
});

test('place: moving down keeps the free deal\'s real errors, so a later real error never takes the slip\'s place; moving up lets the next rule\'s value in', () => {
  // d (over the answer) comes after the free deal is full: down is a, b and the slip, not a, b and d.
  assert.deepEqual([...dealt(['a', 'b', 'c', 'd', 'slip.near'], 4).keys()].sort(), ['2:b 3:c 4:slip.near', '2:b 3:c 9:a', '2:b 6:slip.near 9:a']);
  // e (under the answer) does: up is b, c and e, three real errors.
  assert.deepEqual([...dealt(['a', 'b', 'c', 'd', 'e', 'slip.near'], 4).keys()].sort(), ['1:e 2:b 3:c', '2:b 3:c 9:a', '2:b 6:slip.near 9:a']);
});

test('place: a set with fewer real errors than R4\'s two is not dealt; with no other set the free deal stays', () => {
  // Three cards, two real errors: a slip would leave one, so the answer keeps its place.
  assert.deepEqual([...dealt(['a', 'b', 'slip.near'], 3).keys()], ['2:b 9:a']);
  // The free deal's own slip crosses the answer: a and the slip 4, or a and the slip 6.
  assert.deepEqual([...dealt(['a', 'slip.near'], 3).keys()].sort(), ['4:slip.near 9:a', '6:slip.near 9:a']);
  assert.equal(place(4, () => null, below, rng(1)), null);
});
