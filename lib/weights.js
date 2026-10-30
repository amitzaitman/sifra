// A pick by weight, for a level's forms (architecture 2.2): the weights are data on the level, so
// the generic test checks each share against the level and not against the code.

/**
 * One of the items, by weight, from one draw of the rng. `at` is where the draw fell inside the
 * item's own share, from 0 to 1, for a game that splits an item further without a second draw.
 * @template {{ w: number }} T
 * @param {T[]} items
 * @param {Rng} rng
 * @returns {{ item: T, at: number }}
 */
export function pickWeighted(items, rng) {
  let x = rng.next() * items.reduce((n, f) => n + f.w, 0);
  for (const item of items) {
    if (x < item.w) return { item, at: x / item.w };
    x -= item.w;
  }
  return { item: items[items.length - 1], at: 1 };
}
