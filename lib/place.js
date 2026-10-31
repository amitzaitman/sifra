// The answer's place among the cards (R4; decisions.md 2026-10-31, "מקום התשובה"): the cards go small
// to large, so the skill's rules alone would leave the answer on one card in every round of some levels.

/**
 * The wrong choices of a round, with the answer's place drawn by the rng. The free deal takes the
 * skill's rules in their order (a slip only where no real error is left). Beside it, the answer may
 * move one place up: the last real error over it gives way to the next rule's value under it (a real
 * error, else a slip); or one place down: the last real error under it gives way to a slip over it,
 * the free deal's other real errors staying (a later real error over it would trade one real error
 * for another, and on a level whose answer leans to one end that only leans it further). The free
 * deal's own slip may cross the answer either way. A set counts when it is full (n - 1 cards) and
 * keeps as many real errors (not slip.*) as R4 asks: two, or all of the free deal's when it has
 * fewer. The rng draws one of the places these sets take, each alike; with no full set, the free
 * deal as it is (the game decides).
 * @template {{ rule: string }} C
 * @param {number} n the cards, the answer's among them
 * @param {(room: { below: number, above: number }, leave: (rule: string) => boolean) => C[] | null} deal
 *   the rules in the skill's order but those leave() names, with at most room.below cards under the
 *   answer and room.above over it (a value with no room on its side gives way to the next rule); null
 *   when the game has no set
 * @param {(choice: C) => boolean} below whether a wrong choice is under the answer (a card left of it)
 * @param {Rng} rng
 * @returns {C[] | null} null when the free deal is null
 */
export function place(n, deal, below, rng) {
  /** @type {(rule: string) => boolean} */
  const slip = (rule) => rule.startsWith('slip.');
  const free = deal({ below: n, above: n }, () => false);
  if (!free) return null;
  const real = free.filter((c) => !slip(c.rule));
  const need = Math.min(2, real.length);
  /** @type {(set: C[]) => number} the answer's place: the cards left of it */
  const at = (set) => set.filter(below).length;
  const p = at(free);
  const kept = new Set(real.map((c) => c.rule));
  const under = real.filter(below);
  const slipped = free.find((c) => slip(c.rule));
  const sets = [free];
  if (p + 1 < n) sets.push(deal({ below: p + 1, above: n - 2 - p }, () => false));
  if (p > 0 && (slipped ? below(slipped) : under.length)) {
    const out = slipped ? null : under[under.length - 1].rule;
    sets.push(deal({ below: p - 1, above: n - p }, (rule) => rule === out || (!slip(rule) && !kept.has(rule))));
  }
  /** @type {Map<number, C[]>} the first set of each place, the free deal's first */
  const byPlace = new Map();
  for (const set of sets) {
    if (set && set.length === n - 1 && set.filter((c) => !slip(c.rule)).length >= need && !byPlace.has(at(set))) byPlace.set(at(set), set);
  }
  const places = [...byPlace.keys()];
  return places.length ? /** @type {C[]} */ (byPlace.get(places[rng.int(0, places.length - 1)])) : free;
}
