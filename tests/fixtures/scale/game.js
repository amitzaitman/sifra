// Fixture game for the shell's tests (not in games/registry.js): equality on two pans, standing in
// for balance. Small, but it keeps the whole contract of docs/architecture.md section 2, including
// a judging level (2.3) whose answers are equation cards.
import { choose, count, render as draw } from '../kit.js';

export const meta = { id: 'scale', title: 'כַּפּוֹת', version: 1, css: new URL('game.css', import.meta.url).href };

const pans = { structure: 'equation', model: 'balance', look: 'dots', terms: false, max: 10, options: 4, demo: false };
/** @type {Level[]} */
export const levels = [
  { id: 'same', ...pans, skill: 'eq.sign.same-as', unknown: 'result-right', look: 'objects', demo: true, options: 3 },
  { id: 'right', ...pans, skill: 'eq.sign.missing', unknown: 'right-part', demo: true },
  { id: 'left', ...pans, skill: 'eq.sign.missing', unknown: 'left-part' },
  { id: 'either', ...pans, skill: 'eq.sign.missing', unknown: ['right-part', 'left-part'], look: 'symbols' },
  { id: 'judge', ...pans, skill: 'eq.sign.true-false', model: 'cards', demo: true },
];

export const text = [];

export const rules = {
  'given.whole': (r) => count(r, 'whole'),
  'given.part': (r) => count(r, 'part'),
  'op.other': (r) => (r.model === 'cards' ? null : r.unknown === 'result-right' ? Math.abs(r.equation.left[0] - r.equation.left[2]) : count(r, 'whole') + count(r, 'part')),
  'count.start-included': (r) => r.answer + 1,
  'slip.near': (r) => ({ oneOf: [r.answer - 1, r.answer + 1] }),
  // Judging rounds: the answer card is always c = a + b (reversed), so the plain form is a real
  // error; the balance varies the true card's form (depth 4.9), which the shell's tests do not need.
  'equal.reject-reversed': (r) => ({ left: [r.answer.right[0], '+', r.answer.right[2]], right: [r.answer.left[0] + 1] }),
  'equal.accepts-chain': (r) => ({ left: [r.answer.right[0], '+', r.answer.right[2]], right: [r.answer.left[0], '+', r.answer.right[2]] }),
  'slip.card': (r) => ({ left: [r.answer.left[0]], right: [r.answer.left[0] + 1] }),
};
const ORDER = {
  'eq.sign.same-as': ['given.part', 'op.other', 'slip.near'],
  'eq.sign.missing': ['given.whole', 'given.part', 'op.other', 'count.start-included'],
};

/**
 * @param {Level} level
 * @param {Rng} rng
 * @returns {Round}
 */
export function makeRound(level, rng) {
  if (level.skill === 'eq.sign.true-false') return judge(level, rng);
  const unknown = Array.isArray(level.unknown) ? rng.pick(level.unknown) : level.unknown;
  let a;
  let b;
  do {
    a = rng.int(1, level.max - 1);
    b = rng.int(1, level.max - a);
  } while (b === 2 * a || a === 2 * b || a === b);
  /** @type {Group[]} */
  let groups;
  /** @type {Equation} */
  let equation;
  if (unknown === 'result-right') {
    groups = [{ role: 'part', count: a, shown: 'items' }, { role: 'part', count: b, shown: 'items' }, { role: 'unknown', count: a + b, shown: 'covered' }];
    equation = { left: [a, '+', b], right: ['?'] };
  } else {
    // a + ? = c or ? + a = c, with c = a + b: the known part is a, the answer b.
    const sides = [{ role: 'part', count: a, shown: 'items' }, { role: 'unknown', count: b, shown: 'covered' }];
    groups = [...(unknown === 'right-part' ? sides : sides.reverse()), { role: 'whole', count: a + b, shown: 'items' }];
    equation = { left: unknown === 'right-part' ? [a, '+', '?'] : ['?', '+', a], right: [a + b] };
  }
  const symbols = level.look === 'symbols';
  /** @type {Round} */
  const round = {
    skill: level.skill, structure: level.structure, unknown, look: level.look, model: level.model, eqform: 'standard',
    picture: symbols ? [] : groups, helpPicture: symbols ? groups : null, equation, text: '', terms: [],
    answer: unknown === 'result-right' ? a + b : b, choices: [],
  };
  round.choices = choose(round, level.options, rules, ORDER[level.skill]);
  return round;
}

/**
 * A judging round: four cards, one true, no equation row and an empty stage. The answer's keys
 * are in another order than its card's on purpose: the shell must compare without key order.
 * @param {Level} level
 * @param {Rng} rng
 * @returns {Round}
 */
function judge(level, rng) {
  const a = rng.int(1, level.max - 2);
  const b = rng.int(1, level.max - 1 - a);
  const answer = { right: [a, '+', b], left: [a + b] };
  /** @type {Round} */
  const round = {
    skill: level.skill, structure: level.structure, look: level.look, model: level.model, eqform: 'standard',
    picture: [], helpPicture: null, equation: null, text: '', terms: [], answer, choices: [],
  };
  const wrong = ['equal.reject-reversed', 'equal.accepts-chain', 'slip.card'].map((rule) => ({ value: rules[rule](round), rule }));
  round.choices = rng.shuffle([{ value: { left: answer.left, right: answer.right }, rule: null }, ...wrong]);
  return round;
}

/**
 * A card's face: the exercise on one line. The shell's aria-label already reads its tokens.
 * @param {HTMLElement} host
 * @param {any} value
 * @returns {boolean} false for a number: the shell draws it
 */
export function face(host, value) {
  if (!Array.isArray(value?.left)) return false;
  const text = document.createElement('span');
  text.className = 'fx-card';
  text.textContent = [...value.left, '=', ...value.right].join('');
  host.append(text);
  return true;
}

/**
 * @param {HTMLElement} host
 * @param {Round} round
 * @param {RenderContext} ctx
 * @returns {RoundView}
 */
export function render(host, round, ctx) {
  return draw(host, round, ctx, meta.title);
}
