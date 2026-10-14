// Drawing the ten-frame pictures (decisions.md condition 6): each draw function takes (host, data)
// only and colours quantities through the role tokens in game.css. Boxes come from layout.js in
// units; CSS turns a unit into pixels from the stage's size, so one drawing fits a round, a thumb
// and a growing display alike.
import { cover } from '../../lib/cover.js';
import { around, boxPath, layoutBundles, layoutFrame, layoutTree, runPath } from './layout.js';

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
 * @param {import('./layout.js').Box} box
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
 * @param {import('./layout.js').Box} box
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

/** @type {(cell: import('./layout.js').Box) => import('./layout.js').Box} a disc: 76% of its cell */
export const disc = (c) => ({ x: c.x + c.w * 0.12, y: c.y + c.h * 0.12, w: c.w * 0.76, h: c.h * 0.76 });
/** @type {(b: import('./layout.js').Box, p: number) => import('./layout.js').Box} a box grown by p on every side */
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
 * A lid: the shared cover (lib/cover.js) in a positioned box, with its halo from game.css.
 * @param {Element} parent
 * @param {import('./layout.js').Box} box
 * @param {string} mark
 * @param {string} [cls]
 */
export function lid(parent, box, mark, cls = '') {
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
 * @param {import('./layout.js').Cell[]} cells
 */
export const segments = (cells) => [...new Set(cells.map((c) => `${c.frame}:${c.row}`))]
  .map((key) => around(cells.filter((c) => `${c.frame}:${c.row}` === key)));

/**
 * The bridge between two pieces of a cover, in the lower piece's own box (design 6.6): a 4px bar
 * (game.css) across the gap at the first piece's first cell, where both pieces have that column;
 * when they share none (the run wraps from the row's end to the next row's start), a bar along the
 * gap from the lower piece's last cell to the upper piece's first. Both ends meet a flat edge.
 * @param {import('./layout.js').Box} a the upper piece
 * @param {import('./layout.js').Box} b the lower piece
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
 * @param {import('./layout.js').Cell[]} cells
 */
function lids(parent, cells) {
  const pieces = segments(cells);
  return pieces.map((box, i) => {
    const node = lid(parent, box, i === 0 ? '?' : '');
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
 *   covered: boolean, solved: boolean }} d
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
  if (!d.solved && d.covered) covers = lids(host, run.length ? run : [/** @type {import('./layout.js').Cell} */ (empty)]);
  if (!d.solved && bracket) {
    if (run.length) {
      wrap = outline(host, L, [runPath(run, 0.12)], 'tf-line-unknown tf-bracket');
      const top = segments(run)[0];
      covers = [lid(host, { x: top.x + top.w / 2 - 0.37, y: top.y - 0.12 - 0.3, w: 0.74, h: 0.6 }, '?', 'is-small')];
    } else covers = [lid(host, { x: empty.x + 0.13, y: empty.y + 0.2, w: 0.74, h: 0.6 }, '?', 'is-small')];
  }
  const chip = d.tag === null ? null : at(host, 'tf-chip tf-tag', L.tag, String(d.tag));
  return { L, tray, cells, parts, unknowns, run, empty, covers, wrap, chip };
}

/**
 * The number bond (model tree): the whole's circle and its dots on top, two parts below. A part is
 * known (its circle shows the number) or unknown (under the cover, shown when solved).
 * @param {HTMLElement} host
 * @param {{ whole: number, left: { n: number, known: boolean }, right: { n: number, known: boolean },
 *   solved: boolean }} d
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
    const covers = part.known || d.solved ? [] : [lid(host, box, '?', 'is-round')];
    return { ...part, circle, dots, box, place, covers };
  };
  return { L, top, wholeDots, left: side(d.left, L.left, L.leftAt), right: side(d.right, L.right, L.rightAt) };
}

/**
 * A bundle of ten and loose sticks (place value: bundles only, place-value 4.5). Every stick and
 * the bundle carry a veil: the unknown whole, shown when solved.
 * @param {HTMLElement} host
 * @param {{ ones: number }} d
 */
export function drawBundles(host, d) {
  const L = layoutBundles(d);
  const veiled = (node, j, n) => {
    node.dataset.role = 'part';
    countable(node).append(unknown(el('span', 'tf-veil'), j, n));
    return node;
  };
  const bundle = veiled(at(host, 'tf-bundle', L.bundle), 0, d.ones + 1);
  bundle.append(el('span', 'tf-band'));
  const sticks = Array.from({ length: d.ones }, (_, i) => veiled(at(host, 'tf-stick', L.stick(i)), i + 1, d.ones + 1));
  return { L, bundle, sticks };
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

export { boxPath, runPath, around };
