// סִפּוּרִים: wordless story problems (pedagogy 6.4, design 6.10, depth 4.6): balloons arrive, fly
// away or pop, and a basket holds two parts, told by motion, role colours and the one '?'. The module
// contract is docs/architecture.md section 2; the geometry is scene.js.
import { RULES } from '../../data/errors.js';
import { SKILLS } from '../../data/skills.js';
import { pickWeighted } from '../../lib/weights.js';
import { lidAt, planScene, rowsFor } from './scene.js';
import { DISPLAYS, renderScene } from './view.js';

export const meta = { id: 'stories', title: 'סִפּוּרִים', version: 2, css: new URL('game.css', import.meta.url).href };

/** A third of the rounds reversed (R8): the last level of each one-structure skill. @type {LevelForm[]} */
const third = [{ eqform: 'reversed', w: 1 }, { eqform: 'standard', w: 2 }];
/** What every level shares; each level is a complete object (architecture 2.2). */
const scene = { model: 'scene', terms: false, options: 4, demo: false };
const add = { ...scene, skill: 'addsub.meaning.change-add', structure: 'change-add' };
const take = { ...scene, skill: 'addsub.meaning.change-take', structure: 'change-take' };
const basket = { ...scene, skill: 'addsub.meaning.part-whole', structure: 'part-whole', unknown: 'whole' };

// exclude: the numbers of a level's range that are never an answer, and why (architecture 4.2). No 0:
// these skills list no zero.* rule, so every number is 1 or more. On the levels to 10 the largest
// number is 6-10 (the result, the start of take, the whole), so a result or a whole is 6 or more; a
// change is under the whole (level 3), and what stays under the start (take).
// No dots under the cards' numbers from each skill's second level (cardDots, the balance's rule of
// 2026-10-19): the picture shows every number in rows of five.
// down: false on the first level of each skill: the level before it in the list is another skill's,
// not one it needs, so the ladder stays there rather than step down to it (architecture 3.4).
// undrawn: op.other is 0 where the two numbers are equal (2 + 2, 3 + 3), and a 0 has nothing to draw
// (canShow); the next rule takes its place. The basket has no equal parts, and no level 1 + 1 (poolOf),
// so 2 is never the answer of levels 1 and 6.
/** The level table of pedagogy 6.4; level n is levels[n - 1]. Ids are stable (architecture 2.2). @type {Level[]} */
export const levels = [
  { id: 'add-5', ...add, unknown: 'result', max: 5, look: 'objects', options: 3, demo: true, down: false, exclude: [0, 1, 2], undrawn: ['op.other'] },
  { id: 'add-10', ...add, unknown: 'result', max: 10, look: 'dots', cardDots: false, exclude: [0, 1, 2, 3, 4, 5], undrawn: ['op.other'] },
  { id: 'add-change', ...add, unknown: 'change', max: 10, look: 'dots', demo: true, cardDots: false, forms: third, exclude: [0, 10] },
  { id: 'take-5', ...take, unknown: 'result', max: 5, look: 'objects', options: 3, demo: true, down: false, exclude: [0, 5] },
  { id: 'take-10', ...take, unknown: 'result', max: 10, look: 'dots', cardDots: false, forms: third, exclude: [0, 10] },
  { id: 'whole-5', ...basket, max: 5, look: 'objects', options: 3, demo: true, down: false, exclude: [0, 1, 2] },
  { id: 'whole-10', ...basket, max: 10, look: 'dots', cardDots: false, forms: third, exclude: [0, 1, 2, 3, 4, 5] },
  // Levels 2 and 5 together, visible, in dots from the start: the planner picks the story (R3, R11).
  { id: 'mixed-10', ...scene, skill: 'addsub.meaning.mixed', structure: ['change-add', 'change-take'], unknown: 'result', max: 10, look: 'dots', cardDots: false, exclude: [0], undrawn: ['op.other'] },
];

/**
 * What a level draws beyond its parameters, by level id (design 6.10): objects that turn into dots as
 * the round opens; on the mixed level the wrap comes with the hint, so the picture at rest does not
 * outline what to count (decisions.md 2026-10-31).
 */
const VARIANT = { 'add-10': { morph: true }, 'take-10': { morph: true }, 'whole-10': { morph: true }, 'mixed-10': { wrap: 'hint' } };

export const text = [];

/** The displays the scene draws (architecture 2.1): view.js's table, which throws on any other. */
export const displays = DISPLAYS;

// ---------- Rules (docs/depth/errors.md): one formula per id, from round.story ----------

/** @typedef {{ s: number, k: number, r: number, verb: string }} Story s the start (a: the first part), k the change (b), r the result (the whole) */
/** @typedef {Round & { story: Story, stage: { morph?: boolean, wrap?: string, cols?: number } }} StoryRound */

/** @type {(r: Round) => string} add (result), change (add, the change unknown), take (result), basket (the whole unknown) */
const kindOf = (r) => (r.structure === 'part-whole' ? 'basket' : r.structure === 'change-take' ? 'take' : r.unknown === 'change' ? 'change' : 'add');
/** @type {(r: Round) => Story} */
const storyOf = (r) => /** @type {StoryRound} */ (r).story;

/**
 * The §4.2 formulas on a story. given.part is the given part, the one beside the unknown, else the
 * first in the exercise (the balance's part()); in take the start is the whole, so the given part is
 * the change (depth 4.2, decisions.md 2026-10-30). op.swapped-subtraction has no formula: it is for
 * the start unknown only, which v1 does not deal.
 * @type {Record<string, (r: Round) => any>}
 */
export const rules = {
  'op.other': (r) => {
    const { s, k, r: w } = storyOf(r);
    return { change: s + w, take: s + k }[kindOf(r)] ?? Math.abs(s - k);
  },
  'given.whole': (r) => ({ change: storyOf(r).r, take: storyOf(r).s }[kindOf(r)] ?? null),
  'given.part': (r) => (kindOf(r) === 'take' ? storyOf(r).k : storyOf(r).s),
  // Counting the start's own last object: one short for a result, one more for a change; back to the first outline in take.
  'count.start-included': (r) => ({ add: storyOf(r).r - 1, change: storyOf(r).k + 1, take: storyOf(r).r + 1 }[kindOf(r)] ?? null),
  'slip.near': (r) => ({ oneOf: [r.answer - 1, r.answer + 1] }),
};

/**
 * Whether the picture can draw a choice's display (architecture 2.1): every display fills, counts or
 * flashes places, so a 0 has nothing to draw (op.other when the two numbers are equal; a slip under
 * an answer of 1). These skills list no zero.* rule: no card is 0.
 * @param {Round} round
 * @param {Choice} choice
 * @returns {boolean}
 */
export function canShow(round, { value }) {
  return Number.isInteger(value) && value >= 1;
}

/** The rows a display may take (design 6.10): the story's two, and two more. */
const MAX_ROWS = 4;

/**
 * Why a wrong choice's display does not fit the scene (architecture 4.2), null when it does: it
 * needs more than MAX_ROWS rows (rowsFor in scene.js). From the round alone, never a viewport.
 * @param {Round} round
 * @param {Choice} choice
 * @returns {string | null}
 */
export function budget(round, { value, rule }) {
  const display = RULES[rule]?.display;
  const rows = rowsFor(round, display, value);
  return rows > MAX_ROWS ? `${display} needs ${rows} rows, ${MAX_ROWS} at most` : null;
}

/**
 * One wrong choice per rule in the skill's order, each value once; a value the picture cannot draw
 * (canShow: a 0) or the budget refuses is left out and the next rule takes its place; a slip only
 * where no real error gives the value, the answer − 1 first (R4). Ascending. Every pair of every pool deals a full set (tests/stories.test.js),
 * so nothing is drawn again and the shares cannot drift. choose stays here: a shared one would change
 * the other games' rounds.
 * @param {Round} round
 * @param {Level} level
 * @returns {Choice[]}
 */
function choose(round, level) {
  const listed = SKILLS.find((s) => s.id === level.skill).rules.filter((id) => rules[id]);
  const isSlip = (/** @type {string} */ id) => id.startsWith('slip.');
  const real = listed.filter((id) => !isSlip(id)).map((id) => rules[id](round));
  const taken = [round.answer];
  /** @type {Choice[]} */
  const wrong = [];
  for (const id of listed) {
    if (wrong.length === level.options - 1) break;
    const value = rules[id](round);
    const candidates = value !== null && typeof value === 'object' ? value.oneOf : [value];
    const pick = candidates.find((v) => Number.isInteger(v) && canShow(round, { value: v, rule: id }) && !taken.includes(v) && (!isSlip(id) || !real.includes(v)) && budget(round, { value: v, rule: id }) === null);
    if (pick === undefined) continue;
    taken.push(pick);
    wrong.push({ value: pick, rule: id });
  }
  if (wrong.length < level.options - 1) throw new Error(`stories: ${level.id} has no ${level.options} cards for ${JSON.stringify(storyOf(round))}`);
  return [{ value: round.answer, rule: null }, ...wrong].sort((a, b) => a.value - b.value);
}

/**
 * The columns a round's pictures use, five at most (design 6.10): its places at rest and solved and in
 * every card's display. scene.js shifts a round of fewer to the middle of the drawing, the same in
 * every state; the basket's rim is five columns wide, a frame, so its balls fill from its left.
 * @param {Round} round
 * @returns {number}
 */
function colsOf(round) {
  if (round.structure === 'part-whole') return 5;
  const states = ['rest', 'solved', ...round.choices.filter((c) => c.rule).map(({ value, rule }) => ({ display: RULES[rule].display, rule, value }))];
  return Math.min(5, Math.max(...states.map((st) => planScene(round, st).last + 1)));
}

/**
 * Every story of a level, in one order (the generator picks one; nothing is drawn again):
 * add and the basket by the result's band, take by the start's, from 2 to 5 or from 6 to max
 * (the largest number of a level to 10 is 6-10, a generator rule, not min). No zero. The basket has
 * no second part twice the first (1 + 2: op.other and given.part give one number), and no two equal
 * parts (3 + 3: op.other is 0, a card with nothing to draw, and given.part is the one real error
 * left). No 1 + 1 (given.part and count.start-included both give 1, op.other 0). Level 3 has no
 * story whose fixed dome would need a row under the whole's rows (9 + ? = 10).
 * @param {Level} level
 * @returns {Story[]}
 */
export function poolOf(level) {
  const [lo, hi] = level.max > 5 ? [6, level.max] : [2, level.max];
  /** @type {Story[]} */
  const out = [];
  for (let top = lo; top <= hi; top++) {
    for (let x = 1; x < top; x++) {
      if (level.structure === 'change-take') out.push({ s: top, k: x, r: top - x, verb: '' });
      else if (level.structure === 'part-whole' ? top - x !== 2 * x && top !== 2 * x : level.unknown === 'change' ? lidAt(x) < 5 * Math.ceil(top / 5) : top > 2) out.push({ s: x, k: top - x, r: top, verb: '' });
    }
  }
  return out;
}

/**
 * A round: the form first, once (lib/weights.js), then a story of the level's pool, then the verb
 * of take (flown or popped, depth 4.6: the verbs alternate). The rules read round.story.
 * @param {Level} level
 * @param {Rng} rng
 * @returns {Round}
 */
export function makeRound(level, rng) {
  const eqform = level.forms ? pickWeighted(level.forms, rng).item.eqform ?? 'standard' : 'standard';
  const structure = /** @type {string} */ (level.structure);
  const unknown = /** @type {string} */ (level.unknown);
  const { s, k, r } = rng.pick(poolOf(level));
  const verb = structure === 'change-take' ? rng.pick(['fly', 'pop']) : structure === 'change-add' ? 'arrive' : 'none';
  const op = structure === 'change-take' ? '−' : '+';
  /** @type {(a: any[], b: any[]) => Equation} */
  const row = (a, b) => (eqform === 'reversed' ? { left: b, right: a } : { left: a, right: b });
  const change = unknown === 'change';
  /** @type {Group[]} */
  const picture = change
    ? [{ role: 'part', count: s, shown: 'items' }, { role: 'whole', count: r, shown: 'tag' }, { role: 'unknown', count: k, shown: 'covered' }]
    : [{ role: 'part', count: s, shown: 'items' }, { role: structure === 'change-take' ? 'removed' : structure === 'change-add' ? 'added' : 'part', count: k, shown: 'items' },
      { role: 'unknown', count: r, shown: 'items' }];
  /** @type {StoryRound} */
  const round = {
    skill: level.skill, structure, unknown, look: level.look, model: level.model, eqform, text: '', terms: [], helpPicture: null,
    story: { s, k, r, verb }, stage: { ...VARIANT[level.id] }, picture,
    equation: change ? row([s, op, '?'], [r]) : row([s, op, k], ['?']),
    answer: change ? k : r, choices: [],
  };
  /** @type {StoryRound} */
  const dealt = { ...round, choices: choose(round, level) };
  /** @type {StoryRound} */
  const out = { ...dealt, stage: { ...dealt.stage, cols: colsOf(dealt) } };
  return out;
}

/** @type {(n: number, one: string, many: string) => string} a verb or adjective by its number (pedagogy 6.4) */
const by = (n, one, many) => (n === 1 ? one : many);

/**
 * The picture's aria-label (design 6.3): locked templates of pedagogy 6.4, singular where a number is
 * 1. Drafts for the owner's nikud review.
 * @param {Round} round
 * @returns {string}
 */
export function labelOf(round) {
  const { s, k, r, verb } = storyOf(round);
  const were = by(s, 'הָיָה', 'הָיוּ');
  switch (kindOf(round)) {
    case 'add': return `${were} ${s}, ${by(k, 'וּבָא', 'וּבָאוּ')} עוֹד ${k}`;
    case 'change': return `${were} ${s}, בָּאוּ עוֹד, וְעַכְשָׁיו יֵשׁ ${r}`;
    case 'take': return `${were} ${s}, וְ-${k} ${verb === 'fly' ? by(k, 'עָף', 'עָפוּ') : by(k, 'הִתְפּוֹצֵץ', 'הִתְפּוֹצְצוּ')}`;
    default: return `בַּסַּל ${s} ${by(s, 'צָהֹב', 'צְהֻבִּים')} וְ-${k} ${by(k, 'בָּהִיר', 'בְּהִירִים')}`;
  }
}

/**
 * The picture (view.js): the event, the displays, the hint, the tour, the closing and the demo;
 * the label from its locked template.
 * @param {HTMLElement} host
 * @param {Round} round
 * @param {RenderContext} ctx
 * @returns {RoundView}
 */
export function render(host, round, ctx) {
  return { ...renderScene(host, round, ctx), label: labelOf(round) };
}
