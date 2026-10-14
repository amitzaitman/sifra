// Seeded random numbers (architecture 3.8): mulberry32 over a uint32. makeRound uses only this.

/**
 * @param {number} seed a uint32
 * @returns {Rng}
 */
export function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  /** @type {(lo: number, hi: number) => number} both ends included */
  const int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
  return {
    next,
    int,
    pick: (list) => list[int(0, list.length - 1)],
    shuffle(list) {
      const out = [...list];
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(0, i);
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
}

/** @type {(r: Rng) => number} a uint32 drawn from a generator, for seeds derived from a seed */
export const seedFrom = (r) => Math.floor(r.next() * 4294967296) >>> 0;

/** @type {(seed: number) => number} the first demo seed for a round seed */
export const demoSeed = (seed) => (seed ^ 0x9e3779b9) >>> 0;
