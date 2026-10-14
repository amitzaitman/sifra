// Fixture game for the shell's tests (not in games/registry.js): the parts of a number, standing
// in for ten-frame. Small, but it keeps the whole contract of docs/architecture.md section 2.
import { choose, count, render as draw } from '../kit.js';

export const meta = { id: 'parts', title: 'חֲלָקִים', grades: [1], version: 1, css: new URL('game.css', import.meta.url).href };

const split = { skill: 'num.parts.split', structure: 'part-whole', unknown: 'part', model: 'frame', look: 'dots', terms: false };
/** @type {Level[]} */
export const levels = [
  { id: 'split-5', ...split, demo: true, max: 5, options: 3 },
  { id: 'split-10', ...split, demo: false, max: 10, options: 4 },
  { id: 'split-sym', ...split, demo: false, max: 10, options: 4, look: 'symbols', eqform: ['standard', 'reversed'] },
  { id: 'ten', ...split, skill: 'num.parts.make-ten', demo: true, max: 10, options: 3 },
];

export const text = [];

export const rules = {
  'given.whole': (r) => count(r, 'whole'),
  'given.part': (r) => count(r, 'part'),
  'op.other': (r) => count(r, 'whole') + count(r, 'part'),
  'zero.counted-as-one': (r) => (r.answer === 0 ? 1 : null),
  'slip.near': (r) => ({ oneOf: [r.answer - 1, r.answer + 1] }),
};
const ORDER = ['given.whole', 'given.part', 'op.other', 'zero.counted-as-one', 'slip.near'];

/**
 * @param {Level} level
 * @param {Rng} rng
 * @returns {Round}
 */
export function makeRound(level, rng) {
  const ten = level.skill === 'num.parts.make-ten';
  let whole;
  let part;
  do {
    whole = ten ? 10 : rng.int(3, level.max);
    part = rng.int(1, whole - 1);
  } while (part * 2 === whole);
  const answer = whole - part;
  const eqform = Array.isArray(level.eqform) ? (rng.next() < 0.4 ? 'reversed' : 'standard') : level.eqform ?? 'standard';
  /** @type {Group[]} */
  const groups = [{ role: 'whole', count: whole, shown: 'tag' }, { role: 'part', count: part, shown: 'items' }, { role: 'unknown', count: answer, shown: 'covered' }];
  const sum = [part, '+', '?'];
  const symbols = level.look === 'symbols';
  /** @type {Round} */
  const round = {
    skill: level.skill, structure: level.structure, unknown: level.unknown, look: level.look, model: level.model, eqform,
    picture: symbols ? [] : groups, helpPicture: symbols ? groups : null, text: '', terms: [], answer, choices: [],
    equation: eqform === 'reversed' ? { left: [whole], right: sum } : { left: sum, right: [whole] },
  };
  round.choices = choose(round, level.options, rules, ORDER);
  return round;
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
