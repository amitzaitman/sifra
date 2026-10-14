// The balance and the turned rows (design 6.8, R6): pure layouts, and (host, data) drawings
// coloured by role tokens. Places: --c --r --w --h, or --x --y in cells.

/** @typedef {{ role: string, count: number, cover?: boolean, fresh?: boolean, blocks?: number[] }} PanGroup fresh, blocks: start a row */
/** @typedef {{ group: number, role: string, slot: number, col: number, row: number }} CubeSpot */
/** @typedef {{ start: number, length: number }} Run consecutive places */
/** @typedef {{ group: number, places: number[], runs: Run[] }} Span */
/** @typedef {{ cubes: CubeSpot[], spans: Span[], slots: number }} PanLayout */
/** @typedef {{ col: number, row: number, w: number, h: number }} Box */

/** @type {(slot: number) => { col: number, row: number }} rows of five, from the bottom */
export const at = (slot) => ({ col: slot % 5, row: Math.floor(slot / 5) });

/** @type {(slot: number) => number} */
const rowStart = (slot) => Math.ceil(slot / 5) * 5;

/** @type {(slots: number[]) => Run[]} */
export const runsOf = (slots) => slots.reduce((out, slot) => {
  const last = out.at(-1);
  if (last && last.start + last.length === slot) last.length += 1;
  else out.push({ start: slot, length: 1 });
  return out;
}, /** @type {Run[]} */ ([]));

/**
 * A pan's places, rows of five from the bottom: a fresh group or a block starts a row, else it
 * follows on (design 7.3). A cover takes one place at least (6.6).
 * @type {(groups: PanGroup[]) => PanLayout}
 */
export function layoutPan(groups) {
  /** @type {PanLayout} */
  const out = { cubes: [], spans: [], slots: 0 };
  groups.forEach((g, group) => {
    const runs = (g.blocks ?? [g.cover ? Math.max(1, g.count) : g.count]).map((length, i) => {
      if (i > 0 || g.fresh) out.slots = rowStart(out.slots);
      const run = { start: out.slots, length };
      out.slots += length;
      return run;
    });
    const places = runs.flatMap((r) => Array.from({ length: r.length }, (_, k) => r.start + k));
    for (const slot of places.slice(0, g.count)) out.cubes.push({ group, role: g.role, slot, ...at(slot) });
    out.spans.push({ group, places, runs });
  });
  return out;
}

/** @type {(start: number, length: number) => Box[]} a box per row (the stretched cover, 6.6) */
export function rowPieces(start, length) {
  /** @type {Box[]} */
  const out = [];
  for (let s = start; s < start + length; s += out.at(-1).w) out.push({ ...at(s), w: Math.min(5 - (s % 5), start + length - s), h: 1 });
  return out;
}

/** @type {(start: number, length: number) => Box[]} row pieces, rows of one width merged */
export const ringPieces = (start, length) => rowPieces(start, length).reduce((out, p) => {
  const last = out.at(-1);
  if (last && last.col === p.col && last.w === p.w && last.row + last.h === p.row) last.h += 1;
  else out.push(p);
  return out;
}, /** @type {Box[]} */ ([]));

/** @type {(pieces: Box[]) => { from: number, to: number, row: number, across: boolean }[]} the cover's 4px bridges */
export function bridges(pieces) {
  return pieces.slice(1).map((upper, i) => {
    const lower = pieces[i];
    const from = Math.max(lower.col, upper.col);
    const to = Math.min(lower.col + lower.w, upper.col + upper.w);
    return from < to ? { from, to, row: upper.row, across: false } : { from: upper.col + upper.w, to: lower.col, row: upper.row, across: true };
  });
}

/** @type {(layout: PanLayout, group: number, value: number) => number[]} ghosts: the unknown's places, then on (7.1) */
export function ghostSlots(layout, group, value) {
  const places = layout.spans[group]?.places ?? [];
  return Array.from({ length: value }, (_, k) => (k < places.length ? places[k] : layout.slots + k - places.length));
}

/** @type {(slots: number) => number} two rows at least */
export const rowsFor = (slots) => Math.max(2, Math.ceil(slots / 5));

/** The gap between two groups of a row, and the second row's top, in cells. */
export const GAP = 0.6;
export const LINE = 1 + GAP;

/**
 * A row of groups left to right, each in rows of five from the top (model set), in cells.
 * @type {(groups: PanGroup[]) => { dots: { group: number, role: string, x: number, y: number }[], blocks: { group: number, x: number, count: number }[], length: number }}
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

/** @type {(tag: string, className: string, box?: any) => HTMLElement} box sets --c --r --w --h --x --y */
export function el(tag, className, box = {}) {
  const node = document.createElement(tag);
  node.className = className;
  for (const [key, name] of [['col', '--c'], ['row', '--r'], ['w', '--w'], ['h', '--h'], ['x', '--x'], ['y', '--y']]) {
    if (box[key] !== undefined) node.style.setProperty(name, String(box[key]));
  }
  return node;
}

/** @type {(name: string, frame: boolean) => HTMLElement} a pan, or its stack alone */
function pan(name, frame) {
  const node = el('div', 'bl-pan');
  node.dataset.pan = name;
  // The strings and the bowl: static markup.
  if (frame) node.innerHTML = '<svg class="bl-strings" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="M50 0L1.5 100M50 0L98.5 100" vector-effect="non-scaling-stroke"/></svg><span class="bl-bowl"></span>';
  node.append(el('div', 'bl-stack'));
  return node;
}

/** @type {(scene: HTMLElement) => { el: HTMLElement, left: HTMLElement, right: HTMLElement }} a layer of frameless pans */
export function panLayer(scene) {
  const layer = el('div', 'bl-layer');
  const [left, right] = ['left', 'right'].map((name) => layer.appendChild(pan(name, false)).lastElementChild);
  scene.append(layer);
  return { el: layer, left: /** @type {HTMLElement} */ (left), right: /** @type {HTMLElement} */ (right) };
}

/** @type {() => HTMLElement} the stage: mathematical, left to right (R7) */
const stageOf = () => {
  const stage = el('div', 'bl-stage');
  stage.dir = 'ltr';
  stage.dataset.math = '';
  return stage;
};

/** @type {(host: HTMLElement, data: { left: PanGroup[], right: PanGroup[], tilt: string, rows: number }, makeCover: (mark?: string) => HTMLElement) => any} the balance (design 6.8), the cover a piece per row */
export function drawBalance(host, data, makeCover) {
  const stage = stageOf();
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
      const pieces = layout.spans[i].runs.flatMap((r) => rowPieces(r.start, r.length));
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

/** @type {(host: HTMLElement, data: { left: PanGroup[], right: PanGroup[], rows: number }, makeCover: (mark?: string) => HTMLElement) => any} the set model: a row of groups, the same turned under it */
export function drawRows(host, data, makeCover) {
  const stage = stageOf();
  const scene = stage.appendChild(el('div', 'bl-set'));
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
  // The turn's axis is at the first row's middle.
  scene.style.setProperty('--line', String(lines.left.layout.length));
  scene.style.setProperty('--rows', String(data.rows));
  host.replaceChildren(stage);
  return { stage, scene, lines, lids };
}
