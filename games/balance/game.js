// The balance (pedagogy 6.3, depth 4.9): "=" as "the same as"; each side of the exercise is a pan,
// left to right (R7). A level per row of the 6.3 table.
import { SKILLS } from '../../data/skills.js';
import { drawFace, renderBalance } from './view.js';

export const meta = { id: 'balance', title: 'מֹאזְנַיִם', version: 1, css: new URL('game.css', import.meta.url).href };

// What levels share; each level is a complete object (architecture 2.2).
const pans = {
  structure: 'equation', model: 'balance', look: /** @type {Level['look']} */ ('dots'), options: 4, demo: false, terms: false,
};
const missing = { ...pans, skill: 'eq.sign.missing', max: 10 };
const symbols = {
  ...missing, unknown: ['right-part', 'left-part', 'result-left'], eqform: ['standard', 'reversed'],
  look: /** @type {Level['look']} */ ('symbols'),
};
/** The level table of pedagogy 6.3; level n is levels[n - 1]. Ids are stable (architecture 2.2). @type {Level[]} */
export const levels = [
  { id: 'same', ...pans, skill: 'eq.sign.same-as', unknown: 'result-right', max: 10, look: 'objects', options: 3, demo: true },
  { id: 'missing-right', ...missing, unknown: 'right-part', demo: true },
  { id: 'missing-left', ...missing, unknown: 'left-part' },
  { id: 'missing-reversed', ...missing, unknown: ['right-part', 'result-left'], eqform: ['reversed', 'standard'] },
  { id: 'missing-symbols', ...symbols },
  { id: 'missing-symbols-20', ...symbols, max: 20 },
  { id: 'both-sides', ...pans, skill: 'eq.sign.both-sides', unknown: 'both-sides', max: 10, demo: true },
  { id: 'both-sides-symbols', ...pans, skill: 'eq.sign.both-sides', unknown: 'both-sides', max: 20, look: 'symbols' },
  { id: 'turn', ...pans, skill: 'eq.props.commutative', op: 'add', unknown: 'both-sides', max: 10, model: 'set' },
  { id: 'true-false', ...pans, skill: 'eq.sign.true-false', model: 'cards', max: 10, demo: true },
  { id: 'relational', ...pans, skill: 'eq.sign.relational', unknown: 'both-sides', max: 20 },
];

export const text = [];

/** @typedef {Group & { side: 'left' | 'right' }} Piece a group and its side of the exercise (pan or row) */

/** @type {(r: Round) => Piece[]} */
const groupsOf = (r) => (r.look === 'symbols' ? r.helpPicture : r.picture) ?? [];
/** @type {(r: Round) => Piece | undefined} */
const unknownOf = (r) => groupsOf(r).find((g) => g.role === 'unknown');
/** @type {(r: Round) => Piece[]} */
const partsOf = (r) => groupsOf(r).filter((g) => g.role === 'part');
/** @type {(r: Round) => boolean} the unknown is the result (a sum) */
const isResult = (r) => r.unknown === 'result-right' || r.unknown === 'result-left';
/** @type {(r: Round) => boolean} the unknown is a part (a number of steps) */
const isPart = (r) => r.unknown === 'right-part' || r.unknown === 'left-part';
/** @type {(r: Round) => boolean} a reversed form: the lone number or the result stands left of "=" */
const reversedForm = (r) => r.eqform === 'reversed' || r.unknown === 'result-left';
/** @type {(id: string) => boolean} an equal.* rule (depth 4.9) */
const isEqual = (id) => id.startsWith('equal.');
/** @type {(r: Round, side: string) => Piece[]} */
const onSide = (r, side) => groupsOf(r).filter((g) => g.side === side);

/** @type {(r: Round) => number | null} the whole's number */
const whole = (r) => groupsOf(r).find((g) => g.role === 'whole')?.count ?? null;
/** @type {(r: Round) => number | null} the part next to the unknown, else the first */
const part = (r) => {
  const parts = partsOf(r);
  return (parts.find((g) => g.side === unknownOf(r)?.side) ?? parts[0])?.count ?? null;
};
/** @type {(r: Round) => number | null} every number of the exercise added */
const addAll = (r) => (unknownOf(r) ? groupsOf(r).filter((g) => g.role !== 'unknown').reduce((n, g) => n + g.count, 0) : null);
/** @type {(r: Round) => number | null} the other side's number at the unknown's place, else its last */
const copy = (r) => {
  const u = unknownOf(r);
  if (!u) return null;
  const other = onSide(r, u.side === 'left' ? 'right' : 'left');
  return (other[onSide(r, u.side).indexOf(u)] ?? other.at(-1))?.count ?? null;
};
/** @type {(f: (card: any) => Equation) => (r: Round) => Equation | null} a rule on a judging round's answer card */
const onCard = (f) => (r) => (Array.isArray(r.answer?.left) ? f(r.answer) : null);

/** The §4.2 formulas on this game's rounds (one per rule). @type {Record<string, (r: Round) => any>} */
export const rules = {
  'given.whole': (r) => whole(r),
  'given.part': (r) => part(r),
  'op.other': (r) => {
    const parts = partsOf(r);
    if (isPart(r)) return whole(r) + part(r);
    return isResult(r) && parts.length === 2 ? Math.abs(parts[0].count - parts[1].count) : null;
  },
  'equal.add-all': (r) => addAll(r),
  'equal.copy': (r) => copy(r),
  'equal.add-to-equal': (r) => {
    const u = unknownOf(r);
    return u?.side === 'right' ? onSide(r, 'left').reduce((n, g) => n + g.count, 0) : null;
  },
  'equal.compensate-wrong': (r) => {
    // a + b = c + ?: b plus c - a, instead of minus.
    const u = unknownOf(r);
    if (r.unknown !== 'both-sides' || !u) return null;
    const mine = onSide(r, u.side);
    const other = onSide(r, u.side === 'left' ? 'right' : 'left');
    const [k, j] = mine[0] === u ? [0, 1] : [1, 0];
    return other.length === 2 && mine.length === 2 ? other[k].count + (mine[j].count - other[j].count) : null;
  },
  'zero.counted-as-one': (r) => (r.answer === 0 ? 1 : null),
  // The landing (a result) one short; a number of steps (a part) one more.
  'count.start-included': (r) => (isResult(r) ? r.answer - 1 : isPart(r) ? r.answer + 1 : null),
  'slip.near': (r) => (typeof r.answer === 'number' ? { oneOf: [r.answer - 1, r.answer + 1] } : null),
  // Judging rounds: the answer card is c = a + b.
  'equal.reject-reversed': onCard((c) => ({ left: [...c.right], right: [c.left[0] + 1] })),
  'equal.accepts-chain': onCard((c) => ({ left: [...c.right], right: [c.left[0], '+', c.right[0]] })),
  'slip.card': onCard((c) => ({ left: [...c.left], right: [c.right[0], '+', c.right[2] + 1] })),
};

/** @type {(side: 'left' | 'right', role: Group['role'], count: number) => Piece} */
const piece = (side, role, count) => ({ side, role, count, shown: role === 'unknown' ? 'covered' : 'items' });

/**
 * One wrong choice per rule in the skill's order, each value once, slips only where no real error
 * gives the value; ascending. null when there are not enough. In a reversed form the equal.* rules
 * come first (depth 4.9, eq.sign.missing; architecture 4.2).
 * @param {Round} round
 * @param {Level} level
 * @returns {Choice[] | null}
 */
function choose(round, level) {
  const listed = SKILLS.find((s) => s.id === level.skill).rules.filter((id) => rules[id]);
  const order = reversedForm(round) ? [...listed.filter(isEqual), ...listed.filter((id) => !isEqual(id))] : listed;
  const real = order.filter((id) => !id.startsWith('slip.')).map((id) => rules[id](round));
  const taken = [round.answer];
  /** @type {Choice[]} */
  const wrong = [];
  for (const id of order) {
    if (wrong.length === level.options - 1) break;
    const value = rules[id](round);
    const candidates = value !== null && typeof value === 'object' ? value.oneOf : [value];
    const ok = (v) => Number.isInteger(v) && v >= 0 && String(v).length <= 4 && !taken.includes(v) && (!id.startsWith('slip.') || !real.includes(v));
    const pick = candidates.find(ok);
    if (pick === undefined) continue;
    taken.push(pick);
    wrong.push({ value: pick, rule: id });
  }
  if (wrong.length < level.options - 1) return null;
  return [{ value: round.answer, rule: null }, ...wrong].sort((a, b) => a.value - b.value);
}

/**
 * The unknown and the form, per seed when a level lists several: level 4 gives c = a + ? and
 * ? = a + b; the symbols levels every form met so far, 40% reversed (R8).
 * @param {Level} level
 * @param {Rng} rng
 * @returns {{ unknown: string, eqform: string }}
 */
function formOf(level, rng) {
  if (!Array.isArray(level.unknown)) return { unknown: /** @type {string} */ (level.unknown), eqform: 'standard' };
  if (level.look === 'symbols' && rng.next() < 0.4) return { unknown: 'right-part', eqform: 'reversed' };
  const unknown = rng.pick(level.unknown);
  return { unknown, eqform: level.look !== 'symbols' && unknown === 'right-part' ? 'reversed' : 'standard' };
}

/** @typedef {{ unknown: string, eqform: string, groups: Piece[], equation: Equation | null, answer: number }} Drawn */

/**
 * One try at a round's numbers, picture and exercise; null when they break the skill's rules.
 * @param {Level} level
 * @param {Rng} rng
 * @returns {Drawn | null}
 */
function draw(level, rng) {
  const max = level.max;
  const low = max > 10 ? 8 : 4;
  const { unknown, eqform } = formOf(level, rng);
  if (level.skill === 'eq.sign.same-as') {
    // Two parts on the left, the right pan empty: the child picks the pile that balances. Every
    // total alike; parts of 2 or more, but 6 is 1 + 5 or 5 + 1 (so given.part and op.other differ).
    const c = rng.int(5, max);
    /** @type {(a: number) => boolean} no equal parts, and neither part twice the other */
    const ok = (a) => a !== c - a && c - a !== 2 * a && a !== 2 * (c - a);
    /** @type {(lo: number) => number[]} the first parts from lo up, each part at least lo */
    const splits = (lo) => Array.from({ length: c - 2 * lo + 1 }, (_, i) => lo + i).filter(ok);
    const a = rng.pick(splits(2).length ? splits(2) : splits(1));
    const groups = [piece('left', 'part', a), piece('left', 'part', c - a), piece('right', 'unknown', c)];
    return { unknown, eqform, groups, equation: null, answer: c };
  }
  if (level.skill === 'eq.sign.missing') {
    if (unknown === 'result-left') {
      const sum = rng.int(max > 10 ? 8 : 5, max);
      const a = rng.int(2, sum - 2);
      const b = sum - a;
      if (a === b || b === 2 * a || a === 2 * b) return null;
      const groups = [piece('left', 'unknown', a + b), piece('right', 'part', a), piece('right', 'part', b)];
      return { unknown, eqform, groups, equation: { left: ['?'], right: [a, '+', b] }, answer: a + b };
    }
    // Sometimes nothing under the cover (5 + ? = 5), in the skill's first level.
    const zero = unknown === 'right-part' && eqform === 'standard' && level.look !== 'symbols' && rng.next() < 0.125;
    const c = zero ? rng.int(2, max) : rng.int(low, max);
    const a = zero ? c : rng.int(1, c - 1);
    const b = c - a;
    if (!zero && a === b) return null;
    if (unknown === 'left-part') {
      // ? + a = c: the known part is a, the answer b.
      const groups = [piece('left', 'unknown', b), piece('left', 'part', a), piece('right', 'whole', c)];
      return { unknown, eqform, groups, equation: { left: ['?', '+', a], right: [c] }, answer: b };
    }
    if (eqform === 'reversed') {
      const groups = [piece('left', 'whole', c), piece('right', 'part', a), piece('right', 'unknown', b)];
      return { unknown, eqform, groups, equation: { left: [c], right: [a, '+', '?'] }, answer: b };
    }
    const groups = [piece('left', 'part', a), piece('left', 'unknown', b), piece('right', 'whole', c)];
    return { unknown, eqform, groups, equation: { left: [a, '+', '?'], right: [c] }, answer: b };
  }
  if (level.skill === 'eq.sign.both-sides') {
    // a + b = ? + c
    const sum = rng.int(max > 10 ? 8 : 4, max);
    const a = rng.int(1, sum - 1);
    const c = rng.int(1, sum - 1);
    if (c === a || c === sum - a) return null;
    const groups = [piece('left', 'part', a), piece('left', 'part', sum - a), piece('right', 'unknown', sum - c), piece('right', 'part', c)];
    return { unknown, eqform, groups, equation: { left: [a, '+', sum - a], right: ['?', '+', c] }, answer: sum - c };
  }
  if (level.skill === 'eq.props.commutative') {
    // a + b = b + ?: parts of at most five, one row each, so the turned row lies on the other.
    const a = rng.int(1, 5);
    const b = rng.int(1, 5);
    if (a === b) return null;
    const groups = [piece('left', 'part', a), piece('left', 'part', b), piece('right', 'part', b), piece('right', 'unknown', a)];
    return { unknown, eqform, groups, equation: { left: [a, '+', b], right: [b, '+', '?'] }, answer: a };
  }
  // eq.sign.relational: a + b = c + ?, c one or two from a: seeing beats computing.
  const a = rng.int(5, 12);
  const b = rng.int(3, 9);
  const d = rng.pick([-2, -1, 1, 2]);
  if (a + b > max || a + b < 11 || b - d < 1 || a + d === b) return null;
  const groups = [piece('left', 'part', a), piece('left', 'part', b), piece('right', 'part', a + d), piece('right', 'unknown', b - d)];
  return { unknown, eqform, groups, equation: { left: [a, '+', b], right: [a + d, '+', '?'] }, answer: b - d };
}

/**
 * A judging round (architecture 2.3): four cards, the true one c = a + b (the form a child who
 * reads "=" as "write the answer" rejects); no equation row; an empty balance.
 * @param {Level} level
 * @param {Rng} rng
 * @returns {Round}
 */
function judge(level, rng) {
  let c;
  let a;
  do {
    c = rng.int(5, level.max);
    a = rng.int(1, c - 1);
  } while (a * 2 === c);
  /** @type {Round} */
  const round = {
    skill: level.skill, structure: /** @type {string} */ (level.structure), look: level.look, model: level.model, eqform: 'standard',
    picture: [], helpPicture: null, equation: null, text: '', terms: [], answer: { left: [c], right: [a, '+', c - a] }, choices: [],
  };
  const wrong = ['equal.reject-reversed', 'equal.accepts-chain', 'slip.card'].map((rule) => ({ value: rules[rule](round), rule }));
  round.choices = rng.shuffle([{ value: round.answer, rule: null }, ...wrong]);
  return round;
}

/**
 * @param {Level} level
 * @param {Rng} rng
 * @returns {Round}
 */
export function makeRound(level, rng) {
  if (level.model === 'cards') return judge(level, rng);
  for (let n = 0; n < 1000; n++) {
    const made = draw(level, rng);
    if (!made) continue;
    const symbols = level.look === 'symbols';
    /** @type {Round} */
    const round = {
      skill: level.skill, structure: /** @type {string} */ (level.structure), unknown: made.unknown, look: level.look,
      model: level.model, eqform: made.eqform, picture: symbols ? [] : made.groups, helpPicture: symbols ? made.groups : null, equation: made.equation, text: '', terms: [],
      answer: made.answer, choices: [],
    };
    const choices = choose(round, level);
    if (choices) return { ...round, choices };
  }
  throw new Error(`balance: no round for level ${level.id}`);
}

/**
 * The picture (view.js).
 * @param {HTMLElement} host
 * @param {Round} round
 * @param {RenderContext} ctx
 * @returns {RoundView}
 */
export function render(host, round, ctx) {
  return renderBalance(host, round, ctx);
}

/**
 * A card's face: a pile without a digit (same-as), an exercise on one line (judging), else false.
 * @param {HTMLElement} host
 * @param {any} value
 * @param {Round} round
 * @returns {boolean}
 */
export function face(host, value, round) {
  return drawFace(host, value, round);
}
