// The stories' own tests (architecture 4.9): R6 [unit], the generator and its cards, the build order
// of the equation row, the geometry of scene.js at every u of every listed screen and thumb, the
// floors and rows, and the layout's tokens against app.css and design.md. The generic checks are
// tests/games.test.js's, which runs every game of games/registry.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import * as stories from '../games/stories/game.js';
import { GLYPH, PX, ROLE_TOKEN, ROUND, THUMB, builtAt, layoutScene, len, lidAt, phasesOf, planScene, rowsFor, unitFor } from '../games/stories/scene.js';
import { RULES } from '../data/errors.js';
import { rng } from '../shell/rng.js';
import { variants } from '../scripts/lock-rounds.js';

const level = (/** @type {string} */ id) => stories.levels.find((l) => l.id === id);
/** @type {(id: string, s: number, k: number, eqform?: string, structure?: string) => any} the first round of a level with this story */
function roundOf(id, s, k, eqform = 'standard', structure = undefined) {
  const passed = structure ? { ...level(id), structure } : level(id);
  for (let seed = 1; seed < 20000; seed++) {
    const r = stories.makeRound(passed, rng(seed));
    if (r.story.s === s && r.story.k === k && r.eqform === eqform) return r;
  }
  throw new Error(`no ${id} round ${s}, ${k}, ${eqform}`);
}
const cards = (round) => round.choices.map((c) => c.value);

// ---------- R6 [unit] (rules.md R6, design 6.10) ----------

test('R6: places fill in rows of five, left to right, the top row first', () => {
  const round = roundOf('take-10', 9, 2);
  const L = layoutScene(planScene(round, 'rest'), ROUND);
  const at = (p) => L.marks.find((m) => m.place === p && ['object', 'outline'].includes(m.kind)).box;
  for (const u of [20, 40, 64]) {
    for (let p = 1; p < 9; p++) {
      const [a, b] = [at(p - 1), at(p)].map((x) => [len(x.x, u), len(x.y, u)]);
      if (p % 5) assert.ok(b[0] > a[0] && b[1] === a[1], `place ${p} right of ${p - 1}, same row`);
      else assert.ok(b[1] > a[1] && b[0] === len(at(0).x, u), `place ${p} starts the next row`);
    }
  }
});

test('R6: the start first, what came after it, the leavers last; the result and the whole from place 0', () => {
  const places = (plan, f) => plan.items.filter(f).map((i) => i.place);
  const add = planScene(roundOf('add-10', 4, 3), 'rest');
  assert.deepEqual(places(add, (i) => i.role === 'part'), [0, 1, 2, 3]);
  assert.deepEqual(places(add, (i) => i.role === 'added'), [4, 5, 6]);
  assert.deepEqual(add.items.find((i) => i.kind === 'wrap'), { id: 'wrap', kind: 'wrap', role: 'unknown', from: 0, to: 7 });
  const take = planScene(roundOf('take-10', 9, 4), 'rest');
  assert.deepEqual(places(take, (i) => i.role === 'part'), [0, 1, 2, 3, 4]);
  assert.deepEqual(places(take, (i) => i.kind === 'outline'), [5, 6, 7, 8]);
  assert.deepEqual([take.items.find((i) => i.kind === 'wrap').from, take.items.find((i) => i.kind === 'wrap').to], [0, 5]);
  // The leavers are the last in fill order, and leave during the event.
  assert.deepEqual(planScene(roundOf('take-10', 9, 4), 'event:B').leaving.map((i) => i.place), [5, 6, 7, 8]);
  const whole = planScene(roundOf('whole-10', 4, 3), 'rest');
  assert.deepEqual(places(whole, (i) => i.role === 'part' && !i.second), [0, 1, 2, 3]);
  assert.deepEqual(places(whole, (i) => i.second), [4, 5, 6]);
  // Level 3: the dome after the dots, the dome's places continue the rows when it lifts.
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8].map(lidAt), [1, 2, 3, 5, 5, 6, 7, 8]);
  assert.deepEqual(places(planScene(roundOf('add-change', 4, 3), 'solved'), (i) => i.role === 'unknown'), [4, 5, 6]);
});

test('R6: the role tokens; the light shade only on the basket\'s second part; no whole fill, an unknown fill only under the dome', () => {
  const css = readFileSync(new URL('../app.css', import.meta.url), 'utf8');
  for (const token of Object.values(ROLE_TOKEN)) assert.match(css, new RegExp(`${token}: #`), token);
  for (const base of stories.levels) {
    for (const passed of variants(base)) {
      for (let seed = 1; seed <= 40; seed++) {
        const round = stories.makeRound(passed, rng(seed));
        for (const state of [...phasesOf(round), 'hint', 'solved', { tour: 1, hint: true }]) {
          const { items } = planScene(round, state);
          for (const item of items) {
            assert.ok(!item.second || base.structure === 'part-whole', `${base.id}: data-second outside the basket`);
            assert.notEqual(item.kind === 'object' && item.role, 'whole', `${base.id}: a whole fill`);
            if (item.kind === 'object' && item.role === 'unknown') assert.equal(base.id, 'add-change', 'an unknown fill outside the dome');
          }
        }
      }
    }
  }
});

// ---------- The generator (pedagogy 6.4) ----------

test('the generator: every story of each pool, a third reversed where the level says so, both verbs, no zero', () => {
  for (const base of stories.levels) {
    for (const passed of variants(base)) {
      const pool = stories.poolOf(passed);
      const seen = new Set();
      const verbs = new Set();
      let reversed = 0;
      for (let seed = 1; seed <= 2000; seed++) {
        const r = stories.makeRound(passed, rng(seed));
        seen.add(`${r.story.s},${r.story.k}`);
        verbs.add(r.story.verb);
        if (r.eqform === 'reversed') reversed += 1;
        assert.ok(r.story.s > 0 && r.story.k > 0 && r.story.r > 0);
      }
      assert.equal(seen.size, pool.length, `${base.id} ${passed.structure}: every pool story dealt`);
      if (base.forms) assert.ok(Math.abs(reversed / 2000 - 1 / 3) <= 0.04, `${base.id}: ${reversed} reversed`);
      else assert.equal(reversed, 0);
      if (passed.structure === 'change-take') assert.deepEqual([...verbs].sort(), ['fly', 'pop']);
    }
  }
  assert.deepEqual(['add-5', 'add-10', 'add-change', 'take-5', 'take-10', 'whole-5', 'whole-10'].map((id) => stories.poolOf(level(id)).length), [9, 35, 34, 10, 35, 7, 30]);
  // No 1 + 1 (its cards would be 1 twice and a 0), and no equal parts in the basket (decisions.md 2026-10-31).
  assert.ok(!stories.poolOf(level('add-5')).some((p) => p.s === 1 && p.k === 1));
  for (const id of ['whole-5', 'whole-10']) assert.ok(!stories.poolOf(level(id)).some((p) => p.s === p.k), id);
  // Level 3 deals no 9 + ? = 10 (design 6.10: no room for the dome after four dots in the second row).
  assert.ok(!stories.poolOf(level('add-change')).some((p) => p.s === 9));
});

test('the cards of pedagogy 6.4: real errors first, the budget\'s cap, slips only where nothing real is left', () => {
  assert.deepEqual(cards(roundOf('add-10', 4, 3)), [1, 4, 6, 7]);
  assert.deepEqual(cards(roundOf('take-10', 9, 4)), [4, 5, 9, 13]);
  // 4 + ? = 7: count.start-included gives 4 too, and given.part, first in the list, keeps it.
  assert.deepEqual(roundOf('add-change', 4, 3).choices, [{ value: 3, rule: null }, { value: 4, rule: 'given.part' }, { value: 7, rule: 'given.whole' }, { value: 11, rule: 'op.other' }]);
  // 6 + ? = 9: op.other's 15 needs five rows.
  const six = roundOf('add-change', 6, 3);
  assert.deepEqual(cards(six), [3, 4, 6, 9]);
  assert.equal(rowsFor(six, 'overflow', 15), 5);
  assert.match(stories.budget(six, { value: 15, rule: 'op.other' }), /5 rows, 4 at most/);
  assert.deepEqual(roundOf('add-5', 1, 2).choices.map((c) => c.rule), ['op.other', 'count.start-included', null]);
  // No card is 0 (playtest 2026-10-31): where op.other is 0 (2 + 2, 3 + 3) the next rule takes its place.
  assert.deepEqual(roundOf('add-5', 2, 2).choices, [{ value: 2, rule: 'given.part' }, { value: 3, rule: 'count.start-included' }, { value: 4, rule: null }]);
  assert.deepEqual(roundOf('add-10', 3, 3).choices.map((c) => c.rule), ['given.part', 'count.start-included', null, 'slip.near']);
  assert.equal(stories.canShow(roundOf('add-10', 3, 3), { value: 0, rule: 'op.other' }), false);
  for (const base of stories.levels) {
    for (const passed of variants(base)) {
      for (let seed = 1; seed <= 2000; seed++) assert.ok(stories.makeRound(passed, rng(seed)).choices.every((c) => c.value >= 1), `${base.id} ${seed}`);
    }
  }
  // given.part: the start in add and in the basket, the change in take, whatever the form.
  assert.equal(stories.rules['given.part'](roundOf('take-10', 7, 3, 'reversed')), 3);
  assert.equal(stories.rules['given.part'](roundOf('whole-10', 3, 4, 'reversed')), 3);
  // Where the slips are (decisions.md 2026-10-30, 2026-10-31): level 2 and the mixed add in 10 of 35, every round of level 7, nowhere else.
  for (const base of stories.levels) {
    for (const passed of variants(base)) {
      const slips = stories.poolOf(passed).filter(({ s, k }) => roundOf(base.id, s, k, 'standard', passed === base ? undefined : passed.structure).choices.some((c) => c.rule === 'slip.near')).length;
      const want = { 'add-10': 10, 'whole-10': 30, 'mixed-10': passed.structure === 'change-add' ? 10 : 0 }[base.id] ?? 0;
      assert.equal(slips, want, `${base.id} ${passed.structure}`);
    }
  }
  // op.other leaves level 3 in 7 of its 34 stories (2s + r over 20), and no other level.
  const capped = stories.poolOf(level('add-change')).filter(({ s, k }) => !roundOf('add-change', s, k).choices.some((c) => c.rule === 'op.other'));
  assert.deepEqual(capped.map(({ s, r }) => 2 * s + r > 20), Array(7).fill(true));
});

test('labels: the locked templates, singular where a number is 1', () => {
  assert.equal(stories.labelOf(roundOf('add-10', 4, 3)), 'הָיוּ 4, וּבָאוּ עוֹד 3');
  assert.equal(stories.labelOf(roundOf('add-5', 1, 4)), 'הָיָה 1, וּבָאוּ עוֹד 4');
  assert.equal(stories.labelOf(roundOf('add-5', 4, 1)), 'הָיוּ 4, וּבָא עוֹד 1');
  assert.equal(stories.labelOf(roundOf('add-change', 1, 6)), 'הָיָה 1, בָּאוּ עוֹד, וְעַכְשָׁיו יֵשׁ 7');
  const take = roundOf('take-5', 3, 1);
  assert.equal(stories.labelOf(take), take.story.verb === 'fly' ? 'הָיוּ 3, וְ-1 עָף' : 'הָיוּ 3, וְ-1 הִתְפּוֹצֵץ');
  assert.equal(stories.labelOf(roundOf('whole-5', 1, 3)), 'בַּסַּל 1 צָהֹב וְ-3 בְּהִירִים');
  assert.equal(stories.labelOf(roundOf('whole-5', 3, 1)), 'בַּסַּל 3 צְהֻבִּים וְ-1 בָּהִיר');
  for (const base of stories.levels) {
    for (const passed of variants(base)) {
      for (const { s, k } of stories.poolOf(passed)) {
        const text = stories.labelOf(roundOf(base.id, s, k, 'standard', passed === base ? undefined : passed.structure));
        assert.ok(!text.includes(String.fromCharCode(0x05bd)) && /[א-ת]/.test(text) && !/undefined|NaN/.test(text), text);
      }
    }
  }
});

test('the mixed level: at rest no wrap, the small dome alone over the picture\'s first row; the wrap with the hint, the tour and the closing (playtest 2026-10-31)', () => {
  const ids = (round, state) => planScene(round, state).items.map((i) => i.id);
  const take = roundOf('mixed-10', 9, 6, 'standard', 'change-take');
  assert.ok(!ids(take, 'rest').includes('wrap'));
  assert.ok(ids(take, 'rest').includes('dome-top'));
  for (const state of ['hint', { hint: true, tour: 1 }, 'solved']) assert.ok(ids(take, state).includes('wrap'), JSON.stringify(state));
  assert.ok(ids(take, 'hint').includes('dome') && !ids(take, 'hint').includes('dome-top'));
  // The dome alone stands over the middle of the five first places, the wrap's over the three that stayed.
  const mid = (state, id, round = take) => {
    const m = layoutScene(planScene(round, state), ROUND).marks.find((x) => x.id === id);
    return len(m.box.x, 40) + len(m.box.w, 40) / 2;
  };
  const L = layoutScene(planScene(take, 'rest'), ROUND);
  assert.equal(mid('rest', 'dome-top'), len(L.dw, 40) / 2);
  assert.ok(mid('hint', 'dome') < mid('rest', 'dome-top'));
  // The add story: the dome stands where the wrap's will, so it keeps its id; levels 2 and 5 keep the wrap at rest.
  const add = roundOf('mixed-10', 4, 3, 'standard', 'change-add');
  assert.ok(ids(add, 'rest').includes('dome') && !ids(add, 'rest').includes('wrap'));
  assert.equal(mid('rest', 'dome', add), mid('hint', 'dome', add));
  for (const [id, s, k] of [['add-10', 4, 3], ['take-10', 9, 6]]) assert.ok(ids(roundOf(id, s, k), 'rest').includes('wrap'), id);
});

// ---------- The build order (design 6.10, ctx.build) ----------

test('build order: the start, its operator, the ?, then the rest, a reversed row from its right; the picture\'s ? first; all at the end', () => {
  const built = (round) => phasesOf(round).map((p) => builtAt(round, p));
  assert.deepEqual(built(roundOf('add-10', 4, 3)), [[0], [0], [0, 1, 2], null]);
  assert.deepEqual(built(roundOf('take-10', 7, 3, 'reversed')), [[2], [2], [2, 3, 4], null]);
  assert.deepEqual(built(roundOf('add-change', 4, 3)), [[0], [0, 1], [0, 1, 2], null]);
  assert.deepEqual(built(roundOf('add-change', 4, 3, 'reversed')), [[2], [2, 3], [2, 3, 4], null]);
  assert.deepEqual(built(roundOf('whole-10', 4, 3, 'reversed')), [null, null, null]);
  for (const base of stories.levels) {
    for (const passed of variants(base)) {
      for (let seed = 1; seed <= 60; seed++) {
        const round = stories.makeRound(passed, rng(seed));
        const tokens = [...round.equation.left, '=', ...round.equation.right];
        const phases = phasesOf(round);
        assert.equal(phases.at(-1), 'rest');
        assert.equal(builtAt(round, 'rest'), null, 'reduced motion and the end: every token');
        const picture = phases.findIndex((p) => planScene(round, p).items.some((i) => i.kind === 'dome' || i.kind === 'bracket' || (i.kind === 'lid' && i.mark === '?')));
        phases.forEach((p, j) => {
          const shown = builtAt(round, p) ?? tokens.map((_, i) => i);
          if (shown.some((i) => tokens[i] === '?')) assert.ok(picture !== -1 && picture <= j, `${base.id}: the equation's ? before the picture's`);
          if (j) assert.ok((builtAt(round, phases[j - 1]) ?? []).every((i) => shown.includes(i)), 'a token, once shown, stays');
        });
      }
    }
  }
});

// ---------- Geometry (design 6.10, architecture 4.9) ----------

/** The screens of design 5 and the panel's content box there (app.css .panel: clamp height and padding). */
const VIEWPORTS = [[320, 568], [320, 698], [360, 640], [360, 800], [375, 550], [390, 844], [412, 915], [568, 320], [844, 390], [768, 1024], [1024, 1366]];
const clamp = (lo, x, hi) => Math.min(hi, Math.max(lo, x));
const stageOf = ([vw, vh]) => {
  const pad = clamp(8, 0.03 * vw, 16);
  return [Math.min(vw, 592) - 32 - 2 * pad, clamp(200, 0.4 * vh, 380) - 2 * pad];
};
const STAGES = VIEWPORTS.map(stageOf);
/** The panel's padding at a viewport (app.css .panel): its clip edge is this far past the stage. */
const padOf = ([vw]) => clamp(8, 0.03 * vw, 16);
/** Home's game card, the end screen's (design 6.1): the thumb's content box. */
const THUMBS = [[114, 96], [149, 96], [122, 80]];

/** @type {Record<string, string | null>} a mark's kind to its class for the clearances */
const CLASS = { object: 'item', outline: 'item', ghost: 'item', place: 'item', ring: 'ring', line: 'line', lid: 'cover', cover: 'cover', qmark: 'q', chip: 'chip', dome: 'dome', arc: 'arc', digit: 'digit', halo: null, coverPlace: null };
/** @type {(m: any) => string | null} the tour's ring is drawn as lines on track 0, and kept as a ring: no chip on it */
const classOf = (m) => (m.group === 'tour-ring' ? 'tour' : CLASS[m.kind]);

/**
 * The clearance two marks keep, in px (architecture 4.9), or null where they may meet: objects 6;
 * a ring (the tour's too) or a line to an item 1; a magenta line to the navy 3; a cover and its halo
 * to an item 4, to a line 3; chips to chips, domes and covers 2; the dome on the line it stands on 0;
 * arcs, chips and rings 1 from each other; an arc 1 from a line (a jump never runs into the wrap or
 * the whole's line, playtest 2026-10-31); a cover's '?' 1 from everything but its own cover. A chip
 * may lie over a track-1 line, an arc over rings.
 */
function need(a, b) {
  const [x, y] = [classOf(a), classOf(b)];
  if (!x || !y || x === 'digit' || y === 'digit') return null;
  if (x === 'q' || y === 'q') {
    const [q, other] = x === 'q' ? [a, b] : [b, a];
    return other.id === q.of || other.group === q.of ? null : 1;
  }
  const same = a.place !== undefined && a.place === b.place;
  const pair = [x, y].sort().join('-');
  const roles = [a.role, b.role].sort().join('-');
  const dome = a.kind === 'dome' ? a : b.kind === 'dome' ? b : null;
  return {
    'item-item': same ? null : 6, 'item-ring': same ? null : 1, 'item-line': 1, 'cover-item': 4, 'chip-item': 1, 'dome-item': 1,
    'ring-ring': 1, 'line-ring': 1, 'cover-ring': 1, 'chip-ring': 1, 'dome-ring': 1,
    'line-line': a.group === b.group ? null : roles === 'unknown-whole' ? 3 : 1, 'cover-line': 3,
    'item-tour': 1, 'ring-tour': 1, 'line-tour': roles === 'unknown-whole' ? 3 : 1, 'cover-tour': 3, 'chip-tour': 1, 'dome-tour': 1, 'tour-tour': null,
    'dome-line': dome && (a.group ?? b.group) === (dome.on === 'wrap' ? 'wrap' : 'bracket') ? 0 : 1,
    'cover-cover': a.group && a.group === b.group ? null : 2, 'chip-cover': 2, 'cover-dome': 2, 'arc-cover': 1,
    'chip-chip': 2, 'chip-dome': 2, 'arc-chip': 1, 'arc-dome': 1, 'arc-line': 1,
  }[pair] ?? null;
}

/** @type {(b: any) => [number, number][]} a box's four separations from another as lengths: x, x, y, y */
const gaps = (a, b) => [
  [b.x[0] - a.x[0] - a.w[0], b.x[1] - a.x[1] - a.w[1]], [a.x[0] - b.x[0] - b.w[0], a.x[1] - b.x[1] - b.w[1]],
  [b.y[0] - a.y[0] - a.h[0], b.y[1] - a.y[1] - a.h[1]], [a.y[0] - b.y[0] - b.h[0], a.y[1] - b.y[1] - b.h[1]],
];

/**
 * The smallest separation of two boxes over u in [lo, hi], and where. The separation is the largest
 * of four affine gaps, a convex function, so its least value is at an end or where two gaps cross:
 * exact at every u, so at every 0.25px step too.
 */
function closest(a, b, lo, hi) {
  const fs = gaps(a, b);
  const us = [lo, hi];
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
    const d = fs[i][0] - fs[j][0];
    if (Math.abs(d) > 1e-12) {
      const u = (fs[j][1] - fs[i][1]) / d;
      if (u > lo && u < hi) us.push(u);
    }
  }
  let best = { gap: Infinity, u: lo };
  for (const u of us) {
    const gap = Math.max(...fs.map((f) => f[0] * u + f[1]));
    if (gap < best.gap) best = { gap, u };
  }
  return best;
}

/** game.css: the tour's last digit grows 1.3 on a dot, 1.15 on a balloon (two digits in height only). */
const GROW = { dot: 1.3, balloon: 1.15 };
/** @type {(text: string, font: number, grow: number) => [number, number]} a number's ink on an object (design 6.10), the tour's last grown by grow */
function inkOf(text, font, grow) {
  const ink = text.length === 1 ? GLYPH.ink14.digit : GLYPH.ink14[text];
  if (!ink) throw new Error(`no measured ink for ${text}`);
  const [w, h] = ink.map((x) => (x * font) / 14);
  return grow ? [text.length === 1 ? w * grow : w, h * grow] : [w, h];
}

/** Every story of every level's pool (poolOf), both verbs of take, one round each (with its cards), by level and numbers. */
function cases() {
  const out = [];
  for (const base of stories.levels) {
    for (const passed of variants(base)) {
      const want = new Set(stories.poolOf(passed).flatMap(({ s, k }) => (passed.structure === 'change-take' ? ['fly', 'pop'] : ['']).map((v) => `${s}/${k}/${v}`)));
      for (let seed = 1; want.size && seed < 20000; seed++) {
        const round = stories.makeRound(passed, rng(seed));
        const story = `${round.story.s}/${round.story.k}/${round.structure === 'change-take' ? round.story.verb : ''}`;
        if (want.delete(story)) out.push({ base, round, key: `${base.id}/${round.structure}/${story}` });
      }
      assert.equal(want.size, 0, `${base.id} ${passed.structure}: no round for ${[...want]}`);
    }
  }
  return out;
}
const CASES = cases();

/** The states of a round (architecture 4.9): the event's phases, rest, each card's display (with the hint on 3-option levels), the hint, each tour step, solved. */
function statesOf(base, round) {
  const wrong = round.choices.filter((c) => c.rule).map((c) => ({ display: RULES[c.rule].display, rule: c.rule, value: c.value }));
  const N = round.structure === 'change-take' ? round.story.r : round.story.k;
  return [
    ...phasesOf(round), 'hint', 'solved', ...wrong, ...(base.options === 3 ? wrong.map((w) => ({ ...w, hint: true })) : []),
    ...Array.from({ length: N }, (_, j) => ({ hint: true, tour: j + 1 })), { hint: true, solved: true }, { hint: true, tour: N, solved: true },
  ];
}

/**
 * The geometry of one layout over u in [lo, hi] (architecture 4.9): every box inside the drawing
 * (a move's offset aside: checkMoves), every pair at its clearance, every chip's digits inside
 * it by 1px, every digit's ink inside its disc by 1px (a rectangle in a circle) and 1px off what
 * could cover it, sampled every 0.25px (a font has a floor, so it is not affine).
 * @returns {string[]}
 */
function checkLayout(L, lo, hi) {
  const problems = [];
  const at = (l, u) => len(l, u);
  const marks = L.marks.filter((m) => !m.leaving);
  for (const m of marks) {
    for (const u of [lo, hi]) {
      const [x, y, w, h] = [at(m.box.x, u), at(m.box.y, u), at(m.box.w, u), at(m.box.h, u)];
      if (x < -1e-6 || y < -1e-6 || x + w > at(L.dw, u) + 1e-6 || y + h > at(L.dh, u) + 1e-6 || w < 0 || h < 0) problems.push(`${m.id} leaves the drawing at u ${u}`);
    }
  }
  for (let i = 0; i < marks.length; i++) {
    for (let j = i + 1; j < marks.length; j++) {
      const c = need(marks[i], marks[j]);
      if (c === null) continue;
      const { gap, u } = closest(marks[i].box, marks[j].box, lo, hi);
      if (gap < c - 1e-6) problems.push(`${marks[i].id} and ${marks[j].id}: ${gap.toFixed(2)}px at u ${u.toFixed(2)}, ${c} needed`);
    }
  }
  for (const chip of marks.filter((m) => m.kind === 'chip')) {
    for (const u of [lo, hi]) {
      const font = at(chip.font, u);
      if (chip.text.length * GLYPH.advance * font + 2 > at(chip.box.w, u) + 1e-6 || GLYPH.ink * font + 2 > at(chip.box.h, u) + 1e-6) problems.push(`${chip.id}: ${chip.text} does not fit at u ${u}`);
    }
  }
  const digits = marks.filter((m) => m.kind === 'digit');
  const covers = marks.filter((m) => ['arc', 'chip', 'dome', 'lid', 'cover', 'qmark'].includes(m.kind));
  for (let u = lo; digits.length && u <= hi + 1e-9; u = u + 0.25 > hi && u < hi ? hi : u + 0.25) {
    const inks = digits.map((d) => {
      const font = Math.max(d.font.min, d.font.k * u);
      const [w, h] = inkOf(d.text, font, d.grow ? GROW[d.on] : 0);
      const D = at(d.box.w, u);
      if ((w + 2) ** 2 + (h + 2) ** 2 > D ** 2 + 1e-6) problems.push(`${d.id}: ${d.text} at ${font.toFixed(1)}px leaves its ${D.toFixed(1)}px disc at u ${u}`);
      // On a balloon one digit keeps inside its white circle (the line and 8% in from the disc; the tour's
      // last grows with its circle there), so no white outline shows on the balloon's colour (playtest 2026-10-31).
      const C = (D - 2 * PX.line - 0.16 * D) * (d.grow && d.on === 'balloon' ? GROW.balloon : 1);
      if (d.on === 'balloon' && d.text.length === 1 && w ** 2 + h ** 2 > C ** 2 + 1e-6) problems.push(`${d.id}: ${d.text} at ${font.toFixed(1)}px leaves its ${C.toFixed(1)}px white circle at u ${u}`);
      const [cx, cy] = [at(d.box.x, u) + D / 2, at(d.box.y, u) + at(d.box.h, u) / 2];
      return { id: d.id, x0: cx - w / 2, x1: cx + w / 2, y0: cy - h / 2, y1: cy + h / 2 };
    });
    const boxes = covers.map((m) => ({ id: m.id, x0: at(m.box.x, u), y0: at(m.box.y, u), x1: at(m.box.x, u) + at(m.box.w, u), y1: at(m.box.y, u) + at(m.box.h, u) }));
    for (const [i, ink] of inks.entries()) {
      for (const other of [...boxes, ...inks.slice(i + 1)]) {
        const gap = Math.max(other.x0 - ink.x1, ink.x0 - other.x1, other.y0 - ink.y1, ink.y0 - other.y1);
        if (gap < 1 - 1e-6) problems.push(`${ink.id} and ${other.id}: ${gap.toFixed(2)}px at u ${u}`);
      }
    }
  }
  return problems;
}

/**
 * The event's moves at each listed screen (design 6.10): an arrival starts, and a flown leaver ends,
 * wholly past the panel's clip. The drawing is centred in the stage (the panel's content box), and
 * the clip is the panel's padding box: the stage and its padding.
 * @returns {string[]}
 */
function checkMoves(L) {
  const problems = [];
  VIEWPORTS.forEach((vp, i) => {
    const [W, H] = STAGES[i];
    const pad = padOf(vp);
    const u = unitFor(L, W, H);
    const [dw, dh] = [len(L.dw, u), len(L.dh, u)];
    const [clipRight, clipTop] = [(W + dw) / 2 + pad, -(H - dh) / 2 - pad];
    for (const m of L.marks) {
      if (m.from) {
        const x0 = len(m.box.x, u) + len(m.from.x, u) + m.from.stage[0] * W;
        if (x0 < clipRight - 1e-6) problems.push(`${m.id} arrives from ${(clipRight - x0).toFixed(1)}px inside the panel at ${vp.join('×')}`);
        if (len(m.from.y, u) + m.from.stage[1] * H !== 0) problems.push(`${m.id} arrives off its row`);
      }
      if (m.to) {
        const y1 = len(m.box.y, u) + len(m.box.h, u) + len(m.to.y, u) + m.to.stage[1] * H;
        if (y1 > clipTop + 1e-6) problems.push(`${m.id} flies off ${(y1 - clipTop).toFixed(1)}px inside the panel at ${vp.join('×')}`);
      }
    }
  });
  return problems;
}

test('geometry: every case, state and u from the state\'s floor to 64 at the listed screens; thumbs at rest and solved', () => {
  const problems = [];
  const floors = { digits: Infinity, ghosts: Infinity, other: Infinity, thumb: Infinity };
  let states = 0;
  for (const { base, round, key } of CASES) {
    const rest = layoutScene(planScene(round, 'rest'), ROUND);
    for (const state of statesOf(base, round)) {
      states += 1;
      const plan = planScene(round, state);
      const L = layoutScene(plan, ROUND);
      const lo = Math.min(...STAGES.map(([w, h]) => unitFor(L, w, h)));
      const where = `${key} ${JSON.stringify(state)}`;
      const digits = L.marks.some((m) => m.kind === 'digit');
      const ghosts = state.display === 'overflow';
      const floor = digits ? 22 : 14;
      floors[digits ? 'digits' : ghosts ? 'ghosts' : 'other'] = Math.min(floors[digits ? 'digits' : ghosts ? 'ghosts' : 'other'], lo);
      if (lo < floor) problems.push(`${where}: u ${lo.toFixed(2)} under the ${floor}px floor`);
      if (digits && L.rows > 3) problems.push(`${where}: digits on ${L.rows} rows`);
      problems.push(...checkLayout(L, Math.min(lo, ROUND.uMax), ROUND.uMax).map((p) => `${where}: ${p}`));
      // An event mark ends on its rest box, and moves from or to outside the panel.
      if (typeof state === 'string' && state.startsWith('event:')) {
        problems.push(...checkMoves(L).map((p) => `${where}: ${p}`));
        for (const m of L.marks) {
          const end = rest.marks.find((x) => x.id === m.id);
          if (end && !isDeepStrictEqual(end.box, m.box)) problems.push(`${where}: ${m.id} does not end on its rest box`);
        }
      }
    }
    // Level 3 holds the rows of r from the mount: the dome lifts without a re-layout.
    if (base.id === 'add-change') assert.deepEqual(layoutScene(planScene(round, 'solved'), ROUND).dh, rest.dh, key);
    for (const state of ['rest', 'solved']) {
      const L = layoutScene(planScene(round, state), THUMB);
      for (const [w, h] of THUMBS) {
        const u = unitFor(L, w, h);
        floors.thumb = Math.min(floors.thumb, u);
        if (u < 14) problems.push(`${key} thumb ${state} ${w}×${h}: u ${u.toFixed(2)}`);
        problems.push(...checkLayout(L, u, u).map((p) => `${key} thumb ${state} ${w}×${h}: ${p}`));
      }
    }
  }
  assert.deepEqual([...new Set(problems)].slice(0, 25), [], `${problems.length} problems`);
  assert.ok(states > 2000, `${states} states`);
  // The narrowest states (design 6.10): digits about 22.35px (the count-up of 11 under a basket of
  // 10 on a landscape phone), a 4-row overflow about 16.4px, thumbs about 15.6px.
  assert.ok(floors.digits >= 22 && floors.digits < 23, `digits ${floors.digits}`);
  assert.ok(floors.ghosts >= 14 && floors.ghosts < 18, `ghosts ${floors.ghosts}`);
  assert.ok(floors.thumb >= 14, `thumbs ${floors.thumb}`);
});

test('a round of fewer than five columns stands in the middle of the drawing, the same in every state; the basket fills its rim from the left (playtest 2026-10-31)', () => {
  const u = 40;
  const counts = {};
  for (const { base, round, key } of CASES) {
    const c = round.stage.cols;
    counts[c] = (counts[c] ?? 0) + 1;
    let [lo, hi, dw] = [Infinity, -Infinity, 0];
    for (const state of statesOf(base, round)) {
      const L = layoutScene(planScene(round, state), ROUND);
      dw = len(L.dw, u);
      for (const m of L.marks.filter((x) => ['object', 'outline', 'ghost', 'place'].includes(x.kind) && !x.leaving)) {
        const mid = len(m.box.x, u) + len(m.box.w, u) / 2;
        [lo, hi] = [Math.min(lo, mid), Math.max(hi, mid)];
      }
    }
    const pitch = len(ROUND.G, u) + u;
    if (round.structure === 'part-whole') {
      assert.equal(c, 5, key);
      assert.ok(Math.abs(lo - (len(ROUND.Ms, u) + u / 2)) < 1e-9, `${key}: the first ball in the rim's first column`);
      continue;
    }
    assert.ok(Math.abs((hi - lo) / pitch - (c - 1)) < 1e-9, `${key}: its places span ${c} columns`);
    assert.ok(Math.abs((lo + hi) / 2 - dw / 2) < 1e-9, `${key}: ${c} columns, off the middle by ${((lo + hi) / 2 - dw / 2).toFixed(2)}px`);
  }
  // Only the stories to 5 have fewer: 1 + 2 (and its cards) in three columns.
  assert.ok(counts[3] > 0 && counts[4] > 0, JSON.stringify(counts));
  assert.equal(roundOf('add-5', 1, 2).stage.cols, 3);
});

test('rows: the story\'s and the places a display fills past them; the budget says no exactly above 4; a digit display needs 3 at most', () => {
  // design 6.10, written out apart from planScene: the story's rows (the start of take, else the
  // result or whole), and overflow and count-up fill v places from the asked group's first place.
  const expected = (round, display, value) => {
    const { s, r } = round.story;
    const n = Math.ceil((round.structure === 'change-take' ? s : r) / 5);
    const g0 = round.unknown === 'change' ? s : 0;
    return ['overflow', 'count-up'].includes(display) ? Math.max(n, Math.ceil((g0 + value) / 5)) : n;
  };
  const seen = new Set();
  for (const { round, key } of CASES) {
    for (const rule of ['op.other', 'given.whole', 'given.part', 'count.start-included', 'slip.near']) {
      const predicted = stories.rules[rule](round);
      for (const value of predicted === null ? [] : predicted.oneOf ?? [predicted]) {
        if (!Number.isInteger(value) || value < 0) continue;
        const { display } = RULES[rule];
        const rows = rowsFor(round, display, value);
        seen.add(rows);
        assert.equal(rows, expected(round, display, value), `${key} ${rule} ${value}`);
        assert.equal(stories.budget(round, { value, rule }) !== null, expected(round, display, value) > 4, `${key} ${rule} ${value}`);
        if (['count-up', 'jumps'].includes(display)) assert.ok(rows <= 3, `${rule} ${value}: ${rows} rows`);
      }
    }
  }
  assert.deepEqual([...seen].sort(), [1, 2, 3, 4, 5, 6]);
  // 6 + ? = 9: op.other's 15 from place 6 needs 5 rows, and is not dealt; 10 − 9 = ?: its 19 from place 0 needs 4, and is.
  const six = roundOf('add-change', 6, 3);
  assert.equal(rowsFor(six, 'overflow', 15), 5);
  assert.match(stories.budget(six, { value: 15, rule: 'op.other' }), /5 rows/);
  assert.ok(!six.choices.some((c) => c.value === 15));
  const ten = roundOf('take-10', 10, 9);
  assert.equal(rowsFor(ten, 'overflow', 19), 4);
  assert.equal(stories.budget(ten, { value: 19, rule: 'op.other' }), null);
  assert.deepEqual(ten.choices.find((c) => c.value === 19), { value: 19, rule: 'op.other' });
});

test('an event: arrivals slide in from the right, leavers fly up or pop, the fixed dome slides in and lands on its row', () => {
  const add = layoutScene(planScene(roundOf('add-10', 4, 3), 'event:B'), ROUND);
  assert.deepEqual(add.marks.filter((m) => m.from).map((m) => m.id), ['obj-4', 'obj-5', 'obj-6']);
  const take = layoutScene(planScene(roundOf('take-5', 5, 2), 'event:B'), ROUND);
  const gone = take.marks.filter((m) => m.leaving);
  assert.deepEqual(gone.map((m) => m.place), [3, 4]);
  assert.ok(gone.every((m) => (m.leaving === 'up') === (m.to !== null)));
  // A leaver of the second row rises half a column to the right, between the first row's places
  // (playtest 2026-10-31); one of the first row straight up.
  const fly = (s, k) => {
    for (let seed = 1; seed < 5000; seed++) {
      const r = stories.makeRound(level('take-10'), rng(seed));
      if (r.story.s === s && r.story.k === k && r.story.verb === 'fly') return r;
    }
    throw new Error('no round');
  };
  const ten = layoutScene(planScene(fly(10, 7), 'event:B'), ROUND).marks.filter((m) => m.leaving);
  assert.deepEqual(ten.map((m) => m.place), [3, 4, 5, 6, 7, 8, 9]);
  for (const m of ten) assert.deepEqual(m.to.x, m.place < 5 ? [0, 0] : [0.55, 8], `place ${m.place}`);
  const change = layoutScene(planScene(roundOf('add-change', 4, 3), 'event:B'), ROUND);
  const lid = change.marks.find((m) => m.id === 'lid');
  assert.equal(lid.mark, '');
  assert.ok(lid.from);
  // Its halo moves with it; the stage's share puts every move past the panel's clip (checkMoves).
  assert.deepEqual(change.marks.find((m) => m.id === 'lid-halo').from, lid.from);
  for (const m of [...add.marks, ...take.marks, ...change.marks]) {
    if (m.from) assert.deepEqual(m.from.stage, [0.5, 0], m.id);
    if (m.to) assert.deepEqual(m.to.stage, [0, -0.5], m.id);
  }
  // On its row's floor (the second row: no room after four dots), rising a quarter place above it.
  const dot = change.marks.find((m) => m.id === 'obj-0');
  for (const u of [22, 64]) {
    assert.equal(len(lid.box.y, u) + len(lid.box.h, u), len(dot.box.y, u) + 2 * u + len(ROUND.B, u));
    assert.equal(len(lid.box.x, u), len(dot.box.x, u));
  }
  assert.equal(layoutScene(planScene(roundOf('add-change', 4, 3), 'event:B2'), ROUND).marks.find((m) => m.id === 'lid').mark, '?');
});

test('the morph (levels 2, 5, 7): each dot starts on the disc of what it was, its middle and size, at every u; no other phase has it', () => {
  for (const id of ['add-10', 'take-10', 'whole-10']) {
    const round = stories.makeRound(level(id), rng(3));
    assert.deepEqual(phasesOf(round).slice(0, 2), ['event:0', 'event:M'], id);
    const before = layoutScene(planScene(round, 'event:0'), ROUND).marks.filter((m) => m.kind === 'object');
    const M = layoutScene(planScene(round, 'event:M'), ROUND).marks.filter((m) => m.kind === 'object');
    assert.equal(M.length, before.length, id);
    for (const dot of M) {
      const was = before.find((m) => m.place === dot.place);
      assert.ok(dot.morph && dot.shape === 'dot' && was.shape !== 'dot', `${id} ${dot.id}`);
      // A balloon's disc is its width square at the top of its box (its string hangs below it).
      for (const u of [ROUND.font.min, 32, 64]) {
        const D = len(was.box.w, u);
        assert.ok(Math.abs(len(dot.box.w, u) * dot.morph.k - D) < 1e-9, `${id} ${dot.id} size at ${u}`);
        assert.ok(Math.abs(len(dot.box.y, u) + len(dot.box.h, u) / 2 + len(dot.morph.dy, u) - (len(was.box.y, u) + D / 2)) < 1e-9, `${id} ${dot.id} middle at ${u}`);
        assert.ok(Math.abs(len(dot.box.x, u) + len(dot.box.w, u) / 2 - (len(was.box.x, u) + D / 2)) < 1e-9, `${id} ${dot.id} column at ${u}`);
      }
    }
    for (const phase of phasesOf(round).filter((p) => p !== 'event:M')) {
      assert.ok(layoutScene(planScene(round, phase), ROUND).marks.every((m) => !m.morph), `${id} ${phase}`);
    }
  }
});

// ---------- Tokens (design 3, 4, 6.6, 6.10) ----------

test('tokens: the layout\'s pixels are app.css\'s and design.md\'s', () => {
  const css = readFileSync(new URL('../app.css', import.meta.url), 'utf8');
  const design = readFileSync(new URL('../docs/design.md', import.meta.url), 'utf8');
  assert.match(css, new RegExp(`--ring: ${PX.line}px;`));
  assert.match(css, /--halo: #FFFFFF;\s+\/\* 3px gap/);
  assert.equal(PX.halo, 3);
  // A move past the stage's edge by the panel's largest padding is clipped (design 6.10).
  assert.match(css, new RegExp(`\\.panel \\{[^}]*padding: clamp\\(8px, 3vw, ${PX.out}px\\)`));
  assert.match(design, new RegExp(`מה שזז מתחיל או נגמר ${PX.out}px מעבר לקצה הבמה`));
  assert.match(design, new RegExp(`גשר של ${PX.bridge}px`));
  assert.match(design, new RegExp(`כיפה קטנה \\(${PX.dome}px\\)`));
  assert.match(design, new RegExp(`תג ההתחלה מעל הנקודה הראשונה, ${PX.chipGap}px מעליה`));
  assert.match(design, new RegExp(`ולפחות ${PX.digit.min}px`));
  assert.match(design, new RegExp(`כולן ${GLYPH.advance}em`));
  assert.match(design, new RegExp(`בין שני חפצים בשורה ${ROUND.G[0]}u ועוד ${ROUND.G[1]}px, ובין שורות ${ROUND.B[0]}u ועוד ${ROUND.B[1]}px`));
  assert.match(design, new RegExp(`רוחב הציור ${5 + 4 * ROUND.G[0] + 2 * ROUND.Ms[0]}u ועוד ${4 * ROUND.G[1] + 2 * ROUND.Ms[1]}px`));
  const { 10: ten, 11: eleven, digit } = GLYPH.ink14;
  assert.match(design, new RegExp(`הדיו של \`10\`\\s+הוא ${ten[0]} על ${ten[1]}px \\(של \`11\` ‏${eleven[0]} על ${eleven[1]}, של ספרה אחת עד ${digit[0]} על ${digit[1]}\\)`));
  assert.match(design, new RegExp(`רק טבעות, ולכן הרווח שם ${ROUND.Bd[0]}u ועוד ${ROUND.Bd[1]}px, והשוליים מתחתיה ${ROUND.Mbd[0]}u ועוד ${ROUND.Mbd[1]}px`));
  // The tour's last digit grows as the geometry test takes it: 1.3 on a dot, 1.15 with its circle on a balloon.
  const game = readFileSync(new URL('../games/stories/game.css', import.meta.url), 'utf8');
  assert.match(game, new RegExp(`\\.st-digit\\.is-grow \\{ scale: ${GROW.dot}; \\}`));
  assert.match(game, new RegExp(`\\.st-digit\\.is-grow\\[data-on="balloon"\\] \\{ scale: ${GROW.balloon}; \\}`));
  assert.match(game, /\.st-digit\.is-grow\[data-on="balloon"\]::before \{ scale: none; \}/);
  // The rectangle of 10's ink, with a pixel spare at each corner, needs a 21.94px disc (design 6.10).
  assert.equal(Math.hypot(ten[0] + 2, ten[1] + 2).toFixed(2), '21.94');
});
