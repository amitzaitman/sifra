// What a ten-frame round draws (architecture 2.8): the kind of picture and the data its draw
// function takes, from the round's plain data, so R6 is tested in Node.

/**
 * What a round draws, read from its plain data (pure, so R6 is tested in Node): the kind of
 * picture and the data its draw function takes. The tray is the whole only in make-ten (R6).
 * @param {any} round
 * @returns {{ kind: 'frame' | 'tree' | 'pairs' | 'bundles' | 'bridge', data: any }}
 */
export function pictureOf(round) {
  const groups = (round.look === 'symbols' ? round.helpPicture : round.picture) ?? [];
  const of = (role, k = 0) => groups.filter((g) => g.role === role)[k];
  const count = (role, k = 0) => of(role, k)?.count;
  const stage = round.stage ?? {};
  if (round.model === 'tree') {
    return { kind: 'tree', data: { whole: count('whole'), left: { n: count('part'), known: true }, right: { n: count('unknown'), known: false } } };
  }
  if (round.model === 'cards') {
    return { kind: 'pairs', data: { whole: count('whole'), left: { n: count('unknown'), known: false }, right: { n: count('unknown', 1), known: false } } };
  }
  if (round.model === 'bundles') return { kind: 'bundles', data: { ones: count('part', 1) } };
  if (round.skill === 'addsub.facts.bridge-add') return { kind: 'bridge', data: { a: count('part'), b: count('part', 1), move: Boolean(stage.move) } };
  const whole = round.skill === 'num.parts.make-ten';
  return { kind: 'frame', data: { rows: stage.cells === 5 ? 1 : 2, whole, tag: whole ? null : count('whole'), part: count('part'),
    unknown: count('unknown'), covered: of('unknown')?.shown === 'covered' } };
}
