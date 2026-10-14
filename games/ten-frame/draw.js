// The ten-frame pictures (decisions.md condition 6): pure layouts in units (no DOM, so R6 is tested
// in Node), and draw functions that take (host, data) only and colour quantities through the role
// tokens in game.css. The module imports nothing, so it can move to lib/ unchanged: the cover maker
// comes in data (lib/cover.js). CSS turns a unit into pixels from the stage's size, so one drawing
// fits a round, a thumb and a growing display alike.

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

/** Room above the digits for the whole's tag on its bracket (14 = 10 + ?), clear of a grown last digit. */
const TAG_BAND = 1.2;
/**
 * The whole's tag over bundles: wider and taller than on a frame, because nine sticks make the
 * unit small (about 22px at 320px), and two digits at 14px still need room inside a ring.
 */
const BUNDLE_TAG = { w: 1.5, h: 0.85 };

/**
 * A bundle of ten and loose sticks, the ten left of the ones (R7, place value 4.5), with room
 * above for digits. row(t, o, y) lays out another row (t bundles and o sticks), for the build display.
 * With tag (14 = 10 + ?, the ones unknown): a band on top for the whole's tag, centred on a bracket
 * over the bundle and the ones, and the box of the ones' places, which the cover covers.
 * @param {{ ones: number, tag?: boolean }} data the loose sticks
 */
export function layoutBundles({ ones, tag = false }) {
  const top = (tag ? TAG_BAND : 0) + LIFT;
  /** @param {number} t bundles @param {number} o sticks @param {number} y top */
  const row = (t, o, y) => {
    const bundles = Array.from({ length: t }, (_, j) => ({ x: 0.3 + j * (BUNDLE + 0.3), y, w: BUNDLE, h: STICK.h }));
    const x0 = 0.3 + t * (BUNDLE + 0.3) + 0.4;
    const sticks = Array.from({ length: o }, (_, i) => ({ x: x0 + i * PITCH, y, w: STICK.w, h: STICK.h }));
    return { bundles, sticks, right: (sticks.at(-1) ?? bundles.at(-1)).x + (o ? STICK.w : BUNDLE) };
  };
  // As wide as the bundle, the sticks and room for one more, and never narrower than 7.5 units,
  // so a round with few sticks is not drawn huge.
  const base = row(1, ones + 1, top);
  const below = top + STICK.h + 0.7;
  /** @param {number} i */
  const stick = (i) => row(1, i + 1, top).sticks[i];
  // The ones' places: a pitch each, so the cover covers every stick and the gaps between (design 6.6).
  const first = stick(0).x - (PITCH - STICK.w) / 2;
  const places = { x: first, y: top, w: Math.max(1, ones) * PITCH, h: STICK.h };
  const l = base.bundles[0].x;
  const r = places.x + places.w;
  const chip = { x: (l + r) / 2 - BUNDLE_TAG.w / 2, y: 0.2, ...BUNDLE_TAG };
  return {
    dw: Math.max(7.5, base.right + 0.3), dh: top + STICK.h + 0.3, bundle: base.bundles[0], stick,
    /** @param {Box} b a digit's box above a stick or bundle, above the halo of an outline around them */
    above: (b) => ({ x: b.x + b.w / 2 - 0.5, y: b.y - 1.2, w: 1, h: 0.76 }),
    row, below, belowH: below + STICK.h + 0.3,
    places: tag ? places : null,
    tag: tag ? chip : null,
    /** The bracket over the whole: down at both ends, the tag on its middle. */
    bracket: tag ? { l, r, y: chip.y + chip.h / 2, end: chip.y + chip.h / 2 + 0.35 } : null,
  };
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


const SVG = 'http://www.w3.org/2000/svg';

/**
 * @param {string} tag
 * @param {string} [cls]
 * @param {string} [text]
 * @returns {HTMLElement}
 */
export function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** @param {number} v */
const unit = (v) => String(Math.round(v * 1000) / 1000);

/**
 * Puts an element on a box, in units (.tf-at reads --x, --y, --dx, --dy).
 * @template {Element} T
 * @param {T} node
 * @param {Box} box
 * @returns {T}
 */
export function put(node, { x, y, w, h }) {
  const style = /** @type {HTMLElement | SVGElement} */ (/** @type {unknown} */ (node)).style;
  style.setProperty('--x', unit(x));
  style.setProperty('--y', unit(y));
  style.setProperty('--dx', unit(w));
  style.setProperty('--dy', unit(h));
  return node;
}

/**
 * A positioned element, appended to parent. Text goes in reading order (R7: left to right,
 * then down), whatever order things appear in.
 * @param {Element} parent
 * @param {string} cls
 * @param {Box} box
 * @param {string} [text]
 * @returns {HTMLElement}
 */
export function at(parent, cls, box, text) {
  const node = put(el('div', `tf-at ${cls}`, text), box);
  if (text === undefined) parent.append(node);
  else {
    node.dataset.rx = unit(box.x + box.w / 2);
    node.dataset.ry = unit(box.y + box.h / 2);
    const after = [...parent.children].find((c) => c instanceof HTMLElement && c.dataset.ry !== undefined &&
      (Number(c.dataset.ry) > box.y + box.h / 2 + 0.3 ||
        (Math.abs(Number(c.dataset.ry) - (box.y + box.h / 2)) <= 0.3 && Number(c.dataset.rx) > box.x + box.w / 2)));
    parent.insertBefore(node, after ?? null);
  }
  return node;
}

/** @type {(cell: Box) => Box} a disc: 76% of its cell */
export const disc = (c) => ({ x: c.x + c.w * 0.12, y: c.y + c.h * 0.12, w: c.w * 0.76, h: c.h * 0.76 });
/** @type {(b: Box, p: number) => Box} a box grown by p on every side */
export const grow = (b, p) => ({ x: b.x - p, y: b.y - p, w: b.w + 2 * p, h: b.h + 2 * p });

/**
 * Outlines in an SVG over the drawing: each path gets a white halo under its line (design 6.6).
 * @param {Element} parent
 * @param {{ dw: number, dh: number }} size
 * @param {string[]} paths
 * @param {string} cls line class: tf-line-unknown, tf-line-whole, tf-line-added, tf-line-part, tf-line-frame
 * @param {boolean} [halo]
 * @returns {SVGSVGElement}
 */
export function outline(parent, { dw, dh }, paths, cls, halo = true) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', `tf-at tf-svg ${cls}`);
  svg.setAttribute('viewBox', `0 0 ${unit(dw)} ${unit(dh)}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  put(svg, { x: 0, y: 0, w: dw, h: dh });
  for (const d of paths.filter(Boolean)) {
    for (const part of halo ? ['tf-halo', 'tf-line'] : ['tf-line']) {
      const path = document.createElementNS(SVG, 'path');
      path.setAttribute('d', d);
      path.setAttribute('class', part);
      path.setAttribute('vector-effect', 'non-scaling-stroke');
      svg.append(path);
    }
  }
  parent.append(svg);
  return svg;
}

/**
 * A lid: the shared cover in a positioned box, with its halo from game.css.
 * @param {Element} parent
 * @param {Box} box
 * @param {(mark?: string) => HTMLElement} cover the cover maker (lib/cover.js), from the drawing's data
 * @param {string} mark
 * @param {string} [cls]
 */
export function lid(parent, box, cover, mark, cls = '') {
  const node = at(parent, `tf-lid ${cls}`, box);
  node.append(cover(mark));
  return node;
}

/** A countable thing: a tap leaves a mark (design 6.3), so it is a target. @param {HTMLElement} node */
const countable = (node) => {
  node.dataset.count = '';
  node.dataset.target = '';
  return node;
};

/**
 * Staggered entry (design 7.1): at most 40ms apart and 0.3s to the last one.
 * @param {number} j
 * @param {number} n
 * @param {number} [step]
 */
export const stagger = (j, n, step = 40) => `${Math.round(j * Math.min(step, 300 / Math.max(1, n - 1)))}ms`;

/**
 * An unknown quantity element: drawn from the start, shown when solved (app.css) or by the tour.
 * @param {HTMLElement} node
 * @param {number} j fill order
 * @param {number} n how many
 */
const unknown = (node, j, n) => {
  node.dataset.role = 'unknown';
  node.style.setProperty('--d', stagger(j, n));
  return node;
};

/**
 * Cells of a run in fill order, split by row: one box per row.
 * @param {Cell[]} cells
 */
export const segments = (cells) => [...new Set(cells.map((c) => `${c.frame}:${c.row}`))]
  .map((key) => around(cells.filter((c) => `${c.frame}:${c.row}` === key)));

/**
 * The bridge between two pieces of a cover, in the lower piece's own box (design 6.6): a 4px bar
 * (game.css) across the gap at the first piece's first cell, where both pieces have that column;
 * when they share none (the run wraps from the row's end to the next row's start), a bar along the
 * gap from the lower piece's last cell to the upper piece's first. Both ends meet a flat edge.
 * @param {Box} a the upper piece
 * @param {Box} b the lower piece
 * @returns {HTMLElement}
 */
function bridge(a, b) {
  const [x, last] = [a.x + 0.5, b.x + b.w - 0.5];
  const gap = { y: a.y + a.h - b.y, h: b.y - a.y - a.h };
  if (x <= last) return put(el('span', 'tf-span is-bar'), { x: x - b.x, ...gap, w: 0 });
  return put(el('span', 'tf-span'), { x: last - b.x, ...gap, w: x - last });
}

/**
 * The cover over a run of cells: a piece per row, joined by a bridge, '?' on the first only
 * (design 6.6).
 * @param {Element} parent
 * @param {Cell[]} cells
 * @param {(mark?: string) => HTMLElement} cover
 */
function lids(parent, cells, cover) {
  const pieces = segments(cells);
  return pieces.map((box, i) => {
    const node = lid(parent, box, cover, i === 0 ? '?' : '');
    if (i > 0) node.append(bridge(pieces[i - 1], box));
    return node;
  });
}

/**
 * A frame: the parts of a number (num.parts.split: a tag for the whole, a --frame tray) or the
 * whole ten (num.parts.make-ten: the tray is the whole). The unknown is under the cover, or its
 * empty cells are wrapped by the '?' bracket.
 * @param {HTMLElement} host
 * @param {{ rows: number, whole: boolean, tag: number | null, part: number, unknown: number,
 *   covered: boolean, solved: boolean, cover: (mark?: string) => HTMLElement }} d
 */
export function drawFrame(host, d) {
  const bracket = !d.covered;
  const end = d.whole && d.part + d.unknown === 10 && d.unknown === 0;
  const L = layoutFrame({ rows: d.rows, whole: d.whole, tag: d.tag !== null || bracket, end });
  const tray = at(host, d.whole ? 'tf-tray' : 'tf-tray is-frame', L.trays[0]);
  if (d.whole) tray.dataset.role = 'whole';
  const cells = L.cells.map((c) => at(host, 'tf-cell', c));
  const parts = L.cells.slice(0, d.part).map((c) => countable(at(host, 'tf-disc', disc(c))));
  for (const p of parts) p.dataset.role = 'part';
  const run = L.cells.slice(d.part, d.part + d.unknown);
  const unknowns = run.map((c, j) => unknown(at(host, 'tf-disc tf-unknown', disc(c)), j, run.length));
  if (bracket) for (const c of run) countable(cells[c.i]);
  // Nothing to find: the empty place is the next cell, or the end slot under a full frame.
  const empty = d.unknown ? null : L.cells[d.part] ?? L.end;
  /** @type {HTMLElement[]} */
  let covers = [];
  /** @type {SVGSVGElement | null} */
  let wrap = null;
  if (!d.solved && d.covered) covers = lids(host, run.length ? run : [/** @type {Cell} */ (empty)], d.cover);
  if (!d.solved && bracket) {
    if (run.length) {
      wrap = outline(host, L, [runPath(run, 0.12)], 'tf-line-unknown tf-bracket');
      const top = segments(run)[0];
      covers = [lid(host, { x: top.x + top.w / 2 - 0.37, y: top.y - 0.12 - 0.3, w: 0.74, h: 0.6 }, d.cover, '?', 'is-small')];
    } else covers = [lid(host, { x: empty.x + 0.13, y: empty.y + 0.2, w: 0.74, h: 0.6 }, d.cover, '?', 'is-small')];
  }
  const chip = d.tag === null ? null : at(host, 'tf-chip tf-tag', L.tag, String(d.tag));
  return { L, tray, cells, parts, unknowns, run, empty, covers, wrap, chip };
}

/**
 * The number bond (model tree): the whole's circle and its dots on top, two parts below. A part is
 * known (its circle shows the number) or unknown (under the cover, shown when solved).
 * @param {HTMLElement} host
 * @param {{ whole: number, left: { n: number, known: boolean }, right: { n: number, known: boolean },
 *   solved: boolean, cover: (mark?: string) => HTMLElement }} d
 */
export function drawTree(host, d) {
  const L = layoutTree({ whole: d.whole });
  const centre = (b) => [b.x + b.w / 2, b.y + b.h / 2];
  const [t, l, r] = [centre(L.top), centre(L.left), centre(L.right)];
  outline(host, L, [`M${t[0]} ${t[1]}L${l[0]} ${l[1]}M${t[0]} ${t[1]}L${r[0]} ${r[1]}`], 'tf-line-frame tf-stems', false);
  const top = at(host, 'tf-circle', L.top, String(d.whole));
  top.dataset.role = 'whole';
  const wholeDots = Array.from({ length: d.whole }, (_, i) => countable(at(host, 'tf-dot', L.wholeAt(i))));
  for (const dot of wholeDots) dot.dataset.role = 'whole';
  const side = (part, box, place) => {
    const circle = at(host, 'tf-circle', box, String(part.n));
    const dots = Array.from({ length: part.n }, (_, i) => at(host, 'tf-dot', place(i)));
    if (part.known) for (const node of [circle, ...dots.map(countable)]) node.dataset.role = 'part';
    else [circle, ...dots].forEach((node, j) => unknown(node, j, dots.length + 1));
    const covers = part.known || d.solved ? [] : [lid(host, box, d.cover, '?', 'is-round')];
    return { ...part, circle, dots, box, place, covers };
  };
  return { L, top, wholeDots, left: side(d.left, L.left, L.leftAt), right: side(d.right, L.right, L.rightAt) };
}

/**
 * A bundle of ten and loose sticks (place value: bundles only, place-value 4.5). Every stick and
 * the bundle carry a veil: the unknown whole, shown when solved. With a tag (14 = 10 + ?, the
 * ones unknown): the bundle is the known part, the ones are the unknown under the cover, and the
 * whole is a tag on a bracket over both (a white chip, the digit in --role-whole, as on a frame).
 * @param {HTMLElement} host
 * @param {{ ones: number, tag?: number | null, solved?: boolean, cover?: (mark?: string) => HTMLElement }} d
 */
export function drawBundles(host, d) {
  const tagged = d.tag !== undefined && d.tag !== null;
  const L = layoutBundles({ ones: d.ones, tag: tagged });
  if (tagged) {
    const { l, r, y, end } = L.bracket;
    outline(host, L, [`M${n(l)} ${n(end)}V${n(y)}H${n(r)}V${n(end)}`], 'tf-line-frame tf-bracket-whole', false);
    const chip = at(host, 'tf-chip tf-tag on-bracket', L.tag, String(d.tag));
    const bundle = countable(at(host, 'tf-bundle', L.bundle));
    bundle.dataset.role = 'part';
    bundle.append(el('span', 'tf-band'));
    const sticks = Array.from({ length: d.ones }, (_, i) => unknown(at(host, 'tf-stick', L.stick(i)), i, d.ones));
    const covers = d.solved ? [] : [lid(host, L.places, d.cover, '?', 'is-tall')];
    return { L, bundle, sticks, chip, covers };
  }
  const veiled = (node, j, n) => {
    node.dataset.role = 'part';
    countable(node).append(unknown(el('span', 'tf-veil'), j, n));
    return node;
  };
  const bundle = veiled(at(host, 'tf-bundle', L.bundle), 0, d.ones + 1);
  bundle.append(el('span', 'tf-band'));
  const sticks = Array.from({ length: d.ones }, (_, i) => veiled(at(host, 'tf-stick', L.stick(i)), i + 1, d.ones + 1));
  return { L, bundle, sticks, chip: null, covers: [] };
}

/**
 * Two frames for bridging ten (addsub.facts.bridge-add): the first addend in the first frame, the
 * second in the second; trays without a role (R6). Each counter carries a veil for the closing.
 * Room above the first frame holds its 10 label (L.tag), clear of the counters and of the hint.
 * @param {HTMLElement} host
 * @param {{ a: number, b: number }} d
 */
export function drawBridge(host, d) {
  const L = layoutFrame({ frames: 2, rows: 2, tag: true });
  const trays = L.trays.map((t) => at(host, 'tf-tray is-frame', t));
  const cells = L.cells.map((c) => at(host, 'tf-cell', c));
  const counter = (i, j) => {
    const node = countable(at(host, 'tf-disc', disc(L.cells[i])));
    node.dataset.role = 'part';
    node.append(unknown(el('span', 'tf-veil'), j, d.a + d.b));
    return node;
  };
  const top = Array.from({ length: d.a }, (_, i) => counter(i, i));
  const bottom = Array.from({ length: d.b }, (_, j) => counter(10 + j, d.a + j));
  return { L, trays, cells, top, bottom };
}
