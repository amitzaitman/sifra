// מִסְגֶּרֶת עֶשֶׂר: the parts of a number, making ten, ten and some more, and bridging ten
// (pedagogy 6.2). The module contract is docs/architecture.md section 2; the drawing is in
// draw.js, the help ladder's pictures in help.js.
import { settle } from '../../lib/settle.js';
import { SKILLS } from '../../data/skills.js';
import { drawBridge, drawBundles, drawFrame, drawTree, el } from './draw.js';
import { pictureOf } from './layout.js';
import { KINDS, layer, move } from './help.js';

export const meta = {
  id: 'ten-frame',
  title: 'מִסְגֶּרֶת עֶשֶׂר',
  version: 1,
  css: new URL('game.css', import.meta.url).href,
};

/**
 * What levels of a skill share; each level is a complete object (architecture 2.2).
 * @typedef {{ skill: string, structure: string, unknown: string, max: number, min?: number, bridge?: string, model: string,
 *   look: 'objects' | 'dots' | 'symbols', options: number, demo: boolean, terms: boolean }} Base
 */
/** @type {Base} */
const split = { skill: 'num.parts.split', structure: 'part-whole', unknown: 'part', max: 10, model: 'frame', look: 'dots', options: 4, demo: false, terms: false };
/** @type {Base} */
const ten = { ...split, skill: 'num.parts.make-ten' };
/** @type {Base} */
const teen = { skill: 'pv.teens.ten-and', structure: 'part-whole', unknown: 'whole', min: 10, max: 20, model: 'bundles', look: 'dots', options: 4, demo: false, terms: false };
/** @type {Base} */
const bridge = { skill: 'addsub.facts.bridge-add', structure: 'equation', unknown: 'result-right', min: 11, max: 20, bridge: 'ten', model: 'frame', look: 'dots', options: 4, demo: false, terms: false };

/** The level table of pedagogy 6.2; level n is levels[n - 1]. Ids are stable (architecture 2.2). @type {Level[]} */
export const levels = [
  { id: 'split-5', ...split, max: 5, options: 3, demo: true },
  { id: 'split-10', ...split },
  { id: 'split-bond', ...split, model: 'tree', demo: true },
  { id: 'split-pairs', ...split, unknown: 'both', model: 'cards', demo: true },
  { id: 'ten-empty', ...ten, demo: true },
  { id: 'ten-cover', ...ten },
  { id: 'ten-symbols', ...ten, look: 'symbols', eqform: ['standard', 'reversed'] },
  { id: 'teen-bundle', ...teen, demo: true },
  // Pedagogy 6.2 gives level 9 `unknown: part` (14 = 10 + ?); the skill's rules cannot tag its
  // wrong cards (R4), so it asks for the whole until the owner decides (architecture 6, open questions).
  { id: 'teen-symbols', ...teen, look: 'symbols', eqform: ['standard', 'reversed'] },
  { id: 'bridge-move', ...bridge, demo: true },
  { id: 'bridge-frames', ...bridge },
  { id: 'bridge-symbols', ...bridge, look: 'symbols' },
];

/** What a level draws beyond its parameters, by level id: a five-frame, visible empty cells, counters that move. */
const VARIANT = { 'split-5': { cells: 5 }, 'ten-empty': { open: true }, 'bridge-move': { move: true } };

export const text = [];

// ---------- Rules (docs/depth/errors.md): one formula per id, read from the round ----------

/** @type {(r: Round) => Group[]} */
const groupsOf = (r) => (r.look === 'symbols' ? r.helpPicture : r.picture) ?? [];
/** @type {(r: Round, role: string, k?: number) => number | null} */
const count = (r, role, k = 0) => groupsOf(r).filter((g) => g.role === role)[k]?.count ?? null;
/** @type {(r: Round) => [number, number] | null} the addends of a + b = ? */
const addends = (r) => (r.unknown === 'result-right' && r.equation?.left[1] === '+' ? [Number(r.equation.left[0]), Number(r.equation.left[2])] : null);

/**
 * The number formulas for a missing part, on a reading { whole, part, answer }.
 * @type {Record<string, (x: { whole: number, part: number, answer: number }) => any>}
 */
const ON_PART = {
  'given.whole': ({ whole }) => whole,
  'given.part': ({ part }) => part,
  'op.other': ({ whole, part }) => whole + part,
  'zero.counted-as-one': ({ whole, part, answer }) => (answer === 0 ? 1 : part === 0 ? whole - 1 : null),
  'slip.near': ({ answer }) => ({ oneOf: [answer - 1, answer + 1] }),
};

/**
 * A number rule on a pair round (? + ? = whole, level 4; architecture 6, "Pair cards"): a pair
 * reads as a known number and a missing part, in either order. The rule's pair keeps one number
 * of the answer and puts the rule's value for the other in its place. Pairs that make the whole
 * are right, never a rule's value.
 * @param {Round} r
 * @param {string} id
 */
function onPair(r, id) {
  const [a, b] = r.answer;
  const whole = a + b;
  const out = [];
  for (const [known, first] of [[a, true], [b, false]]) {
    const v = ON_PART[id]({ whole, part: known, answer: whole - known });
    for (const x of v === null ? [] : v.oneOf ?? [v]) {
      if (Number.isInteger(x) && x >= 0 && known + x !== whole) out.push(first ? [known, x] : [x, known]);
    }
  }
  return out.length > 1 ? { oneOf: out } : out[0] ?? null;
}

/** @type {(r: Round) => boolean} */
const pair = (r) => Array.isArray(r.answer);
/** The missing part's reading of a part-unknown round. @param {Round} r */
const reading = (r) => ({ whole: count(r, 'whole'), part: count(r, 'part'), answer: r.answer });

export const rules = {
  'given.whole': (r) => (pair(r) ? onPair(r, 'given.whole') : r.unknown === 'part' ? count(r, 'whole') : null),
  // A pair round has no given part.
  'given.part': (r) => (!pair(r) && r.unknown === 'part' ? count(r, 'part') : null),
  'op.other': (r) => {
    if (pair(r)) return onPair(r, 'op.other');
    if (r.unknown === 'part') return ON_PART['op.other'](reading(r));
    const [a, b] = [count(r, 'part'), count(r, 'part', 1)];
    return a === null || b === null ? null : Math.abs(a - b);
  },
  'zero.counted-as-one': (r) => {
    if (pair(r)) return onPair(r, 'zero.counted-as-one');
    if (r.unknown === 'part') return ON_PART['zero.counted-as-one'](reading(r));
    return r.answer === 0 ? 1 : [count(r, 'part'), count(r, 'part', 1)].includes(0) ? r.answer + 1 : null;
  },
  'slip.near': (r) => (pair(r) ? onPair(r, 'slip.near') : { oneOf: [r.answer - 1, r.answer + 1] }),
  'pv.teen-reversed': (r) => {
    if (pair(r) || r.answer < 11 || r.answer > 19) return null;
    const v = Number(String(r.answer).split('').reverse().join(''));
    return v === r.answer ? null : v;
  },
  'pv.digits-added': (r) => (pair(r) || r.answer < 10 ? null : String(r.answer).split('').reduce((s, c) => s + Number(c), 0)),
  'pv.ones-only': (r) => (pair(r) || r.answer < 10 ? null : r.answer % 10),
  'bridge.whole-second': (r) => (addends(r) ? 10 + addends(r)[1] : null),
  'bridge.leftover-only': (r) => (addends(r) ? addends(r)[0] + addends(r)[1] - 10 : null),
  'bridge.stopped-at-ten': (r) => (addends(r) ? (Math.floor(addends(r)[0] / 10) + 1) * 10 : null),
  'count.start-included': (r) => (addends(r) ? r.answer - 1 : null),
};

// ---------- Rounds ----------

/** @type {(a: any, b: any) => boolean} */
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** @type {(v: any) => any[]} */
const options = (v) => (v === null || v === undefined ? [] : v.oneOf ?? [v]);

/**
 * The choices (R4): the answer, then one wrong value per rule in the skill's order (skills.md),
 * so a slip only comes when no known error is left; never a value an earlier rule predicts.
 * Numbers ascending, pairs by their first then second number (R4, R7: small to large, left to right).
 * @param {Round & { stage: Stage }} round
 * @param {Level} level
 * @param {Rng} rng
 * @returns {Choice[]}
 */
function choose(round, level, rng) {
  const order = SKILLS.find((s) => s.id === level.skill).rules.filter((id) => rules[id]);
  const taken = [round.answer];
  const wrong = [];
  const whole = pair(round) ? round.answer[0] + round.answer[1] : null;
  const ok = (v) => (Array.isArray(v) ? v.every((x) => Number.isInteger(x) && x >= 0) && v[0] + v[1] !== whole && String(v.join('')).length <= 4
    : Number.isInteger(v) && v >= 0 && String(v).length <= 4);
  for (const [i, id] of order.entries()) {
    if (wrong.length === level.options - 1) break;
    const earlier = order.slice(0, i).flatMap((q) => options(rules[q](round)));
    // Counting on from a bundle never counts down below it (the count-up display).
    const drawable = (v) => !(round.model === 'bundles' && id === 'slip.near' && v < 10);
    const fits = options(rules[id](round)).filter((v) => ok(v) && drawable(v) && !taken.some((t) => same(t, v)) && !earlier.some((e) => same(e, v)));
    if (!fits.length) continue;
    const value = fits.length > 1 ? rng.pick(fits) : fits[0];
    taken.push(value);
    wrong.push({ value, rule: id });
  }
  const key = (v) => (Array.isArray(v) ? v[0] * 100 + v[1] : v);
  return [{ value: round.answer, rule: null }, ...wrong].sort((x, y) => key(x.value) - key(y.value));
}

/**
 * @typedef {{ cells?: number, open?: boolean, move?: boolean }} Stage what the picture draws beyond the level's parameters
 */

/**
 * The fields every round copies (architecture 2.3), with the picture where the look puts it.
 * @param {Level} level
 * @param {Group[]} groups
 * @param {Equation} equation
 * @param {any} answer
 * @param {string} eqform
 * @returns {Round & { stage: Stage }}
 */
function roundOf(level, groups, equation, answer, eqform = 'standard') {
  const symbols = level.look === 'symbols';
  return {
    skill: level.skill, structure: /** @type {string} */ (level.structure), unknown: /** @type {string} */ (level.unknown),
    look: level.look, model: level.model, eqform, picture: symbols ? [] : groups, helpPicture: symbols ? groups : null,
    equation, text: '', terms: [], answer, choices: [], stage: { ...VARIANT[level.id] },
  };
}

/** @type {(level: Level, rng: Rng) => string} a mixed eqform: 'reversed' in a third of the rounds (R8: 25% at least) */
const eqformOf = (level, rng) => (Array.isArray(level.eqform) ? (rng.next() < 1 / 3 ? 'reversed' : 'standard') : 'standard');

/**
 * The parts of a number: part + ? = whole. In the ten-frame level about one round in ten covers
 * nothing (the answer is 0: the cover stands on an empty cell); a bond never does.
 * @param {Level} level
 * @param {Rng} rng
 */
function splitRound(level, rng) {
  let whole;
  let part;
  if (level.model === 'frame' && level.max === 10 && rng.next() < 0.1) {
    whole = rng.int(3, 9);
    part = whole;
  } else {
    do {
      whole = rng.int(3, level.max);
      part = rng.int(1, whole - 1);
    } while (part * 2 === whole);
  }
  const groups = [{ role: 'whole', count: whole, shown: 'tag' }, { role: 'part', count: part, shown: 'items' },
    { role: 'unknown', count: whole - part, shown: 'covered' }];
  return roundOf(level, /** @type {Group[]} */ (groups), { left: [part, '+', '?'], right: [whole] }, whole - part);
}

/** All the ways: ? + ? = whole, and the cards are pairs (7 | 0 and 0 | 7 too). @param {Level} level @param {Rng} rng */
function pairsRound(level, rng) {
  const whole = rng.int(3, level.max);
  const a = rng.int(0, whole);
  const groups = [{ role: 'whole', count: whole, shown: 'tag' }, { role: 'unknown', count: a, shown: 'covered' },
    { role: 'unknown', count: whole - a, shown: 'covered' }];
  return roundOf(level, /** @type {Group[]} */ (groups), { left: ['?', '+', '?'], right: [whole] }, [a, whole - a]);
}

/**
 * Making ten: k + ? = 10, or in symbols also 10 − k = ? and 10 = k + ?. The frame is the whole.
 * The level with visible empty cells sometimes shows a full frame (the answer is 0).
 * @param {Level} level
 * @param {Rng} rng
 */
function tenRound(level, rng) {
  const open = Boolean(VARIANT[level.id]?.open);
  const k = open && rng.next() < 0.1 ? 10 : rng.pick([1, 2, 3, 4, 6, 7, 8, 9]);
  const eqform = eqformOf(level, rng);
  const minus = eqform === 'standard' && level.look === 'symbols' && rng.next() < 0.5;
  const equation = eqform === 'reversed' ? { left: [10], right: [k, '+', '?'] }
    : minus ? { left: [10, '−', k], right: ['?'] } : { left: [k, '+', '?'], right: [10] };
  const groups = [{ role: 'whole', count: 10, shown: 'items' }, { role: 'part', count: k, shown: 'items' },
    { role: 'unknown', count: 10 - k, shown: open ? 'items' : 'covered' }];
  return roundOf(level, /** @type {Group[]} */ (groups), /** @type {Equation} */ (equation), 10 - k, eqform);
}

/** Ten and some more: 10 + k = ?, and in symbols also ? = 10 + k (k is 0 in about one round in ten). @param {Level} level @param {Rng} rng */
function teenRound(level, rng) {
  const k = rng.next() < 0.1 ? 0 : rng.int(1, 9);
  const eqform = eqformOf(level, rng);
  const sum = [10, '+', k];
  const groups = [{ role: 'part', count: 10, shown: 'items' }, { role: 'part', count: k, shown: 'items' },
    { role: 'unknown', count: 10 + k, shown: 'items' }];
  const equation = eqform === 'reversed' ? { left: ['?'], right: sum } : { left: sum, right: ['?'] };
  return roundOf(level, /** @type {Group[]} */ (groups), /** @type {Equation} */ (equation), 10 + k, eqform);
}

/** Bridging ten: a + b = ?, a from 6, the sum 11 to 18 (addsub-facts 4.7). @param {Level} level @param {Rng} rng */
function bridgeRound(level, rng) {
  const a = rng.int(6, 9);
  const b = rng.int(11 - a, 9);
  const groups = [{ role: 'part', count: a, shown: 'items' }, { role: 'part', count: b, shown: 'items' },
    { role: 'unknown', count: a + b, shown: 'items' }];
  return roundOf(level, /** @type {Group[]} */ (groups), { left: [a, '+', b], right: ['?'] }, a + b);
}

/**
 * @param {Level} level
 * @param {Rng} rng
 * @returns {Round}
 */
export function makeRound(level, rng) {
  const make = { 'num.parts.split': level.model === 'cards' ? pairsRound : splitRound, 'num.parts.make-ten': tenRound,
    'pv.teens.ten-and': teenRound, 'addsub.facts.bridge-add': bridgeRound }[level.skill];
  const round = make(level, rng);
  round.choices = choose(round, level, rng);
  return round;
}

// ---------- The picture ----------

/** @type {(n: number) => string} counters, in the singular for one */
const circles = (n) => (n === 1 ? 'עִגּוּל אֶחָד' : `${n} עִגּוּלִים`);
/** @type {(n: number) => string} empty cells, in the singular for one */
const empties = (n) => (n === 1 ? 'תָּא רֵיק אֶחָד' : `${n} תָּאִים רֵיקִים`);

/** Labels of the picture (locked templates, R1), for the panel's aria-label. */
const LABEL = {
  /** @type {(w: number, p: number) => string} */
  split: (w, p) => `מִסְגֶּרֶת: ${w} בְּסַךְ הַכֹּל, ${circles(p)} וּמִכְסֶה`,
  /** @type {(p: number, n: number) => string} */
  open: (p, n) => `מִסְגֶּרֶת עֶשֶׂר: ${circles(p)}, ${empties(n)}`,
  /** @type {(p: number) => string} */
  covered: (p) => `מִסְגֶּרֶת עֶשֶׂר: ${circles(p)} וּמִכְסֶה`,
  /** @type {(w: number, p: number) => string} */
  bond: (w, p) => `קֶשֶׁר מִסְפָּרִים: ${w}, ${p} וּמִכְסֶה`,
  /** @type {(w: number) => string} */
  pairs: (w) => `קֶשֶׁר מִסְפָּרִים: ${w} וּשְׁנֵי מִכְסִים`,
  /** @type {(k: number) => string} */
  bundle: (k) => (k === 0 ? 'צְרוֹר שֶׁל עֶשֶׂר' : k === 1 ? 'צְרוֹר שֶׁל עֶשֶׂר וְעוֹד קַשִּׁית אַחַת' : `צְרוֹר שֶׁל עֶשֶׂר וְעוֹד ${k} קַשִּׁיּוֹת`),
  /** @type {(a: number, b: number) => string} */
  frames: (a, b) => `שְׁתֵּי מִסְגָּרוֹת: ${circles(a)} וְ-${circles(b)}`,
};

/** @type {(p: { kind: string, data: any }) => string} the picture's label, from LABEL */
const labelOf = ({ kind, data: d }) => (kind === 'tree' ? LABEL.bond(d.whole, d.left.n) : kind === 'pairs' ? LABEL.pairs(d.whole)
  : kind === 'bundles' ? LABEL.bundle(d.ones) : kind === 'bridge' ? LABEL.frames(d.a, d.b)
  : !d.whole ? LABEL.split(d.tag, d.part) : d.covered ? LABEL.covered(d.part) : LABEL.open(d.part, d.unknown));

/**
 * Draws a round's picture into a stage: the base drawing, sized in units by the stage (game.css).
 * @param {HTMLElement} host
 * @param {Round} round
 * @param {boolean} solved a solved still (end screen): no covers, the unknown shown
 * @returns {import('./help.js').Pic}
 */
function drawRound(host, round, solved) {
  const stage = el('div', 'tf-stage');
  const draw = el('div', 'tf-draw');
  draw.dir = 'ltr';
  const base = el('div', 'tf-base');
  base.dir = 'ltr';
  base.dataset.math = '';
  draw.append(base);
  stage.append(draw);
  host.replaceChildren(stage);
  const { kind, data } = pictureOf(round);
  /** @type {any} */
  let pic;
  if (kind === 'tree' || kind === 'pairs') {
    const t = drawTree(base, { ...data, solved });
    pic = { t, d: { whole: data.whole, part: data.left.n, unknown: data.right.n }, covers: [...t.left.covers, ...t.right.covers] };
  } else if (kind === 'bundles') pic = { t: drawBundles(base, data), d: data, covers: [] };
  else if (kind === 'bridge') {
    const t = drawBridge(base, data);
    pic = { t, d: data, covers: [], top: t.top, bottom: t.bottom };
  } else {
    const t = drawFrame(base, { ...data, solved });
    pic = { t, d: data, covers: t.covers };
  }
  const L = pic.t.L;
  Object.assign(pic, { kind, draw, base, size: { dw: L.dw, dh: L.dh }, lidsUp: false, undo: [], toured: false });
  draw.style.setProperty('--dw', String(L.dw));
  draw.style.setProperty('--dh', String(L.dh));
  if (solved && kind === 'frame' && !data.unknown) KINDS.frame.solve(pic);
  return pic;
}

/** A touch mark (design 6.3): an ink dot on a counted thing, once; a second touch is logged as off-target. @param {HTMLElement} node */
function touch(node) {
  if (node.dataset.marked !== undefined) return;
  node.dataset.marked = '';
  delete node.dataset.target;
  node.append(el('span', 'tf-mark'));
}

/**
 * @param {HTMLElement} host
 * @param {Round} round
 * @param {RenderContext} ctx
 * @returns {RoundView}
 */
export function render(host, round, ctx) {
  const { signal, mode } = ctx;
  const still = mode === 'thumb';
  /** @type {any} */
  let pic = null;
  let misses = 0;
  let locked = false;
  /** @type {HTMLElement | null} */
  let shown = null;
  const kind = () => KINDS[pic.kind];

  const draw = () => {
    pic = drawRound(host, round, still && ctx.solved);
    if (still) return;
    // The first frame full: the exercise becomes 10 + the rest. Only level 10 moves counters
    // (pedagogy 6.2); fixed frames keep the child's exercise to the end.
    if (pic.kind === 'bridge' && pic.d.move) {
      let rewritten = false;
      pic.full = () => {
        if (rewritten) return;
        rewritten = true;
        ctx.setEquation({ left: [10, '+', pic.bottom.length], right: ['?'] });
      };
    }
    if (mode === 'demo') return;
    const movable = () => pic.kind === 'bridge' && pic.d.move && pic.top.length < 10;
    if (pic.kind === 'bridge' && pic.d.move) {
      for (const node of [pic.t.trays[1], ...pic.t.cells.slice(10)]) node.dataset.target = '';
    }
    pic.base.addEventListener('click', async (e) => {
      const hit = e.target instanceof Element ? e.target : null;
      if (!hit || locked) return;
      const counter = /** @type {HTMLElement | null} */ (hit.closest('[data-count]'));
      if (movable() && (pic.bottom.includes(counter) || hit === pic.t.trays[1] || pic.t.cells.indexOf(hit) >= 10)) {
        clear();   // a display drawn on the counters before they moved would no longer say the same
        const moving = move(pic, pic.bottom.includes(counter) ? counter : undefined);
        await Promise.all(moving.map((m) => settle(m, signal)));
        for (const m of moving) m.classList.remove('is-moving');
        return;
      }
      if (counter) touch(counter);
    }, { signal });
  };
  if (round.look !== 'symbols' || still) draw();

  /** Removes the display that is on, and undoes what it changed in the picture. */
  const clear = () => {
    shown?.remove();
    shown = null;
    for (const undo of pic.undo.splice(0)) undo();
  };
  // The hint (step 2): the cover lifts as its pulse runs, and neither is awaited: the cards lock
  // only while a display runs, under a second (design 7.1-7.2).
  const hint = async () => {
    if (pic.hint || signal.aborted) return;
    kind().prep(pic);
    pic.hint = layer(pic, 'hint');
    kind().hint(pic, pic.hint);
  };
  const tour = async () => {
    pic.toured = true;
    await kind().tour(pic, layer(pic, ''), signal);
  };

  return {
    label: labelOf(pictureOf(round)),
    picture() {
      if (!pic) draw();
    },
    async miss({ value, rule, display }, step) {
      if (!pic) draw();
      misses += 1;
      locked = true;
      clear();
      // The display of the rule chosen (step 1). From the second miss it runs and leaves, so the
      // picture is back at its start when the hint is drawn on it (design 7.2).
      const root = layer(pic, 'display', display);
      shown = root;
      if (misses > 1) root.classList.add('is-leaving');
      const targets = kind().display(pic, root, { value, rule, display });
      await Promise.all([settle(root, signal), ...targets.map((node) => settle(node, signal))]);
      if (signal.aborted) return;
      if (step >= 2 && pic.kind === 'frame' && pic.d.covered) pic.lidsUp = true;   // the hint lifts them for good
      if (misses > 1) clear();
      if (step >= 2) await hint();
      if (step === 3 && !signal.aborted) await tour();
      locked = false;
    },
    async solve() {
      locked = true;
      if (!pic) return;
      clear();
      const moved = kind().solve(pic);
      pic.draw.classList.add('is-solved');
      await Promise.all([settle(pic.draw, signal), ...moved.map((node) => settle(node, signal))]);
    },
    async demo(hand) {
      if (!pic) draw();
      locked = true;
      await kind().demo(pic, hand, { hint, tour, signal });
    },
  };
}

/**
 * A pair card (level 4): the two numbers with a bar between, read left to right (R7).
 * @param {HTMLElement} host
 * @param {any} value
 * @returns {boolean}
 */
export function face(host, value) {
  if (!Array.isArray(value)) return false;
  const row = el('span', 'tf-pair');
  row.dir = 'ltr';
  row.dataset.len = String(value.join('').length);
  row.append(el('span', '', String(value[0])), el('i'), el('span', '', String(value[1])));
  host.setAttribute('aria-label', `${value[0]} וְ-${value[1]}`);
  host.append(row);
  return true;
}
