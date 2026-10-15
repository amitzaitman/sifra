// The balance's own tests (architecture 4.1): the layout functions (R6 [unit]), the reversed-form
// precedence of the equal.* rules (depth 4.9), the judging cards and their forms, and the halos of design 10.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as balance from '../games/balance/game.js';
import { bridges, ghostSlots, layoutLine, layoutPan, ringPieces, rowPieces, rowsFor, runsOf } from '../games/balance/stage.js';
import { rng } from '../shell/rng.js';

const level = (id) => balance.levels.find((l) => l.id === id);
/** Every round of a level over 200 seeds. */
const rounds = (id) => Array.from({ length: 200 }, (_, i) => balance.makeRound(level(id), rng(i + 1)));

test('R6: a pan fills in rows of five, left to right, the bottom row first', () => {
  const { cubes, spans, slots } = layoutPan([{ role: 'part', count: 4 }, { role: 'unknown', count: 3, cover: true }]);
  assert.deepEqual(cubes.slice(0, 6).map(({ col, row }) => [col, row]), [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [0, 1]]);
  assert.ok(cubes.every((c, i) => i === 0 || c.slot === cubes[i - 1].slot + 1), 'one stack, in fill order');
  assert.deepEqual(spans.map((s) => s.runs), [[{ start: 0, length: 4 }], [{ start: 4, length: 3 }]]);
  assert.deepEqual(spans[1].places, [4, 5, 6]);
  assert.equal(slots, 7);
});

test('two known numbers follow on in rows of five; the colour keeps them apart (owner decision 2026-10-14, design 6.8)', () => {
  // 7 + 2 (same-as, both-sides, relational): 7 on row 0 and two places of row 1, 2 right after.
  const two = layoutPan([{ role: 'part', count: 7 }, { role: 'part', count: 2, second: true }]);
  assert.deepEqual(two.cubes.filter((c) => c.group === 1).map(({ col, row }) => [col, row]), [[2, 1], [3, 1]]);
  assert.deepEqual(two.cubes.map((c) => c.second), [false, false, false, false, false, false, false, true, true]);
  assert.equal(rowsFor(two.slots), 2);
  // 5 + 3 and 3 + 5 fill the same places as 8: the rows of five compare across the pans.
  const slots = (groups) => layoutPan(groups).cubes.map((c) => c.slot);
  assert.deepEqual(slots([{ role: 'part', count: 5 }, { role: 'part', count: 3, second: true }]), slots([{ role: 'whole', count: 8 }]));
  assert.deepEqual(slots([{ role: 'part', count: 3 }, { role: 'part', count: 5, second: true }]), slots([{ role: 'whole', count: 8 }]));
  // ? + 4 and 4 + ?: the cover follows on too (design 7.3).
  assert.deepEqual(layoutPan([{ role: 'part', count: 4 }, { role: 'unknown', count: 3, cover: true }]).spans[1].places, [4, 5, 6]);
});

test('? = a + b: the cover over the result\'s places in rows of five, as the parts lie on the other pan; a piece per row', () => {
  const { cubes, spans, slots } = layoutPan([{ role: 'unknown', count: 7, cover: true }]);
  assert.deepEqual(spans[0].runs, [{ start: 0, length: 7 }]);
  assert.deepEqual(cubes.map((c) => c.slot), [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(slots, 7);
  const pieces = spans[0].runs.flatMap((r) => rowPieces(r.start, r.length));
  assert.deepEqual(pieces, [{ col: 0, row: 0, w: 5, h: 1 }, { col: 0, row: 1, w: 2, h: 1 }]);
  assert.deepEqual(bridges(pieces), [{ from: 0, to: 2, row: 1, across: false }]);
  // Ghosts fill its places in order: 3 copies the first part and leaves the second's places empty.
  assert.deepEqual(ghostSlots(layoutPan([{ role: 'unknown', count: 7, cover: true }]), 0, 3), [0, 1, 2]);
  assert.deepEqual(ghostSlots(layoutPan([{ role: 'unknown', count: 5, cover: true }]), 0, 6), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(runsOf([2, 3, 4, 5, 9]), [{ start: 2, length: 4 }, { start: 9, length: 1 }]);
});

test('a cover over nothing stands on one empty place (design 6.6)', () => {
  const { cubes, spans, slots } = layoutPan([{ role: 'part', count: 5 }, { role: 'unknown', count: 0, cover: true }]);
  assert.equal(cubes.length, 5);
  assert.deepEqual(spans[1], { group: 1, places: [5], runs: [{ start: 5, length: 1 }] });
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

test('R6: the turned rows go left to right, a group after the other, the second in the light shade', () => {
  const { dots, blocks, length } = layoutLine([{ role: 'part', count: 3 }, { role: 'part', count: 5, second: true }]);
  assert.ok(dots.every((d, i) => i === 0 || d.x > dots[i - 1].x), 'x grows');
  assert.deepEqual(dots.map((d) => d.second), [false, false, false, true, true, true, true, true]);
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

test('the formulas are the catalogue\'s, whatever the form (R4); only the choice order changes', () => {
  const reversed = rounds('missing-reversed').find((r) => r.eqform === 'reversed');
  const [c] = reversed.equation.left;
  const [a] = reversed.equation.right;
  assert.equal(balance.rules['given.whole'](reversed), c);
  assert.equal(balance.rules['equal.copy'](reversed), c);
  assert.equal(balance.rules['op.other'](reversed), a + c);
  assert.equal(balance.rules['equal.add-all'](reversed), a + c);
  const result = rounds('missing-reversed').find((r) => r.unknown === 'result-left');
  assert.equal(balance.rules['given.part'](result), result.equation.right[0]);
  assert.equal(balance.rules['given.whole'](result), null, '? = a + b gives no whole');
});

test('same-as: every total from 5 to 10 comes up, about alike', () => {
  const seen = new Map();
  for (const round of rounds('same')) seen.set(round.answer, (seen.get(round.answer) ?? 0) + 1);
  for (let c = 5; c <= 10; c++) assert.ok((seen.get(c) ?? 0) >= 15, `${c} came up ${seen.get(c) ?? 0} times in 200`);
});

test('the zero round: 1 is zero.counted-as-one, and nothing else is offered twice', () => {
  const zeros = rounds('missing-right').filter((r) => r.answer === 0);
  assert.ok(zeros.length >= 10, `${zeros.length} rounds with answer 0 in 200`);
  for (const round of zeros) assert.deepEqual(round.choices.map((c) => c.rule), [null, 'zero.counted-as-one', 'given.whole', 'op.other']);
});

/** A card's form: 'standard' (5 + 2 = 7), 'reversed' (7 = 5 + 2), 'same' (7 = 7), else its shape. */
const formOf = (card) => {
  const shape = [...card.left, '=', ...card.right].map((t) => (typeof t === 'number' ? 'n' : t)).join(' ');
  return { 'n + n = n': 'standard', 'n = n + n': 'reversed', 'n = n': 'same' }[shape] ?? shape;
};
const sum = (side) => side.reduce((n, t, i) => (typeof t === 'number' ? (side[i - 1] === '−' ? n - t : n + t) : n), 0);

test('judging: one true card, the others false, each with its rule; every card made of the round\'s exercise', () => {
  for (const round of rounds('true-false')) {
    const truth = round.choices.map((c) => sum(c.value.left) === sum(c.value.right));
    assert.equal(truth.filter(Boolean).length, 1);
    assert.ok(round.choices.every((c, i) => truth[i] === (c.rule === null)));
    const [a, b] = round.fact;
    const numbers = new Set([a, b, a + b, a + b + 1, Math.abs(a - b)]);
    assert.ok(round.choices.every((c) => [...c.value.left, ...c.value.right].every((t) => typeof t !== 'number' || numbers.has(t))), JSON.stringify(round.choices));
    // Real errors only: a known error fits every form, so no slip (R4, depth 4.9).
    assert.ok(round.choices.every((c) => !c.rule?.startsWith('slip.')), JSON.stringify(round.choices));
    assert.ok(!round.choices.some((c) => c.rule === 'equal.accepts-chain'), 'its form (an operation on both sides) is not a level 1 form');
  }
});

test('judging over 500 seeds: each form is sometimes true and sometimes false, and a card\'s form does not tell the true card', () => {
  const level1 = level('true-false');
  const seen = { standard: { cards: 0, true: 0 }, reversed: { cards: 0, true: 0 }, same: { cards: 0, true: 0 } };
  const rules = new Set();
  for (let seed = 1; seed <= 500; seed++) {
    const round = balance.makeRound(level1, rng(seed));
    // Every round shows the three forms, two of them standard: the shape of the row of cards is always the same.
    const forms = round.choices.map((c) => formOf(c.value));
    assert.deepEqual([...forms].sort(), ['reversed', 'same', 'standard', 'standard'], `seed ${seed}: ${forms}`);
    round.choices.forEach((c, i) => {
      seen[forms[i]].cards += 1;
      if (c.rule === null) seen[forms[i]].true += 1;
      else rules.add(c.rule);
    });
  }
  for (const [form, { cards, true: right }] of Object.entries(seen)) {
    // The share of the cards of this form that are true: never 0 or 1, and near a quarter, as any card's.
    const share = right / cards;
    assert.ok(share > 0.18 && share < 0.32, `${form}: ${right} of ${cards} cards true (${share.toFixed(2)})`);
  }
  assert.deepEqual([...rules].sort(), ['equal.becomes', 'equal.copy', 'equal.reject-reversed', 'op.other']);
});

test('judging: the cards are the catalogue\'s (depth 4.9, errors.md), on 5 + 2 = 7 in each form of the true card', () => {
  const standard = { left: [5, '+', 2], right: [7] };
  const reversed = { left: [7], right: [5, '+', 2] };
  const same = { left: [7], right: [7] };
  /** @type {(answer: Equation) => Round} */
  const round = (answer) => ({ ...rounds('true-false')[0], answer, fact: [5, 2] });
  for (const answer of [standard, reversed, same]) {
    const r = round(answer);
    const where = JSON.stringify(answer);
    assert.deepEqual(balance.rules['op.other'](r), { left: [5, '+', 2], right: [3] }, where);
    assert.deepEqual(balance.rules['equal.copy'](r), { left: [5], right: [5, '+', 2] }, where);
    assert.deepEqual(balance.rules['equal.becomes'](r), { left: [5], right: [7] }, where);
    // A true card with a lone number on the left is turned down for the standard form.
    assert.deepEqual(balance.rules['equal.reject-reversed'](r), answer === standard ? null : { left: [5, '+', 2], right: [8] }, where);
  }
  // Depth 4.9's false cards beside each form of the true card.
  const lists = { standard: ['equal.becomes', 'equal.copy', 'op.other'], reversed: ['equal.becomes', 'equal.reject-reversed', 'op.other'], same: ['equal.copy', 'equal.reject-reversed', 'op.other'] };
  const seen = new Set();
  for (const r of rounds('true-false')) {
    const form = formOf(r.answer);
    seen.add(form);
    assert.deepEqual(r.choices.map((c) => c.rule).filter(Boolean).sort(), lists[form], `${form}: ${JSON.stringify(r.choices)}`);
  }
  assert.deepEqual([...seen].sort(), ['reversed', 'same', 'standard']);
});

test('design 10: the unknown and the cover keep a --halo where they meet cubes and the frame; the frame has no role', () => {
  const css = readFileSync(new URL('../games/balance/game.css', import.meta.url), 'utf8');
  assert.match(css, /\.bl-cube\[data-role="unknown"\] \{ box-shadow: 0 0 0 3px var\(--halo\)/);
  // The second of two known parts: the part's light shade, on cubes and on the turned rows' dots.
  assert.match(css, /\.bl-cube\[data-role="part"\]\[data-second\] \{ background-color: var\(--role-part-2\); \}/);
  assert.match(css, /\.bl-dot\[data-role="part"\]\[data-second\] \{ background-color: var\(--role-part-2\); \}/);
  assert.match(css, /\.bl-lid > \.cover \{[^}]*box-shadow: 0 0 0 3px var\(--halo\)/);
  for (const part of ['base', 'pole', 'beam', 'pivot']) assert.match(css, new RegExp(`\\.bl-${part} \\{[^}]*background: var\\(--frame\\)`));
  assert.doesNotMatch(css.match(/\.bl-(beam|bowl) \{[^}]*\}/g).join(''), /--role-/);
});
