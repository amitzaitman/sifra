// The balance's own tests (architecture 4.1): the layout functions (R6 [unit]), the reversed-form
// precedence of the equal.* rules (depth 4.9), the judging cards, and the halos of design 10.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as balance from '../games/balance/game.js';
import { bridges, ghostSlots, layoutLine, layoutPan, ringPieces, rowPieces, rowsFor } from '../games/balance/stage.js';
import { rng } from '../lib/rng.js';

const level = (id) => balance.levels.find((l) => l.id === id);
/** Every round of a level over 200 seeds. */
const rounds = (id) => Array.from({ length: 200 }, (_, i) => balance.makeRound(level(id), rng(i + 1)));

test('R6: a pan fills in rows of five, left to right, the bottom row first', () => {
  const { cubes, spans, slots } = layoutPan([{ role: 'part', count: 4 }, { role: 'unknown', count: 3, cover: true }]);
  assert.deepEqual(cubes.slice(0, 6).map(({ col, row }) => [col, row]), [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [0, 1]]);
  assert.ok(cubes.every((c, i) => i === 0 || c.slot === cubes[i - 1].slot + 1), 'one stack, in fill order');
  assert.deepEqual(spans, [{ group: 0, start: 0, length: 4 }, { group: 1, start: 4, length: 3 }]);
  assert.equal(slots, 7);
});

test('a cover over nothing stands on one empty place (design 6.6)', () => {
  const { cubes, spans, slots } = layoutPan([{ role: 'part', count: 5 }, { role: 'unknown', count: 0, cover: true }]);
  assert.equal(cubes.length, 5);
  assert.deepEqual(spans[1], { group: 1, start: 5, length: 1 });
  assert.equal(slots, 6);
});

test('the stretched cover: one piece per row, joined by bridges; rings merge rows of one width', () => {
  // 4 + ? = 7: the cover on place 4 (first row) and places 5-6 (second row).
  assert.deepEqual(rowPieces(4, 3), [{ col: 4, row: 0, w: 1, h: 1 }, { col: 0, row: 1, w: 2, h: 1 }]);
  assert.deepEqual(bridges(rowPieces(4, 3)), [{ from: 2, to: 4, row: 1, across: true }]);
  assert.deepEqual(bridges(rowPieces(2, 8)), [{ from: 2, to: 5, row: 1, across: false }]);
  assert.deepEqual(ringPieces(0, 13), [{ col: 0, row: 0, w: 5, h: 2 }, { col: 0, row: 2, w: 3, h: 1 }]);
});

test('ghosts fill the unknown\'s places, then go on after the pan\'s last place', () => {
  // ? + 4 on a pan: the unknown first (3 places), then the four cubes.
  const layout = layoutPan([{ role: 'unknown', count: 3, cover: true }, { role: 'part', count: 4 }]);
  assert.deepEqual(ghostSlots(layout, 0, 5), [0, 1, 2, 7, 8]);
  assert.deepEqual(ghostSlots(layout, 0, 2), [0, 1]);
  assert.deepEqual(ghostSlots(layoutPan([]), -1, 3), [0, 1, 2]);
  assert.equal(rowsFor(3), 2);
  assert.equal(rowsFor(16), 4);
});

test('R6: the turned rows go left to right, a group after the other', () => {
  const { dots, blocks, length } = layoutLine([{ role: 'part', count: 3 }, { role: 'part', count: 5 }]);
  assert.ok(dots.every((d, i) => i === 0 || d.x > dots[i - 1].x), 'x grows');
  assert.deepEqual(blocks.map((b) => b.x), [0, 3.6]);
  assert.equal(length, 8.6);
  // Turned, the row is as long: the unknown's cover lies where the first group lands.
  assert.equal(layoutLine([{ role: 'part', count: 5 }, { role: 'unknown', count: 3, cover: true }]).length, length);
});

test('reversed forms: the equal.* rules come first (depth 4.9), standard forms keep given.* and op.other', () => {
  const ruleOf = (round, value) => round.choices.find((c) => c.value === value)?.rule;
  for (const round of rounds('missing-reversed')) {
    if (round.unknown === 'right-part') {
      // c = a + ?
      const [c] = round.equation.left;
      const [a] = round.equation.right;
      assert.equal(ruleOf(round, c), 'equal.copy');
      assert.equal(ruleOf(round, a + c), 'equal.add-all');
      if (a !== c) assert.equal(ruleOf(round, a), 'given.part');
    } else {
      // ? = a + b: the copy, the difference, and counting on with the start counted.
      const [a, , b] = round.equation.right;
      assert.deepEqual(round.choices.filter((ch) => ch.rule).map((ch) => ch.rule).sort(), ['count.start-included', 'equal.copy', 'op.other']);
      assert.equal(ruleOf(round, a), 'equal.copy');
      assert.equal(ruleOf(round, a + b - 1), 'count.start-included');
    }
  }
  for (const round of rounds('missing-right')) {
    const [c] = round.equation.right;
    assert.equal(ruleOf(round, c), 'given.whole');
  }
});

test('the zero round: 1 is zero.counted-as-one, and nothing else is offered twice', () => {
  const zeros = rounds('missing-right').filter((r) => r.answer === 0);
  assert.ok(zeros.length >= 10, `${zeros.length} rounds with answer 0 in 200`);
  for (const round of zeros) assert.deepEqual(round.choices.map((c) => c.rule), [null, 'zero.counted-as-one', 'given.whole', 'op.other']);
});

test('judging: one true card c = a + b; the others false, and each says its error', () => {
  for (const round of rounds('true-false')) {
    const sum = (side) => side.reduce((n, t, i) => (typeof t === 'number' ? (side[i - 1] === '−' ? n - t : n + t) : n), 0);
    const truth = round.choices.map((c) => sum(c.value.left) === sum(c.value.right));
    assert.deepEqual(truth.filter(Boolean).length, 1);
    assert.equal(round.answer.left.length, 1);
    assert.deepEqual(new Set(round.choices.map((c) => c.rule)), new Set([null, 'equal.reject-reversed', 'equal.accepts-chain', 'slip.card']));
  }
});

test('design 10: the unknown and the cover keep a --halo where they meet cubes and the frame; the frame has no role', () => {
  const css = readFileSync(new URL('../games/balance/game.css', import.meta.url), 'utf8');
  assert.match(css, /\.bl-cube\[data-role="unknown"\] \{ box-shadow: 0 0 0 3px var\(--halo\)/);
  assert.match(css, /\.bl-lid > \.cover \{[^}]*box-shadow: 0 0 0 3px var\(--halo\)/);
  for (const part of ['base', 'pole', 'beam', 'pivot']) assert.match(css, new RegExp(`\\.bl-${part} \\{[^}]*background: var\\(--frame\\)`));
  assert.doesNotMatch(css.match(/\.bl-(beam|bowl) \{[^}]*\}/g).join(''), /--role-/);
});
