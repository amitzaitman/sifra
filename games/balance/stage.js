// The balance and the turned rows (design 6.8, R6): pure layouts, and drawings that take (host,
// data) and colour through role tokens only. Places: --c --r --w --h (or --x --y in cells).

/** @typedef {{ role: string, count: number, cover?: boolean }} PanGroup a group, in the exercise's order */
/** @typedef {{ group: number, role: string, slot: number, col: number, row: number }} CubeSpot */
/** @typedef {{ cubes: CubeSpot[], spans: { group: number, start: number, length: number }[], slots: number }} PanLayout */
/** @typedef {{ col: number, row: number, w: number, h: number }} Box */

/** @type {(slot: number) => { col: number, row: number }} rows of five, left to right, the bottom row first */
export const at = (slot) => ({ col: slot % 5, row: Math.floor(slot / 5) });

/**
 * A pan's places: rows of five from the bottom. A covered group takes one place at least (a cover
 * over nothing stands on an empty place).
 * @param {PanGroup[]} groups
 * @returns {PanLayout}
 */
export function layoutPan(groups) {
  /** @type {PanLayout} */
  const out = { cubes: [], spans: [], slots: 0 };
  groups.forEach((g, group) => {
    for (let k = 0; k < g.count; k++) out.cubes.push({ group, role: g.role, slot: out.slots + k, ...at(out.slots + k) });
    const length = g.cover ? Math.max(1, g.count) : g.count;
    out.spans.push({ group, start: out.slots, length });
    out.slots += length;
  });
  return out;
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

/**
 * The 4px bridges joining cover pieces, in the gap under the upper row (design 6.6).
 * @param {Box[]} pieces
 * @returns {{ from: number, to: number, row: number, across: boolean }[]}
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
 * Where ghosts for a value lie (design 7.1): the unknown's places, then after the pan's last.
 * @param {PanLayout} layout
 * @param {number} group the unknown's group, or -1
 * @param {number} value
 * @returns {number[]}
 */
export function ghostSlots(layout, group, value) {
  const span = layout.spans[group] ?? { start: layout.slots, length: 0 };
  return Array.from({ length: value }, (_, k) => (k < span.length ? span.start + k : layout.slots + k - span.length));
}

/** @type {(slots: number) => number} two rows at least, so most rounds draw alike */
export const rowsFor = (slots) => Math.max(2, Math.ceil(slots / 5));

/** The gap between two groups of a row, and the second row's top, in cells. */
export const GAP = 0.6;
export const LINE = 1 + GAP;

/**
 * A row of groups left to right, each in rows of five from the top (model set). x, y in cells.
 * @param {PanGroup[]} groups
 * @returns {{ dots: { group: number, role: string, x: number, y: number }[], blocks: { group: number, x: number, count: number }[], length: number }}
 */
export function layoutLine(groups) {
  const out = { dots: [], blocks: [], length: 0 };
  let x = 0;
  groups.forEach((g, group) => {
    out.blocks.push({ group, x, count: g.count });
    for (let k = 0; k < g.count; k++) out.dots.push({ group, role: g.role, x: x + (k % 5), y: Math.floor(k / 5) });
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
  return { el: layer, left: /** @type {HTMLElement} */ (left), right: /** @type {HTMLElement} */ (right) };
}

/**
 * Draws the balance (design 6.8): the frame in --frame, cubes in rows of five, and the ? cover over
 * a covered group, a piece per row joined by bridges, ? on the first.
 * @param {HTMLElement} host
 * @param {{ left: PanGroup[], right: PanGroup[], tilt: string, rows: number }} data
 * @param {(mark?: string) => HTMLElement} makeCover lib/cover.js
 */
export function drawBalance(host, data, makeCover) {
  const stage = el('div', 'bl-stage');
  stage.dir = 'ltr';
  stage.dataset.math = '';
  const scene = stage.appendChild(el('div', 'bl-scene'));
  scene.dataset.tilt = data.tilt;
  scene.style.setProperty('--rows', String(data.rows));
  scene.append(el('span', 'bl-base'), el('span', 'bl-pole'));
  /** @type {Record<string, { el: HTMLElement, stack: HTMLElement, layout: PanLayout, cubes: HTMLElement[], lids: HTMLElement[] }>} */
  const pans = {};
  for (const name of ['left', 'right']) {
    const node = scene.appendChild(pan(name, true));
    const stack = /** @type {HTMLElement} */ (node.lastElementChild);
    const layout = layoutPan(data[name]);
    const cubes = layout.cubes.map((spot) => {
      const cube = stack.appendChild(el('span', 'bl-cube', spot));
      cube.dataset.role = spot.role;
      return cube;
    });
    const lids = data[name].flatMap((g, i) => {
      if (!g.cover) return [];
      const pieces = rowPieces(layout.spans[i].start, layout.spans[i].length);
      const lid = (className, box, mark) => {
        const node = stack.appendChild(el('span', className, box));
        node.append(makeCover(mark));
        return node;
      };
      return [...pieces.map((p, k) => lid('bl-lid', p, k ? '' : '?')),
        ...bridges(pieces).map((b) => lid(`bl-lid bl-bridge${b.across ? ' is-across' : ''}`, { col: b.from, row: b.row, w: b.to - b.from }, ''))];
    });
    pans[name] = { el: node, stack, layout, cubes, lids };
  }
  scene.append(el('span', 'bl-beam'), el('span', 'bl-pivot'));
  host.replaceChildren(stage);
  return { stage, scene, pans };
}

/**
 * Draws the set model: the left side's row of groups, and under it the same row turned.
 * @param {HTMLElement} host
 * @param {{ left: PanGroup[], right: PanGroup[], rows: number }} data
 * @param {(mark?: string) => HTMLElement} makeCover lib/cover.js
 */
export function drawRows(host, data, makeCover) {
  const stage = el('div', 'bl-stage');
  stage.dir = 'ltr';
  stage.dataset.math = '';
  const scene = stage.appendChild(el('div', 'bl-set'));
  /** @type {HTMLElement[]} */
  const lids = [];
  /** @type {Record<string, { layout: ReturnType<typeof layoutLine>, dots: HTMLElement[] }>} */
  const lines = {};
  for (const [name, y] of /** @type {[string, number][]} */ ([['left', 0], ['right', LINE]])) {
    const layout = layoutLine(data[name]);
    const dots = layout.dots.map((d) => {
      const dot = scene.appendChild(el('span', 'bl-dot', { x: d.x, y: y + d.y }));
      dot.dataset.role = d.role;
      return dot;
    });
    data[name].forEach((g, i) => {
      if (!g.cover) return;
      const lid = scene.appendChild(el('span', 'bl-lid', { x: layout.blocks[i].x, y, w: Math.max(1, g.count) }));
      lid.append(makeCover('?'));
      lids.push(lid);
    });
    lines[name] = { layout, dots };
  }
  scene.style.setProperty('--len', String(Math.max(lines.left.layout.length, lines.right.layout.length)));
  scene.style.setProperty('--rows', String(data.rows));
  host.replaceChildren(stage);
  return { stage, scene, lines, lids };
}
