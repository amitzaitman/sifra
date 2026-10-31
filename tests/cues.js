// The simple rules a child could find the answer by without the sum (R4; decisions.md 2026-10-31,
// "מקום התשובה" and "הטעות המקרית ליד התשובה"): the generic deal (games.test.js) and the games' own tests.
import { isDeepStrictEqual } from 'node:util';
import { rng as rngOf } from '../shell/rng.js';

/** A value on a card in this share of a level's rounds is a landmark the answer's place may be read from. */
const LANDMARK = 0.25;

/**
 * The simple rules that find the answer without the sum, each with how many of a level's rounds it
 * finds (R4; decisions.md 2026-10-31, "מקום התשובה" and "הטעות המקרית ליד התשובה"): a card by its
 * place; a card by its place among the others, once a value on a card in LANDMARK of the rounds or
 * more is set aside (the 10 of the bridge: "the second card that is not 10"); and the larger or the
 * smaller of the cards' one pair of neighbouring numbers, else a card by its place.
 * @param {{ values: any[], card: number }[]} dealt each round's card values and the answer's card
 * @returns {{ rule: string, found: number }[]}
 */
export function cues(dealt) {
  /** @type {{ rule: string, found: number }[]} */
  const out = [];
  const width = Math.max(0, ...dealt.map((d) => d.values.length));
  /** @type {(rule: string, finds: (d: { values: any[], card: number }) => boolean) => void} */
  const add = (rule, finds) => out.push({ rule, found: dealt.filter(finds).length });
  for (let k = 0; k < width; k++) add(`card ${k + 1}`, (d) => d.card === k);
  /** @type {Map<string, number>} */
  const shown = new Map();
  for (const d of dealt) {
    for (const v of d.values) shown.set(JSON.stringify(v), (shown.get(JSON.stringify(v)) ?? 0) + 1);
  }
  for (const [key, n] of shown) {
    if (n < LANDMARK * dealt.length) continue;
    // The value is set aside wherever it is on a card, also where it is the answer (the rule then misses).
    const others = (/** @type {{ values: any[], card: number }} */ d) => d.values.map((v) => JSON.stringify(v)).filter((v) => v !== key);
    const at = (/** @type {{ values: any[], card: number }} */ d) => others(d).indexOf(JSON.stringify(d.values[d.card]));
    for (let k = 0; k < width - 1; k++) add(`card ${k + 1} of those that are not ${key} (on a card in ${(100 * n / dealt.length).toFixed(0)}% of the rounds)`, (d) => at(d) === k);
  }
  /** @type {(values: any[]) => number[]} where each pair of neighbouring numbers ends */
  const pairs = (values) => values.flatMap((v, i) => (i > 0 && typeof v === 'number' && v - values[i - 1] === 1 ? [i] : []));
  for (const side of ['larger', 'smaller']) {
    for (let k = 0; k < width; k++) {
      add(`the ${side} of the one pair of neighbouring numbers, else card ${k + 1}`, (d) => {
        const ends = pairs(d.values);
        if (ends.length !== 1) return d.card === k;
        return d.card === (side === 'larger' ? ends[0] : ends[0] - 1);
      });
    }
  }
  return out;
}


/**
 * The cues of a level's rounds, seeds 1-n.
 * @param {Game} game
 * @param {Level} level
 * @param {number} n
 */
export function cuesOf(game, level, n) {
  /** @type {{ values: any[], card: number }[]} */
  const dealt = [];
  for (let seed = 1; seed <= n; seed++) {
    const round = game.makeRound(level, rngOf(seed));
    dealt.push({ values: round.choices.map((c) => c.value), card: round.choices.findIndex((c) => isDeepStrictEqual(c.value, round.answer)) });
  }
  return cues(dealt);
}
