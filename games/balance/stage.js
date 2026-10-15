// The balance and the turned rows (design 6.8, R6): pure layouts, and drawings that take (host,
// data) and colour through role tokens only. The module imports nothing, so it can move to lib/
// unchanged: the cover maker comes in data (lib/cover.js). Places: --c --r --w --h (or --x --y in cells).

/**
 * A group on a pan or in a row, in the exercise's order.
 * @typedef {object} PanGroup
 * @property {string} role
 * @property {number} count
 * @property {boolean} [cover] under the ? cover
 * @property {boolean} [second] the second of two known parts: the part's light shade (design 3)
 */
/** @typedef {{ group: number, role: string, second: boolean, slot: number, col: number, row: number }} CubeSpot a cube's place */
/** @typedef {{ start: number, length: number }} Run consecutive places */
/** @typedef {{ group: number, places: number[], runs: Run[] }} Span a group's places, and the same as runs */
/** @typedef {{ cubes: CubeSpot[], spans: Span[], slots: number }} PanLayout slots: the places taken */
/** @typedef {{ col: number, row: number, w: number, h: number }} Box */
/** @typedef {{ from: number, to: number, row: number, across: boolean }} Bridge columns from-to, under row */
/**
 * A row of groups in cells: each dot, each group's first column, and the row's length.
 * @typedef {{ dots: { group: number, role: string, second: boolean, x: number, y: number }[], blocks: { group: number, x: number, count: number }[],
 *   length: number }} LineLayout
 */
/** @typedef {{ el: HTMLElement, stack: HTMLElement, layout: PanLayout, cubes: HTMLElement[], lids: HTMLElement[] }} PanView */
/** @typedef {{ layout: LineLayout, dots: HTMLElement[] }} LineView */

/** @type {(slot: number) => { col: number, row: number }} rows of five, left to right, the bottom row first */
export const at = (slot) => ({ col: slot % 5, row: Math.floor(slot / 5) });

/** @type {(slots: number[]) => Run[]} places (ascending) as runs of consecutive places */
export const runsOf = (slots) => slots.reduce((out, slot) => {
  const last = out.at(-1);
  if (last && last.start + last.length === slot) last.length += 1;
  else out.push({ start: slot, length: 1 });
  return out;
}, /** @type {Run[]} */ ([]));

/**
 * A pan's places: rows of five from the bottom, each group following on from the one before it.
 * The colour, not a new row, keeps two known numbers apart, so the rows of five compare across
 * the pans (design 6.8). A covered group takes one place at least (a cover over nothing stands on
 * an empty place, design 6.6).
 * @param {PanGroup[]} groups
 * @returns {PanLayout}
 */
export function layoutPan(groups) {
  /** @type {PanLayout} */
  const out = { cubes: [], spans: [], slots: 0 };
  groups.forEach((g, group) => {
    const run = { start: out.slots, length: g.cover ? Math.max(1, g.count) : g.count };
    out.slots += run.length;
    const places = Array.from({ length: run.length }, (_, k) => run.start + k);
    for (const slot of places.slice(0, g.count)) out.cubes.push({ group, role: g.role, second: Boolean(g.second), slot, ...at(slot) });
    out.spans.push({ group, places, runs: [run] });
  });
  return out;
}

/**
 * Colours a quantity by its role (R6), and a second known part in the part's light shade.
 * @param {HTMLElement} node
 * @param {{ role: string, second?: boolean }} spot
 * @returns {HTMLElement}
 */
export function paint(node, spot) {
  node.dataset.role = spot.role;
  node.toggleAttribute('data-second', Boolean(spot.second));
  return node;
}

/**
 * A run of places as one box per row (the stretched cover, design 6.6).
 * @param {number} start
 * @param {number} length
 * @returns {Box[]}
 */
export function rowPieces(start, length) {
  /** @type {Box[]} */
  const out = [];
  for (let s = start; s < start + length; s += out.at(-1).w) out.push({ ...at(s), w: Math.min(5 - (s % 5), start + length - s), h: 1 });
  return out;
}

/** @type {(start: number, length: number) => Box[]} ring boxes: row pieces, rows of one width merged */
export const ringPieces = (start, length) => rowPieces(start, length).reduce((out, p) => {
  const last = out.at(-1);
  if (last && last.col === p.col && last.w === p.w && last.row + last.h === p.row) last.h += 1;
  else out.push(p);
  return out;
}, /** @type {Box[]} */ ([]));

/** How far a ring reaches past its cubes (game.css), and the gap to the next cube. */
const RING_OUT = 5;
const PILE_GAP = 3;

/**
 * A ring's clip-path, from its top left, in the pile's pitch (--u): a ring reaches 5px past its
 * cubes and the gap is 3px, so where a cube or cover of another group lies next to the ring, the
 * ring is cut back to that thing's edge and never paints over it (on a balance, size reads as
 * weight). '' when nothing lies next to it.
 * @param {Box} box the ring's places
 * @param {(col: number, row: number) => boolean} other another group's cube or cover is there
 * @returns {string}
 */
export function ringClip({ col, row, w, h }, other) {
  const cut = RING_OUT - PILE_GAP;
  const rows = Array.from({ length: h }, (_, k) => row + k);
  const cols = Array.from({ length: w }, (_, j) => col + j);
  const left = rows.some((r) => other(col - 1, r));
  const right = rows.some((r) => other(col + w, r));
  const above = cols.map((c) => other(c, row + h));
  const below = cols.map((c) => other(c, row - 1));
  if (!left && !right && !above.includes(true) && !below.includes(true)) return '';
  /** @type {(px: number, k?: number) => string} */
  const at = (px, k = 0) => (k ? `calc(${k} * var(--u) + ${px}px)` : `${px}px`);
  // Each neighbour's extent across the ring: columns j0..j1 of the ring's places.
  const spans = (flags) => flags.reduce((out, on, j) => {
    if (on && out.at(-1)?.[1] === j - 1) out.at(-1)[1] = j;
    else if (on) out.push([j, j]);
    return out;
  }, /** @type {number[][]} */ ([]));
  const [l, r] = [at(left ? cut : 0), at(2 * RING_OUT - PILE_GAP - (right ? cut : 0), w)];
  const [top, bottom] = [at(0), at(2 * RING_OUT - PILE_GAP, h)];
  const [topIn, bottomIn] = [at(cut), at(2 * RING_OUT - PILE_GAP - cut, h)];
  /** @type {(j: number) => string} where column j's cube starts */
  const from = (j) => at(RING_OUT, j);
  /** @type {(j: number) => string} where column j's cube ends */
  const to = (j) => at(RING_OUT - PILE_GAP, j + 1);
  const points = [[l, top]];
  for (const [j0, j1] of spans(above)) points.push([from(j0), top], [from(j0), topIn], [to(j1), topIn], [to(j1), top]);
  points.push([r, top], [r, bottom]);
  for (const [j0, j1] of spans(below).reverse()) points.push([to(j1), bottom], [to(j1), bottomIn], [from(j0), bottomIn], [from(j0), bottom]);
  points.push([l, bottom]);
  return `polygon(${points.map((p) => p.join(' ')).join(', ')})`;
}

/**
 * The 4px bridges joining cover pieces, in the gap under the upper row (design 6.6): over the
 * columns two pieces share, or across the gap between them when they share none.
 * @param {Box[]} pieces
 * @returns {Bridge[]}
 */
export function bridges(pieces) {
  return pieces.slice(1).map((upper, i) => {
    const lower = pieces[i];
    const from = Math.max(lower.col, upper.col);
    const to = Math.min(lower.col + lower.w, upper.col + upper.w);
    return from < to ? { from, to, row: upper.row, across: false } : { from: upper.col + upper.w, to: lower.col, row: upper.row, across: true };
  });
}

/**
 * Where ghosts for a value lie (design 7.1): the unknown's places, then on after the pan's last.
 * @param {PanLayout} layout
 * @param {number} group the unknown's group, or -1
 * @param {number} value
 * @returns {number[]}
 */
export function ghostSlots(layout, group, value) {
  const places = layout.spans[group]?.places ?? [];
  return Array.from({ length: value }, (_, k) => (k < places.length ? places[k] : layout.slots + k - places.length));
}

/** @type {(slots: number) => number} two rows at least, so most rounds draw alike */
export const rowsFor = (slots) => Math.max(2, Math.ceil(slots / 5));

/** The gap between two groups of a row, and the second row's top, in cells. */
export const GAP = 0.6;
export const LINE = 1 + GAP;

/**
 * A row of groups left to right, each in rows of five from the top (model set). x, y in cells.
 * @param {PanGroup[]} groups
 * @returns {LineLayout}
 */
export function layoutLine(groups) {
  const out = { dots: [], blocks: [], length: 0 };
  let x = 0;
  groups.forEach((g, group) => {
    out.blocks.push({ group, x, count: g.count });
    for (let k = 0; k < g.count; k++) out.dots.push({ group, role: g.role, second: Boolean(g.second), x: x + (k % 5), y: Math.floor(k / 5) });
    out.length = x + Math.min(5, Math.max(1, g.count));
    x = out.length + GAP;
  });
  return out;
}

/**
 * @param {string} tag
 * @param {string} className
 * @param {Partial<Box> & { x?: number, y?: number }} [box] sets --c --r --w --h --x --y
 * @returns {HTMLElement}
 */
export function el(tag, className, box = {}) {
  const node = document.createElement(tag);
  node.className = className;
  for (const [key, name] of [['col', '--c'], ['row', '--r'], ['w', '--w'], ['h', '--h'], ['x', '--x'], ['y', '--y']]) {
    if (box[key] !== undefined) node.style.setProperty(name, String(box[key]));
  }
  return node;
}

/** @type {(name: string, frame: boolean) => HTMLElement} a pan: strings, a bowl and a stack, or the stack alone */
function pan(name, frame) {
  const node = el('div', 'bl-pan');
  node.dataset.pan = name;
  if (frame) {
    const ns = 'http://www.w3.org/2000/svg';
    const strings = document.createElementNS(ns, 'svg');
    const path = document.createElementNS(ns, 'path');
    for (const [k, v] of [['class', 'bl-strings'], ['viewBox', '0 0 100 100'], ['preserveAspectRatio', 'none'], ['aria-hidden', 'true']]) strings.setAttribute(k, v);
    path.setAttribute('d', 'M50 0L1.5 100M50 0L98.5 100');
    path.setAttribute('vector-effect', 'non-scaling-stroke');
    strings.append(path);
    node.append(strings, el('span', 'bl-bowl'));
  }
  node.append(el('div', 'bl-stack'));
  return node;
}

/**
 * A layer with a frameless pan on each side, placed and tilted like the real ones.
 * @param {HTMLElement} scene
 * @returns {{ el: HTMLElement, left: HTMLElement, right: HTMLElement }}
 */
export function panLayer(scene) {
  const layer = el('div', 'bl-layer');
  const [left, right] = ['left', 'right'].map((name) => layer.appendChild(pan(name, false)).lastElementChild);
  scene.append(layer);
  // A style read: its pans start at the real ones' tilt, so a tilt set next moves them together.
  void layer.offsetWidth;
  return { el: layer, left: /** @type {HTMLElement} */ (left), right: /** @type {HTMLElement} */ (right) };
}

/** @type {() => HTMLElement} the stage: mathematical, left to right (R7) */
const stageOf = () => {
  const stage = el('div', 'bl-stage');
  stage.dir = 'ltr';
  stage.dataset.math = '';
  return stage;
};

/**
 * Draws the balance (design 6.8): the frame in --frame, cubes in rows of five in their role
 * colours, and the ? cover over a covered group, a piece per row joined by bridges, ? on the first.
 * @param {HTMLElement} host
 * @param {{ left: PanGroup[], right: PanGroup[], tilt: string, rows: number, cover: (mark?: string) => HTMLElement }} data
 *   cover: the cover maker (lib/cover.js)
 * @returns {{ stage: HTMLElement, scene: HTMLElement, pans: Record<string, PanView> }}
 */
export function drawBalance(host, data) {
  const stage = stageOf();
  const scene = stage.appendChild(el('div', 'bl-scene'));
  scene.dataset.tilt = data.tilt;
  scene.style.setProperty('--rows', String(data.rows));
  scene.append(el('span', 'bl-base'), el('span', 'bl-pole'));
  /** @type {Record<string, PanView>} */
  const pans = {};
  for (const name of ['left', 'right']) {
    const node = scene.appendChild(pan(name, true));
    const stack = /** @type {HTMLElement} */ (node.lastElementChild);
    const layout = layoutPan(data[name]);
    const cubes = layout.cubes.map((spot) => paint(stack.appendChild(el('span', 'bl-cube', spot)), spot));
    const lids = data[name].flatMap((g, i) => {
      if (!g.cover) return [];
      const pieces = layout.spans[i].runs.flatMap((r) => rowPieces(r.start, r.length));
      const lid = (className, box, mark) => {
        const node = stack.appendChild(el('span', className, box));
        node.append(data.cover(mark));
        return node;
      };
      return [...pieces.map((p, k) => lid(p.w % 2 ? 'bl-lid' : 'bl-lid is-even', p, k ? '' : '?')),
        ...bridges(pieces).map((b) => lid(`bl-lid bl-bridge${b.across ? ' is-across' : ''}`, { col: b.from, row: b.row, w: b.to - b.from }, ''))];
    });
    pans[name] = { el: node, stack, layout, cubes, lids };
  }
  scene.append(el('span', 'bl-beam'), el('span', 'bl-pivot'));
  host.replaceChildren(stage);
  return { stage, scene, pans };
}

/**
 * Draws the set model: the left side's row of groups, and under it the right side's.
 * @param {HTMLElement} host
 * @param {{ left: PanGroup[], right: PanGroup[], rows: number, cover: (mark?: string) => HTMLElement }} data
 *   cover: the cover maker (lib/cover.js)
 * @returns {{ stage: HTMLElement, scene: HTMLElement, lines: Record<string, LineView>, lids: HTMLElement[] }}
 */
export function drawRows(host, data) {
  const stage = stageOf();
  const scene = stage.appendChild(el('div', 'bl-set'));
  /** @type {HTMLElement[]} */
  const lids = [];
  /** @type {Record<string, LineView>} */
  const lines = {};
  for (const [name, y] of /** @type {[string, number][]} */ ([['left', 0], ['right', LINE]])) {
    const layout = layoutLine(data[name]);
    const dots = layout.dots.map((d) => paint(scene.appendChild(el('span', 'bl-dot', { x: d.x, y: y + d.y })), d));
    data[name].forEach((g, i) => {
      if (!g.cover) return;
      const lid = scene.appendChild(el('span', 'bl-lid', { x: layout.blocks[i].x, y, w: Math.max(1, g.count) }));
      lid.append(data.cover('?'));
      lids.push(lid);
    });
    lines[name] = { layout, dots };
  }
  scene.style.setProperty('--len', String(Math.max(lines.left.layout.length, lines.right.layout.length)));
  // The turn's axis is at the first row's middle.
  scene.style.setProperty('--line', String(lines.left.layout.length));
  scene.style.setProperty('--rows', String(data.rows));
  host.replaceChildren(stage);
  return { stage, scene, lines, lids };
}
