// The ten-frame game's own unit tests (architecture 4.1): the layouts (R6 [unit], dev-spec A.2),
// what each round draws, and the rule formulas, including the pair cards of level 4.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as game from '../games/ten-frame/game.js';
import { disc, domeOver, layoutBundles, layoutFrame, layoutTree, runPath, segments } from '../games/ten-frame/draw.js';
import { pictureOf } from '../games/ten-frame/picture.js';
import { rng } from '../shell/rng.js';

const SEEDS = 200;
const level = (id) => game.levels.find((l) => l.id === id);
const rounds = (id, n = SEEDS) => Array.from({ length: n }, (_, i) => game.makeRound(level(id), rng(i + 1)));
const sum = (pair) => pair[0] + pair[1];
/** A group's count in a round's picture (its help picture in symbols look). */
const count = (r, role) => (r.look === 'symbols' ? r.helpPicture : r.picture).find((g) => g.role === role)?.count;

test('R6: frame cells go left to right, top row first, five to a row; past the frames they go on below', () => {
  for (const [frames, rows] of [[1, 1], [1, 2], [2, 2]]) {
    const L = layoutFrame({ frames, rows });
    assert.equal(L.cells.length, frames * rows * 5);
    L.cells.forEach((c, i) => {
      assert.equal(c.i, i);
      assert.deepEqual([c.frame, c.row, c.col], [Math.floor(i / (rows * 5)), Math.floor((i % (rows * 5)) / 5), i % 5]);
      const prev = L.cells[i - 1];
      if (!prev) return;
      if (prev.frame === c.frame && prev.row === c.row) {
        assert.ok(c.x > prev.x, 'left to right in a row');
        assert.equal(c.y, prev.y);
      } else {
        assert.ok(c.y > prev.y, 'the next row (or frame) is lower');
        assert.ok(c.x < prev.x, 'and starts again on the left');
      }
    });
    const next = L.place(L.cells.length);
    assert.ok(next.y > L.cells.at(-1).y && next.x === L.cells[0].x, 'a hypothetical frame starts under the last one, on the left');
    assert.ok(L.height(L.cells.length + 1) > L.dh, 'and makes the drawing taller');
  }
});

test('R6: a ten-frame tray is the whole only in num.parts.make-ten; otherwise it has no role', () => {
  for (const [i, base] of game.levels.entries()) {
    for (let seed = 1; seed <= 40; seed++) {
      const round = game.makeRound(base, rng(seed));
      const { kind, data } = pictureOf(round);
      const make = base.skill === 'num.parts.make-ten';
      if (kind === 'frame') {
        const L = layoutFrame({ rows: data.rows, whole: data.whole });
        assert.ok(L.trays.every((t) => t.role === (make ? 'whole' : null)), `level ${i + 1}`);
        assert.equal(data.tag === null, make, 'the whole is a tag on the frame when the frame is not the whole');
      } else if (kind === 'bridge') {
        assert.ok(layoutFrame({ frames: 2 }).trays.every((t) => t.role === null));
      } else assert.ok(!make);
    }
  }
});

test('the pictures: a five-frame at level 1, a cover or the bracket, two frames for bridging ten', () => {
  assert.ok(rounds('split-5').every((r) => pictureOf(r).data.rows === 1));
  assert.ok(rounds('split-10').every((r) => pictureOf(r).data.rows === 2 && pictureOf(r).data.covered));
  assert.ok(rounds('ten-empty').every((r) => !pictureOf(r).data.covered), 'level 5: the empty cells are seen, wrapped by the ? bracket');
  assert.ok(rounds('ten-cover').every((r) => pictureOf(r).data.covered));
  assert.ok(rounds('bridge-move').every((r) => pictureOf(r).data.move));
  assert.ok(rounds('bridge-frames').every((r) => !pictureOf(r).data.move));
  for (const id of ['ten-symbols', 'teen-symbols', 'bridge-symbols']) {
    assert.ok(rounds(id).every((r) => r.picture.length === 0 && pictureOf(r).kind !== undefined), `${id}: the picture is the help picture`);
  }
  const zero = rounds('split-10').filter((r) => r.answer === 0);
  assert.ok(zero.length >= 10, 'about one round in ten covers nothing (number sense 4.4, level 2)');
  assert.ok(rounds('ten-empty').some((r) => r.answer === 0), 'level 5 sometimes shows a full frame');
  assert.ok(rounds('teen-bundle').some((r) => r.answer === 10), 'ten and none');
});

test('runPath: one rectangle in a row, a stepped outline over two rows, two rectangles when the rows do not meet', () => {
  const L = layoutFrame({ rows: 2 });
  const shapes = (from, n) => runPath(L.cells.slice(from, from + n), 0.1).split('M').length - 1;
  const corners = (from, n) => runPath(L.cells.slice(from, from + n), 0.1).match(/[HV]/g).length;
  assert.equal(shapes(6, 3), 1);
  assert.equal(corners(6, 3), 3);
  assert.equal(shapes(3, 7), 1, 'cells 3-9: one outline');
  assert.equal(corners(3, 7), 7, 'with a step');
  assert.equal(shapes(4, 2), 2, 'cell 4 and cell 5 only touch at a corner');
  const joined = (from, n) => runPath(L.cells.slice(from, from + n), 0.1, true).split('M').length - 1;
  assert.equal(joined(4, 2), 1, 'joined: one outline for one group, also across the row end');
  assert.equal(joined(4, 5), 1);
  assert.equal(runPath(L.cells.slice(3, 10), 0.1, true), runPath(L.cells.slice(3, 10), 0.1), 'rows that overlap: the same step');
  // A pad per side: out on the frame's border, in inside the tray (cells 0-2 of a ten-frame: the
  // top and left on the border, the right and bottom beside other cells).
  const box = runPath(L.cells.slice(0, 3), { out: 0.27, in: 0.1, rows: 2 }).match(/-?[\d.]+/g).map(Number);
  const [c0, c2] = [L.cells[0], L.cells[2]];
  assert.deepEqual(box, [c0.x - 0.27, c0.y - 0.27, c2.x + 1 + 0.1, c0.y + 1 + 0.1, c0.x - 0.27].map((v) => Math.round(v * 1000) / 1000));
  // A stepped run's step is the edge of the row that reaches further, padded in.
  const steps = runPath(L.cells.slice(0, 8), { out: 0.27, in: 0.1, rows: 2 });
  assert.ok(steps.includes(`V${Math.round((L.cells[4].y + 1 + 0.1) * 1000) / 1000}`), steps);
  assert.ok(steps.includes(`V${Math.round((L.cells[9].y + 1 + 0.27) * 1000) / 1000}`), 'the last row\'s bottom on the border');
});

test('runPath, join \'end\': what does not fit in a bond is one outline, joined round the rows\' end, under no dot that fits (design 7.1)', () => {
  const T = layoutTree({ whole: 10 });
  const dots = Array.from({ length: 15 }, (_, i) => ({ ...T.rightAt(i), row: Math.floor(i / 5), col: i % 5 }));
  /** The path's horizontal segments: [y, x0, x1]. */
  const flats = (d) => {
    const out = [];
    let [x, y] = [0, 0];
    for (const [, c, v] of d.matchAll(/([MHVZ])\s*(-?[\d.]*)/g)) {
      if (c === 'M') [x, y] = d.slice(1).split(/[H\s]/).slice(0, 2).map(Number);
      else if (c === 'H') {
        out.push([y, Math.min(x, Number(v)), Math.max(x, Number(v))]);
        x = Number(v);
      } else if (c === 'V') y = Number(v);
    }
    return out;
  };
  // 5 = 1 + ?, 6 chosen: places 4 and 5 do not fit; 10 = 1 + ?, 11 chosen: places 9 and 10.
  for (const from of [4, 9]) {
    const run = dots.slice(from, from + 2);
    const d = runPath(run, 0.175, 'end');
    assert.equal(d.split('M').length - 1, 1, 'one outline');
    const [upper, lower] = run;
    // In the gap between the two rows, a line lies only over or under a dot of the run.
    for (const [y, x0, x1] of flats(d)) {
      if (y <= upper.y + upper.h || y >= lower.y) continue;
      const near = run.filter((c) => x0 >= c.x - 0.175 - 1e-9 && x1 <= c.x + c.w + 0.175 + 1e-9);
      assert.ok(near.length, `a line along the gap from ${x0} to ${x1}, under dots that fit: ${d}`);
    }
  }
});

test('level 5: the small ? dome sits on the bracket\'s top edge and hides no counter (design 6.6)', () => {
  const L = layoutFrame({ rows: 2, whole: true, tag: true });
  // The dome as app.css draws it (top corners 50%/80%, bottom 20%), grown by its 3px halo at 320px.
  const pad = 0.07;
  const inDome = (b, x, y) => {
    const [l, r, t, bt] = [b.x - pad, b.x + b.w + pad, b.y - pad, b.y + b.h + pad];
    if (x < l || x > r || y < t || y > bt) return false;
    const top = y < b.y + b.h / 2;
    const [rx, ry] = top ? [Math.min(b.w, b.h) / 2 + pad, b.h * 0.8 + pad] : [b.h / 5 + pad, b.h / 5 + pad];
    const [cx, cy] = [x < (l + r) / 2 ? l + rx : r - rx, top ? t + ry : bt - ry];
    const corner = (x < (l + r) / 2 ? x < cx : x > cx) && (top ? y < cy : y > cy);
    return !corner || ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  };
  for (let k = 0; k < 10; k++) {
    const run = L.cells.slice(k);
    const top = segments(run)[0];
    const dome = domeOver(top, run[0].row > 0);
    const mid = dome.x + dome.w / 2;
    assert.ok(mid >= top.x - 0.12 && mid <= top.x + top.w + 0.12, `${k} + ?: on the bracket's top edge`);
    // Centred on the bracket's top line; on the outer corner (9 + ?), lowered but still across it.
    if (k === 9) assert.ok(dome.y < top.y - 0.12 && dome.y + dome.h > top.y - 0.12 && dome.y > top.y - 0.12 - 0.3, `${k} + ?: across the bracket's line, lowered`);
    else assert.equal(dome.y + dome.h / 2, top.y - 0.12, `${k} + ?: centred on the bracket's line`);
    for (const c of L.cells.slice(0, k)) {
      const d = disc(c);
      const [r, cx, cy] = [d.w / 2, d.x + d.w / 2, d.y + d.h / 2];
      let [all, hid] = [0, 0];
      for (let i = 0; i < 100; i++) for (let j = 0; j < 100; j++) {
        const [x, y] = [d.x + ((i + 0.5) / 100) * d.w, d.y + ((j + 0.5) / 100) * d.h];
        if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
        all += 1;
        if (inDome(dome, x, y)) hid += 1;
      }
      assert.ok(hid / all <= 0.01, `${k} + ?: counter ${c.i + 1} ${Math.round((100 * hid) / all)}% hidden`);
      // Beside the run in its own row (9 + ?: counter 9 beside the last cell), the dome and its halo touch nothing.
      if (c.row === run[0].row) assert.equal(hid, 0, `${k} + ?: counter ${c.i + 1}, in the dome's row, ${hid} points under it`);
    }
  }
});

test('bundles: digits above the sticks are a pitch apart and clear of an outline around them; two frames have room for a 10 above', () => {
  const B = layoutBundles({ ones: 9 });
  const row = Array.from({ length: 10 }, (_, j) => B.above(B.stick(j)));
  row.forEach((box, j) => {
    assert.ok(box.y >= 0, 'inside the drawing');
    // An outline padded 0.18 around the sticks, its 9px halo reaching about 0.25 units at 320px.
    assert.ok(box.y + box.h <= B.stick(j).y - 0.18 - 0.25, 'above the outline and its halo');
    if (j) assert.ok(box.x - row[j - 1].x >= 1.1 - 1e-9, 'two digits fit between neighbours');
  });
  const F = layoutFrame({ frames: 2, rows: 2, tag: true });
  assert.ok(F.tag.y >= 0 && F.tag.y + F.tag.h <= F.trays[0].y + 0.1, 'the 10 sits on the first frame\'s top edge, above its cells');
  assert.ok(F.tag.y + F.tag.h <= F.cells[0].y);
});

test('R6, R7: the bond has the whole on top and the parts below it; bundles keep the ten left of the ones', () => {
  const T = layoutTree({ whole: 7 });
  assert.ok(T.left.y > T.top.y + T.top.h && T.right.y === T.left.y && T.left.x < T.right.x);
  const dots = Array.from({ length: 7 }, (_, i) => T.wholeAt(i));
  assert.ok(dots.slice(0, 5).every((d, i) => i === 0 || d.x > dots[i - 1].x), 'rows of five, left to right');
  assert.ok(dots[5].y > dots[0].y && dots[5].x === dots[0].x);
  const B = layoutBundles({ ones: 4 });
  assert.ok(B.bundle.x + B.bundle.w < B.stick(0).x);
  assert.ok(B.stick(1).x > B.stick(0).x);
  assert.ok(B.stick(4).x + B.stick(4).w <= B.dw, 'room for one more stick (count-up)');
});

test('the rules give the catalogue formulas (docs/depth/errors.md)', () => {
  const byEq = (id, left, right) => rounds(id).find((r) => JSON.stringify(r.equation) === JSON.stringify({ left, right }));
  const ten = byEq('ten-cover', [7, '+', '?'], [10]);
  assert.deepEqual(['given.whole', 'given.part', 'op.other'].map((id) => game.rules[id](ten)), [10, 7, 17]);
  assert.equal(game.rules['zero.counted-as-one'](ten), null);
  const teen = byEq('teen-bundle', [10, '+', 4], ['?']);
  assert.deepEqual(['pv.teen-reversed', 'pv.digits-added', 'pv.ones-only'].map((id) => game.rules[id](teen)), [41, 5, 4]);
  assert.equal(game.rules['given.whole'](teen), null, 'nothing is given when the whole is the unknown');
  const bridge = byEq('bridge-frames', [8, '+', 5], ['?']);
  assert.deepEqual(['bridge.whole-second', 'bridge.leftover-only', 'bridge.stopped-at-ten', 'count.start-included']
    .map((id) => game.rules[id](bridge)), [15, 3, 10, 12]);
  assert.deepEqual(game.rules['slip.near'](bridge), { oneOf: [12, 14] });
  const zero = rounds('split-10').find((r) => r.answer === 0);
  assert.equal(game.rules['zero.counted-as-one'](zero), 1);
  assert.ok(zero.choices.some((c) => c.rule === 'zero.counted-as-one' && c.value === 1));
});

test('pair cards: a rule keeps one number of the answer and replaces the other; no wrong pair makes the whole', () => {
  const all = rounds('split-pairs');
  for (const r of all) {
    const [a, b] = r.answer;
    const whole = a + b;
    assert.equal(game.rules['given.part'](r), null, 'a pair round has no given part');
    for (const { value, rule } of r.choices.filter((c) => c.rule)) {
      assert.notEqual(sum(value), whole, `${JSON.stringify(value)} (${rule}) would be right too`);
      assert.ok(value[0] === a || value[1] === b, `${JSON.stringify(value)} keeps a number of ${JSON.stringify(r.answer)}`);
    }
  }
  const r = all.find((x) => x.answer[0] === 2 && x.answer[1] === 6);
  assert.deepEqual(game.rules['given.whole'](r), { oneOf: [[2, 8], [8, 6]] });
  assert.deepEqual(game.rules['op.other'](r), { oneOf: [[2, 10], [14, 6]] });
  assert.equal(game.rules['zero.counted-as-one'](r), null);
  const z = all.find((x) => x.answer[1] === 0);
  assert.deepEqual(game.rules['zero.counted-as-one'](z), { oneOf: [[z.answer[0], 1], [z.answer[0] - 1, 0]] });
  assert.ok(all.some((x) => x.answer.includes(0)), '7 | 0 and 0 | 7 are pairs too');
  const values = all.flatMap((x) => x.choices.map((c) => c.value));
  assert.ok(values.every((v) => v.join('').length <= 4), 'a pair card fits a 64px card');
});

test('choices: real errors before slips, and pairs sorted by their first then second number', () => {
  for (const id of ['split-10', 'ten-empty', 'teen-bundle', 'bridge-move']) {
    for (const r of rounds(id)) {
      const rules = r.choices.map((c) => c.rule).filter(Boolean);
      assert.ok(rules.filter((x) => x.startsWith('slip.')).length <= 1, `${id}: one slip at most`);
    }
  }
  for (const r of rounds('split-pairs')) {
    const keys = r.choices.map((c) => c.value[0] * 100 + c.value[1]);
    assert.deepEqual(keys, [...keys].sort((x, y) => x - y));
  }
  assert.ok(rounds('teen-bundle').filter((r) => r.answer === 10).every((r) => r.choices.every((c) => c.rule !== 'slip.near' || c.value === 11)),
    'counting on from the bundle never counts down below it');
});

/** An equation as its shape: numbers as n (tests read forms this way, like the generic test's R2). */
const shape = (r) => [...r.equation.left, '=', ...r.equation.right].map((t) => (typeof t === 'number' ? 'n' : t)).join(' ');

test('R8: the mixed levels write the unknown or the result left of = in a third of the rounds', () => {
  for (const id of ['split-bond', 'ten-symbols']) {
    const reversed = rounds(id).filter((r) => r.eqform === 'reversed').length;
    assert.ok(reversed >= SEEDS / 4 && reversed <= SEEDS / 2, `${id}: ${reversed}`);
  }
  const forms = new Set(rounds('ten-symbols').map(shape));
  assert.deepEqual([...forms].sort(), ['n + ? = n', 'n = n + ?', 'n − n = ?'], 'pedagogy 6.2 level 7: 7 + ? = 10, 10 − 7 = ?, 10 = 7 + ?');
  // Level 3, the bond (decisions.md 2026-10-14, "להוסיף לשתי רמות"): 3 + ? = 9 and 9 = 3 + ?, the picture the same.
  const bond = rounds('split-bond');
  assert.deepEqual([...new Set(bond.map(shape))].sort(), ['n + ? = n', 'n = n + ?']);
  for (const r of bond.filter((x) => x.eqform === 'reversed')) {
    const { whole, part } = { whole: r.picture[0].count, part: r.picture[1].count };
    assert.deepEqual(r.equation, { left: [whole], right: [part, '+', '?'] });
    assert.equal(pictureOf(r).kind, 'tree');
  }
  // Level 12, bridging ten in symbols: ? = 8 + 5 in a third of the rounds, with the same cards as 8 + 5 = ?.
  const bridge = rounds('bridge-symbols');
  const left = bridge.filter((r) => r.unknown === 'result-left');
  assert.ok(left.length >= SEEDS / 4 && left.length <= SEEDS / 2, `result-left: ${left.length}`);
  assert.ok(left.every((r) => shape(r) === '? = n + n') && bridge.filter((r) => r.unknown === 'result-right').every((r) => shape(r) === 'n + n = ?'));
  for (const r of left) {
    const [a, , b] = r.equation.right;
    const right = { ...r, unknown: 'result-right', equation: { left: [a, '+', b], right: ['?'] } };
    for (const { value, rule } of r.choices.filter((c) => c.rule)) assert.deepEqual(game.rules[rule](right), game.rules[rule](r), `${rule} in ${a} + ${b}`);
    assert.ok(r.choices.filter((c) => c.rule && !c.rule.startsWith('slip.')).length >= 2);
  }
});

test('level 9 (14 = 10 + ?): the ones unknown, cards 4, 10, 14 and a slip, the ones covered in the help picture', () => {
  const all = rounds('teen-symbols');
  for (const r of all) {
    const k = r.answer;
    const where = JSON.stringify(r.equation);
    assert.ok(Number.isInteger(k) && k >= 1 && k <= 9, where);
    assert.equal(r.unknown, 'part');
    assert.equal(r.eqform, 'reversed');
    assert.deepEqual(r.equation, { left: [10 + k], right: [10, '+', '?'] });
    const rules = Object.fromEntries(r.choices.map((c) => [c.rule ?? 'answer', c.value]));
    assert.deepEqual(Object.keys(rules).sort(), ['answer', 'given.part', 'given.whole', 'slip.near'], where);
    assert.deepEqual([rules.answer, rules['given.part'], rules['given.whole']], [k, 10, 10 + k], where);
    assert.ok([k - 1, k + 1].includes(rules['slip.near']) && rules['slip.near'] !== 10, where);
    assert.deepEqual(r.choices.map((c) => c.value), r.choices.map((c) => c.value).sort((x, y) => x - y));
    assert.deepEqual(pictureOf(r), { kind: 'bundles-part', data: { ones: k, tag: 10 + k } });
  }
  assert.deepEqual([...new Set(all.map((r) => r.answer))].sort((x, y) => x - y), [1, 2, 3, 4, 5, 6, 7, 8, 9], 'every ones digit');
  // Level 8 keeps the whole unknown, and its cards: nothing is given there.
  for (const r of rounds('teen-bundle')) assert.ok(r.choices.every((c) => !c.rule?.startsWith('given.')));
});

test('bundles with the ones unknown: the tag sits over the bundle and the cover, above the digits; the cover holds every stick', () => {
  for (const ones of [1, 4, 9]) {
    const B = layoutBundles({ ones, tag: true });
    const sticks = Array.from({ length: ones }, (_, j) => B.stick(j));
    for (const s of sticks) assert.ok(s.x >= B.places.x && s.x + s.w <= B.places.x + B.places.w && s.y === B.places.y && s.h === B.places.h, `${ones}: under the cover`);
    assert.ok(B.places.x > B.bundle.x + B.bundle.w, 'the cover leaves the bundle seen');
    // A ring round the bundle and its band (8% of its width each side) reaches 9px with its halo:
    // at 320px (unit about 26px) it stays a pixel off the cover.
    assert.ok((B.places.x - (B.bundle.x + B.bundle.w * 1.08)) * 26 >= 10, `${ones}: room for a ring round the bundle`);
    const centre = (B.tag.x + B.tag.w / 2);
    assert.ok(Math.abs(centre - (B.bracket.l + B.bracket.r) / 2) < 1e-9, 'the tag on the middle of its bracket');
    assert.ok(B.bracket.l <= B.bundle.x && B.bracket.r >= B.places.x + B.places.w, 'the bracket spans the bundle and the cover');
    // The digits of count-up and the tour (above each stick) stay under the bracket's ends.
    const digits = [...sticks, B.stick(ones)].map((s) => B.above(s));
    assert.ok(digits.every((d) => d.y >= B.bracket.end + 0.2), `${ones}: digits clear of the bracket`);
    assert.ok(B.stick(ones).x + B.stick(ones).w <= B.dw, 'room for one more stick (count-up)');
    assert.ok(B.tag.y >= 0 && B.tag.x >= 0 && B.tag.x + B.tag.w <= B.dw);
  }
  assert.equal(layoutBundles({ ones: 4 }).tag, null, 'level 8 draws no tag');
});

test('doubles and 5 + 5: about one round in five, where given.part gives the answer and its card gives way (number sense 4.4)', () => {
  const double = (r) => count(r, 'part') === r.answer;
  for (const id of ['split-5', 'split-10', 'split-bond', 'ten-empty', 'ten-cover', 'ten-symbols']) {
    const lvl = level(id);
    const all = rounds(id);
    const doubles = all.filter(double);
    assert.ok(doubles.length >= SEEDS * 0.13 && doubles.length <= SEEDS * 0.27, `${id}: ${doubles.length} of ${SEEDS}`);
    for (const r of doubles) {
      const where = `${id} ${JSON.stringify(r.equation)}`;
      assert.equal(game.rules['given.part'](r), r.answer, where);
      const rules = r.choices.map((c) => c.rule).filter(Boolean);
      assert.ok(!rules.includes('given.part'), where);
      // The next rule in the list fills its place: on a 4-card level that is the slip (answer +-1);
      // on the 3-card level 1, op.other, so two real errors stay (R4).
      assert.deepEqual(rules.sort(), lvl.options === 4 ? ['given.whole', 'op.other', 'slip.near'] : ['given.whole', 'op.other'], where);
      if (lvl.options === 4) assert.ok([r.answer - 1, r.answer + 1].includes(r.choices.find((c) => c.rule === 'slip.near').value));
    }
    // The other rounds keep the given part's card (with nothing under the cover the part is the
    // whole, and given.whole, first in the list, tags it).
    for (const r of all.filter((x) => !double(x) && x.answer !== 0)) {
      assert.ok(r.choices.some((c) => c.rule === 'given.part'), `${id}: ${JSON.stringify(r.equation)} keeps the given part`);
    }
    if (lvl.skill === 'num.parts.make-ten') {
      assert.ok(doubles.every((r) => r.answer === 5), `${id}: 5 + 5 is the only double of ten`);
      const parts = new Set(all.map((r) => count(r, 'part')));
      for (const k of [1, 2, 3, 4, 5, 6, 7, 8, 9]) assert.ok(parts.has(k), `${id}: ${k} + ? = 10 appears`);
    } else {
      const halves = new Set(doubles.map((r) => r.answer));
      assert.deepEqual([...halves].sort(), lvl.max === 5 ? [2] : [2, 3, 4, 5], `${id}: every double up to ${lvl.max}`);
    }
  }
  const zero = rounds('split-10').filter((r) => r.answer === 0).length;
  assert.ok(zero >= SEEDS * 0.05 && zero <= SEEDS * 0.16, `split-10 still covers nothing in about one round in ten: ${zero}`);
});
