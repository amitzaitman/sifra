// Pure layouts of the ten-frame pictures (architecture 2.8): boxes in units, no DOM, so R6 is
// tested in Node. Frames are in cells, the number bond in dot pitches, bundles in their own unit.

/** Gap and padding between cells, in cells (design 6.7: clamp(6px, 2vw, 10px) on 46-58px cells). */
export const GAP = 0.14;
/** Room around a drawing for rings and halos. */
const MARGIN = 0.22;
/** Space between two frames, and before the end slot. */
const BETWEEN = 0.3;
const TAG = { w: 1.1, h: 0.66 };
/** The tag sits on the tray's top edge, above the cells (design 6.7). */
const TAG_SINK = 0.08;

/**
 * @typedef {{ x: number, y: number, w: number, h: number }} Box
 * @typedef {Box & { i: number, frame: number, row: number, col: number }} Cell
 */

/**
 * One or two frames, filled left to right, top row first (R6). Cells are numbered across the
 * frames in fill order; place(i) goes on past the last frame into hypothetical frames below it.
 * @param {{ frames?: number, rows?: number, whole?: boolean, tag?: boolean, end?: boolean }} data
 *   whole: the tray is the whole (num.parts.make-ten only); tag: room for the whole's chip on the
 *   top edge; end: an end slot under the frame (a full frame with nothing to find)
 */
export function layoutFrame({ frames = 1, rows = 2, whole = false, tag = false, end = false }) {
  const trayW = 5 + 6 * GAP;
  const trayH = rows + (rows + 1) * GAP;
  const per = rows * 5;
  const x0 = MARGIN;
  const y0 = MARGIN + (tag ? TAG.h - TAG_SINK : 0);
  /** @param {number} f */
  const trayAt = (f) => ({ x: x0, y: y0 + f * (trayH + BETWEEN), w: trayW, h: trayH, frame: f, role: whole ? 'whole' : null });
  /** @type {(i: number) => Cell} */
  const place = (i) => {
    const [frame, k] = [Math.floor(i / per), i % per];
    const [row, col] = [Math.floor(k / 5), k % 5];
    const tray = trayAt(frame);
    return { i, frame, row, col, x: tray.x + GAP + col * (1 + GAP), y: tray.y + GAP + row * (1 + GAP), w: 1, h: 1 };
  };
  const trays = Array.from({ length: frames }, (_, f) => trayAt(f));
  const cells = Array.from({ length: frames * per }, (_, i) => place(i));
  const last = trays[frames - 1];
  const endBox = end ? { x: place(4).x, y: last.y + last.h + BETWEEN, w: 1, h: 1 } : null;
  const dh = (endBox ? endBox.y + endBox.h : last.y + last.h) + MARGIN;
  return {
    dw: trayW + 2 * MARGIN, dh, trays, cells, per, place, trayAt, end: endBox,
    tag: tag ? { x: x0 + trayW / 2 - TAG.w / 2, y: y0 - TAG.h + TAG_SINK, ...TAG } : null,
    /** @param {number} n places 0..n-1 shown: the height that holds them (hypothetical frames grow it) */
    height: (n) => Math.max(dh, trayAt(Math.floor((Math.max(1, n) - 1) / per)).y + trayH + MARGIN),
  };
}

const DOT = 0.95;
const R = 1.35;
/**
 * The dot pitch of the bond: wide enough that two two-digit count-up digits side by side
 * ("10", "11" on pair cards) do not touch at 320px (design 4).
 */
const DOT_PITCH = 1.3;

/**
 * Rows of five dots from a top-left corner, one dot pitch apart.
 * @param {number} x
 * @param {number} y
 * @returns {(i: number) => Box}
 */
const grid = (x, y) => (i) => ({ x: x + (i % 5) * DOT_PITCH, y: y + Math.floor(i / 5) * DOT_PITCH, w: DOT, h: DOT });
/** The width of a row of five dots. */
const ROW = 4 * DOT_PITCH + DOT;

/**
 * The number bond (model tree, Singapore 1A): the whole's circle on top with its dots beside it,
 * two part circles below with their dots under them. Circles are boxes; lines join their centres.
 * @param {{ whole: number }} data the whole's count (its dots: one row up to 5, else two)
 */
export function layoutTree({ whole }) {
  const top = { x: 7.2 - R, y: 0.3, w: 2 * R, h: 2 * R };
  const rows = whole > 5 ? 2 : 1;
  const wholeAt = grid(top.x + 2 * R + 0.35, top.y + R - ((rows - 1) * DOT_PITCH + DOT) / 2);
  const left = { x: 3.6 - R, y: 4.55, w: 2 * R, h: 2 * R };
  const right = { x: 10.8 - R, y: 4.55, w: 2 * R, h: 2 * R };
  const under = (c) => grid(c.x + R - ROW / 2, c.y + 2 * R + 0.35);
  /** @param {number} n dots in rows of five under a part circle: the bottom of the drawing below them */
  const below = (n) => left.y + 2 * R + 0.35 + (Math.ceil(Math.max(1, n) / 5) - 1) * DOT_PITCH + DOT + 0.3;
  const dh = below(6);
  return {
    dw: top.x + 2 * R + 0.35 + ROW + 0.3, dh, top, left, right, wholeAt, leftAt: under(left), rightAt: under(right),
    /** @param {number} n dots under a part circle: the height that holds them */
    height: (n) => Math.max(dh, below(n)),
  };
}

const STICK = { w: 0.4, h: 3.4 };
const BUNDLE = 1.7;
/**
 * Loose sticks one pitch apart: two-digit digits above them (count-up, the tour) stay apart at
 * their 14px minimum on a 320px screen (design 4, 7.2).
 */
const PITCH = 1.1;
/** Room above the sticks for a row of digits clear of the group's outline and its halo. */
const LIFT = 1.4;

/**
 * A bundle of ten and loose sticks, the ten left of the ones (R7, place value 4.5), with room
 * above for digits. row(t, o, y) lays out another row (t bundles and o sticks), for the build display.
 * @param {{ ones: number }} data the loose sticks
 */
export function layoutBundles({ ones }) {
  /** @param {number} t bundles @param {number} o sticks @param {number} y top */
  const row = (t, o, y) => {
    const bundles = Array.from({ length: t }, (_, j) => ({ x: 0.3 + j * (BUNDLE + 0.3), y, w: BUNDLE, h: STICK.h }));
    const x0 = 0.3 + t * (BUNDLE + 0.3) + 0.4;
    const sticks = Array.from({ length: o }, (_, i) => ({ x: x0 + i * PITCH, y, w: STICK.w, h: STICK.h }));
    return { bundles, sticks, right: (sticks.at(-1) ?? bundles.at(-1)).x + (o ? STICK.w : BUNDLE) };
  };
  // As wide as the bundle, the sticks and room for one more, and never narrower than 7.5 units,
  // so a round with few sticks is not drawn huge.
  const base = row(1, ones + 1, LIFT);
  const below = LIFT + STICK.h + 0.7;
  return {
    dw: Math.max(7.5, base.right + 0.3), dh: LIFT + STICK.h + 0.3, bundle: base.bundles[0], stick: (i) => row(1, i + 1, LIFT).sticks[i],
    /** @param {Box} b a digit's box above a stick or bundle, above the halo of an outline around them */
    above: (b) => ({ x: b.x + b.w / 2 - 0.5, y: b.y - 1.2, w: 1, h: 0.76 }),
    row, below, belowH: below + STICK.h + 0.3,
  };
}

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

/**
 * An SVG path around a run of cells of one frame in fill order (at most two rows), padded: one
 * rectangle, a stepped outline when the rows overlap, or two rectangles. With join, rows that
 * do not overlap are still one outline: the two boxes and a line along the gap between the rows,
 * from the lower row's end to the upper row's start (one group, one label).
 * @param {Cell[]} cells
 * @param {number} pad
 * @param {boolean} [join]
 * @returns {string}
 */
export function runPath(cells, pad, join = false) {
  if (!cells.length) return '';
  const rows = [...new Set(cells.map((c) => c.row))];
  const span = (row) => {
    const own = cells.filter((c) => c.row === row);
    return { l: Math.min(...own.map((c) => c.x)) - pad, r: Math.max(...own.map((c) => c.x + c.w)) + pad,
      t: own[0].y - pad, b: own[0].y + own[0].h + pad };
  };
  const rect = (s) => `M${n(s.l)} ${n(s.t)}H${n(s.r)}V${n(s.b)}H${n(s.l)}Z`;
  if (rows.length === 1) return rect(span(rows[0]));
  const [a, b] = [span(rows[0]), span(rows[1])];
  const cols = (row) => cells.filter((c) => c.row === row).map((c) => c.col);
  if (!join && Math.max(...cols(rows[1])) < Math.min(...cols(rows[0]))) return rect(a) + rect(b);
  const mid = (a.b - pad + b.t + pad) / 2;
  return `M${n(a.l)} ${n(a.t)}H${n(a.r)}V${n(mid)}H${n(b.r)}V${n(b.b)}H${n(b.l)}V${n(mid)}H${n(a.l)}Z`;
}

/**
 * A rounded rectangle path around a box, padded.
 * @param {Box} box
 * @param {number} pad
 * @param {number} [radius]
 */
export function boxPath({ x, y, w, h }, pad, radius = 0.3) {
  const [l, t, r, b] = [x - pad, y - pad, x + w + pad, y + h + pad];
  const k = Math.min(radius, (r - l) / 2, (b - t) / 2);
  return `M${n(l + k)} ${n(t)}H${n(r - k)}Q${n(r)} ${n(t)} ${n(r)} ${n(t + k)}V${n(b - k)}Q${n(r)} ${n(b)} ${n(r - k)} ${n(b)}` +
    `H${n(l + k)}Q${n(l)} ${n(b)} ${n(l)} ${n(b - k)}V${n(t + k)}Q${n(l)} ${n(t)} ${n(l + k)} ${n(t)}Z`;
}

/**
 * The smallest box around boxes.
 * @param {Box[]} boxes
 * @returns {Box}
 */
export function around(boxes) {
  const [l, t] = [Math.min(...boxes.map((b) => b.x)), Math.min(...boxes.map((b) => b.y))];
  return { x: l, y: t, w: Math.max(...boxes.map((b) => b.x + b.w)) - l, h: Math.max(...boxes.map((b) => b.y + b.h)) - t };
}

/** @param {number} v */
const n = (v) => String(Math.round(v * 1000) / 1000);
