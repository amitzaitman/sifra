// The balance (pedagogy 6.3, depth 4.9): "=" as "the same as"; each side of the exercise is a pan,
// left to right (R7). A level per row of the 6.3 table.
import { RULES } from '../../data/errors.js';
import { SKILLS } from '../../data/skills.js';
import { place } from '../../lib/place.js';
import { pickWeighted } from '../../lib/weights.js';
import { DISPLAYS, displayRows, drawable, drawFace, renderBalance } from './view.js';

export const meta = { id: 'balance', title: 'מֹאזְנַיִם', version: 6, css: new URL('game.css', import.meta.url).href };

// What levels share; each level is a complete object (architecture 2.2).
// No dots under the cards' numbers: the pans show each number in rows of five, and the dots would let
// a card be picked by its shape (owner decision 2026-10-19). Level 2, the first with numbers, keeps them.
const pans = {
  structure: 'equation', model: 'balance', look: /** @type {Level['look']} */ ('dots'), options: 4, demo: false, terms: false, cardDots: false,
};
// undrawn (architecture 2.2): count.start-included's jumps count on over the two numbers of the other
// pan, so only ? = a + b draws them; a missing part has none (architecture 6, "Open questions").
const missing = { ...pans, skill: 'eq.sign.missing', max: 10, undrawn: ['count.start-included'] };
// Every form met so far, c = a + ? in 40% of the rounds (R8) and each other form in 20%.
const symbols = {
  ...missing, unknown: ['right-part', 'left-part', 'result-left'], look: /** @type {Level['look']} */ ('symbols'),
  forms: [{ unknown: 'right-part', eqform: 'reversed', w: 2 }, { unknown: 'right-part', w: 1 }, { unknown: 'left-part', w: 1 }, { unknown: 'result-left', w: 1 }],
  exclude: [0],
};
// exclude: the numbers of a level's range that are never an answer, and why (architecture 4.2). A
// known number is 1 or more, so a missing part is under the whole, and 0 only under level 2's cover.
/** The level table of pedagogy 6.3; level n is levels[n - 1]. Ids are stable (architecture 2.2). @type {Level[]} */
export const levels = [
  // The pile on the right is 5 or more, two different parts on the left.
  { id: 'same', ...pans, skill: 'eq.sign.same-as', unknown: 'result-right', max: 10, look: 'objects', demo: true, exclude: [0, 1, 2, 3, 4] },
  { id: 'missing-right', ...missing, unknown: 'right-part', demo: true, cardDots: true, exclude: [10] },
  { id: 'missing-left', ...missing, unknown: 'left-part', exclude: [0, 10] },
  // c = a + ? and ? = a + b, half each.
  { id: 'missing-reversed', ...missing, unknown: ['right-part', 'result-left'], forms: [{ unknown: 'right-part', eqform: 'reversed', w: 1 }, { unknown: 'result-left', w: 1 }], exclude: [0] },
  { id: 'missing-symbols', ...symbols },
  { id: 'missing-symbols-20', ...symbols, max: 20 },
  { id: 'both-sides', ...pans, skill: 'eq.sign.both-sides', unknown: 'both-sides', max: 10, demo: true, exclude: [0, 10] },
  { id: 'both-sides-symbols', ...pans, skill: 'eq.sign.both-sides', unknown: 'both-sides', max: 20, look: 'symbols', exclude: [0, 20] },
  // a + b = b + ?: the answer is a, 1 to 5, a row of its own.
  { id: 'turn', ...pans, skill: 'eq.props.commutative', op: 'add', unknown: 'both-sides', max: 10, model: 'set', exclude: [0, 6, 7, 8, 9, 10] },
  // down: false on levels 10 and 11: the level below is another skill's, not a prerequisite (architecture 3.4).
  { id: 'true-false', ...pans, skill: 'eq.sign.true-false', model: 'cards', max: 10, demo: true, down: false },
  // a + b = c + ?: the answer is b, 3 to 9, one or two from it.
  { id: 'relational', ...pans, skill: 'eq.sign.relational', unknown: 'both-sides', max: 20, down: false, exclude: [0, 12, 13, 14, 15, 16, 17, 18, 19, 20] },
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
/** @type {(r: Round) => number[] | null} a judging round's exercise a + b, which its cards are made of (depth 4.9) */
const factOf = (r) => (r.model === 'cards' && Array.isArray(r.fact) ? r.fact : null);

/** The §4.2 formulas on this game's rounds (one per rule). @type {Record<string, (r: Round) => any>} */
export const rules = {
  'given.whole': (r) => whole(r),
  'given.part': (r) => part(r),
  'op.other': (r) => {
    // Judging: the exercise with the difference as its result, 5 + 2 = 3.
    const fact = factOf(r);
    if (fact) return { left: [fact[0], '+', fact[1]], right: [Math.abs(fact[0] - fact[1])] };
    const parts = partsOf(r);
    if (isPart(r)) return whole(r) + part(r);
    return isResult(r) && parts.length === 2 ? Math.abs(parts[0].count - parts[1].count) : null;
  },
  'equal.add-all': (r) => addAll(r),
  // Judging: the reversed card with the lone number copied from the other side, 5 = 5 + 2.
  'equal.copy': (r) => {
    const fact = factOf(r);
    return fact ? { left: [fact[0]], right: [fact[0], '+', fact[1]] } : copy(r);
  },
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
  // Judging rounds (depth 4.9): a true card with a lone number on the left (7 = 5 + 2, 7 = 7) is
  // turned down for the standard form, 5 + 2 = 8.
  'equal.reject-reversed': (r) => {
    const fact = factOf(r);
    return fact && r.answer.left.length === 1 ? { left: [fact[0], '+', fact[1]], right: [fact[0] + fact[1] + 1] } : null;
  },
  // Judging: "=" as "becomes", a card without an operation: the exercise's first number, then its result, 5 = 7.
  'equal.becomes': (r) => {
    const fact = factOf(r);
    return fact ? { left: [fact[0]], right: [fact[0] + fact[1]] } : null;
  },
};

/** The displays the balance draws (architecture 2.1; view.js): show() throws on any other. */
export const displays = DISPLAYS;

/**
 * Whether the round's picture can draw a wrong choice's display (architecture 2.1; drawable() in
 * view.js): the jumps count on over the two numbers of the other pan (? = a + b), so a missing part
 * has none. budget() says no where this does, and where the rows do not fit.
 * @param {Round} round
 * @param {Choice} choice
 * @returns {boolean}
 */
export function canShow(round, { rule }) {
  return drawable(round, RULES[rule]?.display ?? '');
}

/** @type {(side: 'left' | 'right', role: Group['role'], count: number) => Piece} */
const piece = (side, role, count) => ({ side, role, count, shown: role === 'unknown' ? 'covered' : 'items' });

/** The rows a display may take on the pans (design 6.8): with more, the cubes at 320px get too small to count. */
const MAX_ROWS = 8;

/**
 * Why a wrong choice's display does not fit the pans (architecture 4.2), null when it does: it has
 * no drawing on this round, or it needs more than MAX_ROWS rows.
 * @param {Round} round
 * @param {Choice} choice
 * @returns {string | null}
 */
export function budget(round, { value, rule }) {
  const { display } = RULES[rule];
  if (!canShow(round, { value, rule })) return `${display} has no drawing on this round`;
  const rows = displayRows(round, display, value);
  return rows > MAX_ROWS ? `${display} needs ${rows} rows on the pans, ${MAX_ROWS} at most` : null;
}

/**
 * One wrong choice per rule in the skill's order, each value once, slips only where no real error
 * gives the value; ascending. A value whose display does not fit (budget: no drawing on this round,
 * canShow, or more than MAX_ROWS rows) is left out, and the next rule takes its place, like the
 * ten-frame's canShow. The rng draws the answer's place (lib/place.js, R4): a value with no room on
 * its side of the answer gives way to the next rule too, and the slip goes to the side that has room,
 * either side, the rng's where both have (decisions.md 2026-10-31). null when there are not enough, or fewer than two real errors
 * where the skill lists two (R4). In a reversed form the equal.* rules come first (depth 4.9, eq.sign.missing; architecture 4.2).
 * @param {Round} round
 * @param {Level} level
 * @param {Rng} rng
 * @returns {Choice[] | null}
 */
function choose(round, level, rng) {
  const listed = SKILLS.find((s) => s.id === level.skill).rules.filter((id) => rules[id]);
  const order = reversedForm(round) ? [...listed.filter(isEqual), ...listed.filter((id) => !isEqual(id))] : listed;
  const isSlip = (id) => id.startsWith('slip.');
  const real = order.filter((id) => !isSlip(id)).map((id) => rules[id](round));
  /** @type {(v: number) => 'below' | 'above'} */
  const side = (v) => (v < round.answer ? 'below' : 'above');
  /** @type {(room: { below: number, above: number }, leave: (id: string, value: any) => boolean) => Choice[] | null} */
  const deal = (room, leave) => {
    const left = { ...room };
    const taken = [round.answer];
    /** @type {Choice[]} */
    const wrong = [];
    /** @type {any[]} the values of the rules before this one, dealt or not: a value two rules give is the first's (R4) */
    const earlier = [];
    for (const id of order) {
      if (wrong.length === level.options - 1) break;
      const value = rules[id](round);
      const candidates = value !== null && typeof value === 'object' ? value.oneOf : [value];
      const before = [...earlier];
      earlier.push(...candidates);
      const ok = (v) => !leave(id, v) && Number.isInteger(v) && v >= 0 && String(v).length <= 4 && !taken.includes(v) && !before.includes(v) && (!isSlip(id) || !real.includes(v))
        && left[side(v)] > 0 && budget(round, { value: v, rule: id }) === null;
      const fits = candidates.filter(ok);
      if (!fits.length) continue;
      const pick = fits.length > 1 ? rng.pick(fits) : fits[0];
      left[side(pick)] -= 1;
      taken.push(pick);
      wrong.push({ value: pick, rule: id });
    }
    if (wrong.length < level.options - 1) return null;
    if (real.length >= 2 && wrong.filter((c) => !isSlip(c.rule)).length < 2) return null;
    return wrong;
  };
  /** @type {any[]} what the skill's slips give on this round (lib/place.js) */
  const slips = order.filter(isSlip).flatMap((id) => { const v = rules[id](round); return v !== null && typeof v === 'object' ? v.oneOf : [v]; });
  const wrong = place(level.options, deal, (c) => side(c.value) === 'below', rng, (v) => slips.includes(v));
  return wrong && [{ value: round.answer, rule: null }, ...wrong].sort((a, b) => a.value - b.value);
}

/** @typedef {{ unknown: string, eqform: string }} Form */

/**
 * The round's unknown and form: by the level's weights when it lists forms (architecture 2.2), else
 * its one unknown, standard. Picked once per round, before any number, so a retry keeps the share.
 * @param {Level} level
 * @param {Rng} rng
 * @returns {Form}
 */
function formOf(level, rng) {
  if (!level.forms) return { unknown: /** @type {string} */ (level.unknown), eqform: 'standard' };
  const { item: form } = pickWeighted(level.forms, rng);
  return { unknown: form.unknown ?? /** @type {string} */ (level.unknown), eqform: form.eqform ?? 'standard' };
}

/** @typedef {{ groups: Piece[], equation: Equation | null, answer: number }} Drawn */

/**
 * One try at a round's numbers, picture and exercise in its form; null when they break the skill's rules.
 * @param {Level} level
 * @param {Form} form
 * @param {Rng} rng
 * @returns {Drawn | null}
 */
function draw(level, { unknown, eqform }, rng) {
  const max = level.max;
  const low = max > 10 ? 8 : 4;
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
    return { groups, equation: null, answer: c };
  }
  if (level.skill === 'eq.sign.missing') {
    if (unknown === 'result-left') {
      const sum = rng.int(max > 10 ? 8 : 5, max);
      const a = rng.int(2, sum - 2);
      const b = sum - a;
      if (a === b || b === 2 * a || a === 2 * b) return null;
      const groups = [piece('left', 'unknown', a + b), piece('right', 'part', a), piece('right', 'part', b)];
      return { groups, equation: { left: ['?'], right: [a, '+', b] }, answer: a + b };
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
      return { groups, equation: { left: ['?', '+', a], right: [c] }, answer: b };
    }
    if (eqform === 'reversed') {
      const groups = [piece('left', 'whole', c), piece('right', 'part', a), piece('right', 'unknown', b)];
      return { groups, equation: { left: [c], right: [a, '+', '?'] }, answer: b };
    }
    const groups = [piece('left', 'part', a), piece('left', 'unknown', b), piece('right', 'whole', c)];
    return { groups, equation: { left: [a, '+', '?'], right: [c] }, answer: b };
  }
  if (level.skill === 'eq.sign.both-sides') {
    // a + b = ? + c
    const sum = rng.int(max > 10 ? 8 : 4, max);
    const a = rng.int(1, sum - 1);
    const c = rng.int(1, sum - 1);
    if (c === a || c === sum - a) return null;
    const groups = [piece('left', 'part', a), piece('left', 'part', sum - a), piece('right', 'unknown', sum - c), piece('right', 'part', c)];
    return { groups, equation: { left: [a, '+', sum - a], right: ['?', '+', c] }, answer: sum - c };
  }
  if (level.skill === 'eq.props.commutative') {
    // a + b = b + ?: parts of at most five, one row each, so the turned row lies on the other.
    const a = rng.int(1, 5);
    const b = rng.int(1, 5);
    if (a === b) return null;
    const groups = [piece('left', 'part', a), piece('left', 'part', b), piece('right', 'part', b), piece('right', 'unknown', a)];
    return { groups, equation: { left: [a, '+', b], right: [b, '+', '?'] }, answer: a };
  }
  // eq.sign.relational: a + b = c + ?, c one or two from a: seeing beats computing.
  const a = rng.int(5, 12);
  const b = rng.int(3, 9);
  const d = rng.pick([-2, -1, 1, 2]);
  if (a + b > max || a + b < 11 || b - d < 1 || a + d === b) return null;
  const groups = [piece('left', 'part', a), piece('left', 'part', b), piece('right', 'part', a + d), piece('right', 'unknown', b - d)];
  return { groups, equation: { left: [a, '+', b], right: [a + d, '+', '?'] }, answer: b - d };
}

/**
 * The false cards beside each form of the true card (depth 4.9): real errors only (R4), so that every
 * round shows two standard cards, one reversed and one without an operation. Reversed: equal.copy is
 * a second reversed card, so it is not offered.
 */
const FALSE_CARDS = {
  standard: ['op.other', 'equal.copy', 'equal.becomes'],
  reversed: ['equal.reject-reversed', 'op.other', 'equal.becomes'],
  same: ['equal.reject-reversed', 'op.other', 'equal.copy'],
};

/**
 * A judging round (architecture 2.3): four cards of one exercise a + b = c, no equation row, an
 * empty balance. Every round shows the three forms of level 1, two standard cards (5 + 2 = 7),
 * one reversed (7 = 5 + 2) and one without an operation (7 = 7), and the true card is any of the
 * four alike, so a card's form tells nothing (owner decision 2026-10-14).
 * @param {Level} level
 * @param {Rng} rng
 * @returns {Round}
 */
function judge(level, rng) {
  let a;
  let b;
  do {
    const c = rng.int(5, level.max);
    a = rng.int(1, c - 1);
    b = c - a;
    // No equal parts, and neither twice the other: 5 + 2 = 3 then never reads as a part copied.
  } while (a === b || a === 2 * b || b === 2 * a);
  const c = a + b;
  const form = /** @type {keyof typeof FALSE_CARDS} */ (rng.pick(['standard', 'standard', 'reversed', 'same']));
  const answer = { standard: { left: [a, '+', b], right: [c] }, reversed: { left: [c], right: [a, '+', b] }, same: { left: [c], right: [c] } }[form];
  /** @type {Round} */
  const round = {
    skill: level.skill, structure: /** @type {string} */ (level.structure), look: level.look, model: level.model, eqform: 'standard',
    picture: [], helpPicture: null, equation: null, text: '', terms: [], answer, fact: [a, b], choices: [],
  };
  const wrong = FALSE_CARDS[form].map((rule) => ({ value: rules[rule](round), rule }));
  round.choices = rng.shuffle([{ value: answer, rule: null }, ...wrong]);
  return round;
}

/**
 * @param {Level} level
 * @param {Rng} rng
 * @returns {Round}
 */
export function makeRound(level, rng) {
  if (level.model === 'cards') return judge(level, rng);
  const form = formOf(level, rng);
  for (let n = 0; n < 1000; n++) {
    const made = draw(level, form, rng);
    if (!made) continue;
    const symbols = level.look === 'symbols';
    /** @type {Round} */
    const round = {
      skill: level.skill, structure: /** @type {string} */ (level.structure), unknown: form.unknown, look: level.look,
      model: level.model, eqform: form.eqform, picture: symbols ? [] : made.groups, helpPicture: symbols ? made.groups : null, equation: made.equation, text: '', terms: [],
      answer: made.answer, choices: [],
    };
    const choices = choose(round, level, rng);
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
