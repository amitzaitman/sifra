// What the ten-frame picture does after a choice (R5, design 7): the display of the rule chosen
// (step 1), the structure hint (step 2), the counting tour (step 3), the closing, and the demo's
// steps. One object per kind of picture, its displays a table by display id; game.js runs them in
// order and settles their motion.
import { settle } from '../../lib/settle.js';
import { GAP, around, at, boxPath, disc, el, grow, outline, put, runPath, stagger } from './draw.js';

/**
 * A drawn picture: the drawing's elements (from draw.js), its size, and its state.
 * @typedef {{ kind: string, draw: HTMLElement, base: HTMLElement, size: { dw: number, dh: number },
 *   d: any, t: any, covers: HTMLElement[], lidsUp: boolean, undo: (() => void)[], toured: boolean,
 *   top?: HTMLElement[], bottom?: HTMLElement[], full?: () => void, hint?: HTMLElement }} Pic
 */

/** @typedef {import('./draw.js').Box} Box */

/**
 * A wrong choice's display drawn on a picture (R5 step 1) into its layer; it returns the
 * picture's own elements it moves, which game.js settles with the layer. Each kind keys its
 * drawings by display id in `displays`.
 * @typedef {(pic: Pic, root: HTMLElement, choice: { value: any, rule: string, display: string }) => HTMLElement[]} Display
 */

/**
 * An overlay over the drawing: its own [data-math] row (R7), read left to right inside.
 * @param {Pic} pic
 * @param {string} [name] 'display', 'hint' or ''
 * @param {string} [value]
 */
export function layer(pic, name, value = '') {
  const node = el('div', 'tf-layer');
  node.dir = 'ltr';
  node.dataset.math = '';
  if (name) node.dataset[name] = value;
  pic.draw.append(node);
  return node;
}

/**
 * Grows the drawing (ghosts that do not fit): the whole picture shrinks inside the panel and
 * nothing below it moves (design 7.1). Undone with the display.
 * @param {Pic} pic
 * @param {number} dw
 * @param {number} dh
 */
function resize(pic, dw, dh) {
  if (dw <= pic.size.dw && dh <= pic.size.dh) return;
  pic.draw.style.setProperty('--dw', String(Math.max(dw, pic.size.dw)));
  pic.draw.style.setProperty('--dh', String(Math.max(dh, pic.size.dh)));
  pic.undo.push(() => {
    pic.draw.style.setProperty('--dw', String(pic.size.dw));
    pic.draw.style.setProperty('--dh', String(pic.size.dh));
  });
}

/**
 * Lifts the covers (or puts them back): the shared cover lifts the same way in every game.
 * @param {Pic} pic
 * @param {boolean} up
 * @param {HTMLElement[]} [only]
 * @returns {HTMLElement[]} the lids that moved
 */
export function lift(pic, up, only = pic.covers) {
  const moved = only.filter((node) => node.classList.contains('is-up') !== up);
  for (const node of moved) {
    node.classList.toggle('is-up', up);
    node.firstElementChild.classList.toggle('is-lifted', up);
  }
  return moved;
}

/** A display lifts the covers for a while; they come back with it, unless a hint lifted them. @param {Pic} pic @param {HTMLElement[]} [only] */
function liftForDisplay(pic, only) {
  const moved = lift(pic, true, only);
  pic.undo.push(() => pic.lidsUp || lift(pic, false, moved));
  return moved;
}

/**
 * Blinks things already in the picture once (flash): restarted on every display.
 * @param {Pic} pic
 * @param {HTMLElement[]} nodes
 */
function blink(pic, nodes) {
  for (const node of nodes) {
    node.classList.remove('tf-blink');
    getComputedStyle(node).animationName;   // restart the animation
    node.classList.add('tf-blink');
  }
  pic.undo.push(() => nodes.forEach((node) => node.classList.remove('tf-blink')));
  return nodes;
}

/**
 * Flashes the whole's tag: it blinks and keeps its ring inside its own edge, so nothing of it
 * reaches the cover or the cells just under the tag (design 7.1). Undone with the display.
 * @param {Pic} pic
 * @param {HTMLElement} chip
 */
function chipFlash(pic, chip) {
  chip.classList.add('is-flashed');
  pic.undo.push(() => chip.classList.remove('is-flashed'));
  return blink(pic, [chip]);
}

/**
 * @param {Element} parent
 * @param {string} cls
 * @param {Box} box
 * @param {string} [text]
 * @param {string} [delay]
 */
function mark(parent, cls, box, text, delay) {
  const node = at(parent, cls, box, text);
  if (delay) node.style.setProperty('--d', delay);
  return node;
}
/** A display digit (design 7.1: --role-added-edge, written one by one). */
const digit = (parent, box, text, delay, cls = '') => mark(parent, `tf-digit ${cls}`, box, text, delay);
/**
 * A ghost goes under every digit in its layer: at() puts a digit in reading order, not last, so a
 * digit drawn after its ghost could land under it. Nothing else moves.
 */
const ghost = (parent, box, delay, cls = '') =>
  parent.insertBefore(mark(parent, `tf-ghost tf-enter ${cls}`, box, undefined, delay), parent.querySelector(':scope > [data-ry]'));
const ring = (parent, box, delay, cls = 'is-round') => mark(parent, `tf-ring tf-blink-in ${cls}`, box, undefined, delay);
/** @type {(box: Box) => Box} a chip's box, centred on a box */
const chipBox = (box) => ({ x: box.x + box.w / 2 - 0.55, y: box.y + box.h / 2 - 0.36, w: 1.1, h: 0.72 });
/** A chip with a number (design 7.2: numbers on white chips). @param {Element} parent @param {Box} box @param {string} text */
const chipAt = (parent, box, text, cls = '') => at(parent, `tf-chip ${cls}`, chipBox(box), text);
/** The tour's digit: one [data-tour] per digit, in --role-unknown (design 7.2). */
function tourDigit(parent, box, n, cls = '') {
  const node = at(parent, `tf-digit tf-tour ${cls}`, box, String(n));
  node.dataset.tour = String(n);
  return node;
}

/**
 * Counts on a list of boxes, chained (150ms each, design 7.2); the last grows.
 * @param {Element} root
 * @param {{ box: Box, n: number, cls?: string, before?: () => void }[]} steps
 * @param {AbortSignal} signal
 */
async function count(root, steps, signal) {
  for (const [j, s] of steps.entries()) {
    if (signal.aborted) return;
    s.before?.();
    const node = tourDigit(root, s.box, s.n, `${s.cls ?? ''}${j === steps.length - 1 ? ' is-last' : ''}`);
    await settle(node, signal);
  }
}

/** The tour shows an unknown thing now, not in the closing's fill order. @param {HTMLElement | SVGElement} node */
const show = (node) => {
  node.style.setProperty('--d', '0ms');
  node.classList.add('is-shown');
};

/** Waits for a list of elements' motion. @param {Element[]} nodes @param {AbortSignal} signal */
const settled = (nodes, signal) => Promise.all(nodes.map((node) => settle(node, signal)));

/**
 * Moves an outline under what is already in its layer, so its line and halo never cover a
 * digit or a chip there (digits keep their reading order: the outline holds no text).
 * @template {Element} T
 * @param {Element} root
 * @param {T} node
 * @returns {T}
 */
const under = (root, node) => {
  root.prepend(node);
  return node;
};

// ---------- Frames: the parts of a number, and making ten ----------

/** @param {Pic} pic */
const frameAt = (pic) => pic.t.L;

/**
 * A ring round a ghost on a frame, in pixels round its box (game.css .is-around.is-close): a
 * 1.5px gap off its dashed edge, then the line, at any unit, also where hypothetical frames shrink
 * the drawing; its halo stays off the next counter, 0.38 units away (design 7.1).
 */
const GHOST_RING = 'is-round is-around is-close on-ghost';
/**
 * The same ring round a ghost in a frame's white cell: it stays in the cell, whose white is its
 * gap off the tray, so it has no halo to bulge into the tray (game.css .in-cell; design 7.1).
 */
const CELL_GHOST_RING = `${GHOST_RING} in-cell`;

/**
 * How far the tour's line stands off the cells along a whole tray's border: past the tray's edge
 * (GAP) by half its 9px halo at the smallest unit a round draws (about 43px at 320px), so the
 * halo meets the edge and the navy rim stays whole.
 */
const OFF_TRAY = GAP + 0.105;

/**
 * Hypothetical frames under the real one for places past it (design 6.7), and the size that holds them.
 * @param {Pic} pic
 * @param {Element} root
 * @param {number} last the last place shown
 * @param {number} real cells in the real frames
 */
function hypothetical(pic, root, last, real) {
  const L = frameAt(pic);
  for (let f = real / L.per; f * L.per <= last; f++) {
    at(root, `tf-tray is-hypo${pic.d.whole ? '' : ' is-frame'} tf-enter`, L.trayAt(f));
    for (let i = f * L.per; i < (f + 1) * L.per; i++) at(root, 'tf-cell is-hypo tf-enter', L.place(i));
  }
  resize(pic, L.dw, L.height(last + 1));
}

/**
 * Hypothetical frames for a display's ghosts past the real cells (overflow, count-up), when it has any.
 * @param {Pic} pic
 * @param {HTMLElement} root
 * @param {number} value the chosen value, from the unknown's first place
 * @param {number} ghosts how many of its places hold a ghost
 */
function pastFrame(pic, root, value, ghosts) {
  if (ghosts) hypothetical(pic, root, pic.d.part + Math.max(value, pic.d.unknown) - 1, frameAt(pic).cells.length);
}

export const FRAME = {
  /** @type {Record<string, Display>} */
  displays: {
    flash(pic, root, { rule }) {
      const { t } = pic;
      const L = frameAt(pic);
      if (rule === 'given.whole') {
        if (t.chip) return chipFlash(pic, t.chip);
        // Round a bracket the ring stands off further, so its inner halo leaves the bracket's line
        // whole; the small dome on that line stays over the ring (game.css). Round the tray alone it
        // stands off in pixels (.is-around), its inner halo ending on the tray's edge, so the navy
        // rim stays whole at any unit (design 7.1).
        if (t.wrap) ring(root, grow(L.trays[0], 0.2), '', 'is-tray');
        else ring(root, L.trays[0], '', 'is-tray is-around');
        return blink(pic, [t.tray]);
      }
      t.parts.forEach((_, i) => ring(root, grow(disc(L.cells[i]), 0.1), '', 'is-round on-part in-cell'));
      return blink(pic, t.parts);
    },
    'empty-plate'(pic, root) {
      // The empty plate is the unknown's empty place (0): a frame whose unknown holds counters has none (canShow).
      if (!pic.t.empty) throw new Error(`ten-frame: empty-plate needs an empty unknown, not ${pic.d.unknown}`);
      const lids = liftForDisplay(pic);
      const box = disc(pic.t.empty);
      ring(root, box, '150ms', 'is-round is-zero is-inset');
      digit(root, box, '0', '150ms');
      return lids;
    },
    overflow(pic, root, { value }) {
      const { t, d } = pic;
      const L = frameAt(pic);
      const lids = liftForDisplay(pic);
      const whole = d.part + d.unknown;
      pastFrame(pic, root, value, value);
      // The chosen value as ghosts from the unknown's first place: what fits, then the excess
      // past the whole (ringed in the frame) and into hypothetical frames.
      for (let j = 0; j < value; j++) {
        const i = d.part + j;
        const box = disc(L.place(i));
        ghost(root, box, stagger(j, value));
        if (t.chip && i >= whole && i < L.cells.length) ring(root, box, stagger(j, value), CELL_GHOST_RING);
      }
      return lids;
    },
    'count-up'(pic, root, { value }) {
      const { d } = pic;
      const L = frameAt(pic);
      const lids = liftForDisplay(pic);
      const start = d.part;
      pastFrame(pic, root, value, Math.max(0, value - d.unknown));
      // Digits 1..value on the unknown's places; one left without a digit is ringed, or the extra
      // digit lands on a ghost after them.
      for (let j = 0; j < value; j++) {
        const i = start + j;
        const delay = stagger(j, value, 120);
        if (j >= d.unknown) ghost(root, disc(L.place(i)), delay);
        digit(root, L.place(i), String(j + 1), delay, j >= d.unknown ? 'on-ghost' : '');
      }
      if (value < d.unknown) ring(root, L.place(start + value), stagger(value, value + 1, 120), 'is-cell');
      else ring(root, disc(L.place(start + value - 1)), stagger(value - 1, value, 120), CELL_GHOST_RING);
      return lids;
    },
  },

  /** Before the hint: the cover lifts for good (R5 step 2), so the unknown's cells can be marked; a bracket stays. @param {Pic} pic */
  prep(pic) {
    if (pic.t.wrap || !pic.d.covered) return [];
    pic.lidsUp = true;
    return lift(pic, true);
  },

  /**
   * The whole's outline (parts of a number), and every unknown cell ringed (design 7.3). On the
   * tray's border the outline runs outside the tray, its halo clear of it, so the tour's outline
   * round the unknown (inside the tray, with its halo) nests in it and neither cuts the other.
   * Where the whole ends inside the tray, its line stays in the gap between cells (0.14 units),
   * off the cells outside it, and about 3px off the hint's ring: an unknown cell's inside the
   * whole, or the empty place's after it (answer 0). There the tour's outline, which ends at the
   * same place, lies on it. The tag sits on it. Each ring has a 3px --halo on the tray round its
   * cell (design 3, 7.2), drawn under the whole's line, so that line stays whole beside it.
   * @param {Pic} pic @param {HTMLElement} root
   */
  hint(pic, root) {
    const { t, d } = pic;
    const L = frameAt(pic);
    const pad = { out: 0.27, in: d.unknown ? 0.1 : 0.035, rows: d.rows };
    const ringed = t.run.length ? t.run : [t.empty];
    for (const c of ringed) at(root, 'tf-hint-halo', c);
    if (t.chip) outline(root, L, [runPath(L.cells.slice(0, d.part + d.unknown), pad)], 'tf-line-whole');
    for (const c of ringed) at(root, 'tf-ring is-cell is-hint', c);
  },

  /** Counts the unknown from 1 on its cells, and rings them (R5: the unknown is a part). @param {Pic} pic @param {HTMLElement} root @param {AbortSignal} signal */
  async tour(pic, root, signal) {
    const { t } = pic;
    const L = frameAt(pic);
    if (!t.run.length) {
      // The small '?' over the empty place lifts for good first, or the 0 is drawn over it (R5).
      pic.lidsUp = true;
      await settled(lift(pic, true), signal);
      await count(root, [{ box: disc(t.empty), n: 0 }], signal);
      return settle(ring(root, disc(t.empty), '', 'is-round is-zero is-inset is-unknown'), signal);
    }
    await count(root, t.run.map((c, j) => ({ box: c, n: j + 1, cls: 'on-cell' })), signal);
    // A bracket around the empty cells is already the ring, and a second outline's halo would
    // cut its '?' dome (design 6.6, 7.3). A run that wraps a row is one group: one outline. On
    // make-ten the tray is the whole: along its border the line runs outside it, its halo clear of
    // the navy edge, so the whole keeps its outline round the unknown (design 3, 6.7).
    const pad = pic.d.whole ? { out: OFF_TRAY, in: 0.1, rows: pic.d.rows } : 0.1;
    if (!signal.aborted && !t.wrap) await settle(outline(root, L, [runPath(t.run, pad, true)], 'tf-line-unknown tf-enter'), signal);
  },

  /** The cover lifts and the unknown fills in, in fill order (design 6.9). @param {Pic} pic */
  solve(pic) {
    const { t } = pic;
    const moved = lift(pic, true);
    t.wrap?.classList.add('is-gone');
    if (!t.run.length && !pic.toured) zero(pic);
    return moved;
  },

  /** The hand touches the known part's first counter (R9); the whole is the tray or its tag, which no touch counts. @param {Pic} pic @param {Hand} hand @param {Steps} steps */
  async demo(pic, hand, steps) {
    if (pic.t.parts[0]) await steps.press(pic.t.parts[0]);
    await steps.hint();
    await steps.tour();
  },
};

/**
 * The empty unknown, closed: a ring with 0 in --role-unknown (design 7.3), on the counter's place,
 * inside the hint's ring round the cell, which stays (7.2). @param {Pic} pic
 */
function zero(pic) {
  const root = layer(pic, '');
  const box = disc(pic.t.empty);
  at(root, 'tf-ring is-round is-zero is-inset is-unknown tf-enter', box);
  at(root, 'tf-digit tf-tour tf-enter', box, '0');
}

// ---------- The number bond (tree), and pair cards ----------

/**
 * Ghosts (and digits) under part circles, in order: the left then the right.
 * @param {Pic} pic
 * @param {HTMLElement} root
 * @param {{ place: (i: number) => Box, n: number }[]} sides
 * @param {number} fit how many fit; the rest is ringed (overflow) or the last is ringed (count-up)
 * @param {boolean} digits count-up
 */
function treeGhosts(pic, root, sides, fit, digits) {
  const L = pic.t.L;
  const total = sides.reduce((s, x) => s + x.n, 0);
  resize(pic, L.dw, L.height(Math.max(...sides.map((s) => s.n + (digits && total < fit ? 1 : 0)))));
  let k = 0;
  for (const side of sides) {
    /** @type {(Box & { row: number, col: number })[]} */
    const excess = [];
    for (let j = 0; j < side.n; j++, k++) {
      const box = side.place(j);
      const delay = stagger(k, total, digits ? 120 : 40);
      // count-up on a bond: the unknown's own places stay empty circles, the extra ones are ghosts.
      const place = digits && pic.kind === 'tree' && k < fit;
      if (place) mark(root, 'tf-place tf-enter', box, undefined, delay);
      else ghost(root, box, delay, 'is-dot');
      // A digit fills a dot inside its dashed edge: a white outline in its shape keeps it off the dashes (design 4).
      if (digits) digit(root, box, String(k + 1), delay, 'is-small is-outlined');
      if (!digits && k >= fit) excess.push({ ...box, row: Math.floor(j / 5), col: j % 5 });
    }
    // What does not fit stays in one ring (design 7.1): dots stand too close for a ring each. Its
    // line runs halfway between dots, 0.35 units apart, and crosses nothing, so it has no halo.
    // Over two rows it joins round the rows' end, not under the dots that fit.
    if (excess.length) under(root, outline(root, L, [runPath(excess, 0.175, 'end')], 'tf-line-added tf-blink-in', false));
  }
  if (!digits) return;
  // One dot in a ring, drawn under the others: its line passes 1.5px off the dot and the halo
  // goes under its neighbours, which stand only 0.35 units away.
  const dotRing = (box, delay) => under(root, ring(root, box, delay, 'is-round is-around is-close on-ghost'));
  const lastSide = sides.at(-1);
  if (total < fit) {
    const box = lastSide.place(lastSide.n);
    mark(root, 'tf-place tf-enter', box, undefined, stagger(total, total + 1, 120));
    dotRing(box, stagger(total, total + 1, 120));
  } else {
    const side = sides[sides.length - 1].n ? sides[sides.length - 1] : sides[0];
    dotRing(side.place(side.n - 1), stagger(total - 1, total, 120));
  }
}

/** @param {Pic} pic @param {HTMLElement} root */
function treeWholeHint(pic, root) {
  const { L, wholeDots } = pic.t;
  const boxes = [L.top, ...wholeDots.map((_, i) => L.wholeAt(i))];
  // Padded so the line's 9px halo clears the circle and the last dot at 320px (unit about 17.5px).
  outline(root, L, [boxPath(around(boxes), 0.28, 1.2)], 'tf-line-whole');
}

/**
 * Counts an unknown part's dots from 1 (white on the shown dots), then rings them; 0: a ring with 0.
 * @param {Pic} pic
 * @param {HTMLElement} root
 * @param {any} side
 * @param {AbortSignal} signal
 */
async function treeCount(pic, root, side, signal) {
  const { L } = pic.t;
  if (!side.n) {
    // A dot's place is too small for the grown 0 inside a ring: the ring grows down and out from
    // the place's top (clear of the circle's hint ring above), and the 0 sits in its middle. It
    // stands on the middle place of the row, under its own circle, not at the row's start.
    const p = side.place(2);
    const box = { x: p.x - 0.25, y: p.y - 0.12, w: p.w + 0.5, h: p.h + 0.5 };
    await count(root, [{ box: { ...p, y: p.y + 0.13 }, n: 0 }], signal);
    return settle(under(root, ring(root, box, '', 'is-round is-zero is-unknown')), signal);
  }
  await count(root, side.dots.map((dot, j) => ({ box: side.place(j), n: j + 1, cls: `on-unknown is-small${j > 8 ? ' is-two' : ''}`,
    before: () => show(dot) })), signal);
  if (!signal.aborted) {
    const dots = around(side.dots.map((_, j) => side.place(j)));
    // A grown 10 passes its dot's sides: the line stands off further across, not up.
    const wide = side.n > 9 ? 0.12 : 0;
    const group = { ...dots, x: dots.x - wide, w: dots.w + 2 * wide };
    // Under the digits, over the circle's hint ring and its halo, clear of its line (draw.js BELOW).
    // The line crosses nothing, so it has no halo, which would cut the dots.
    await settle(under(root, outline(root, L, [boxPath(group, 0.16, 0.5)], 'tf-line-unknown tf-enter', false)), signal);
  }
}

export const TREE = {
  /** @type {Record<string, Display>} */
  displays: {
    flash(pic, root, { rule }) {
      const { t } = pic;
      const circle = rule === 'given.whole' ? t.top : t.left.circle;
      // Round the circle, clear of its edge: it keeps its size; the dots stand clear of the ring.
      ring(root, rule === 'given.whole' ? t.L.top : t.L.left, '', 'is-round is-around');
      return blink(pic, [circle]);
    },
    overflow(pic, root, { value }) {
      treeGhosts(pic, root, [{ place: pic.t.right.place, n: value }], pic.d.unknown, false);
      return [];
    },
    'count-up'(pic, root, { value }) {
      treeGhosts(pic, root, [{ place: pic.t.right.place, n: value }], pic.d.unknown, true);
      return [];
    },
  },
  prep: () => [],
  /** The whole's outline, and the cover of the unknown ringed. @param {Pic} pic @param {HTMLElement} root */
  hint(pic, root) {
    treeWholeHint(pic, root);
    at(root, 'tf-ring is-round is-around is-hint', pic.t.L.right);
  },
  /** @param {Pic} pic @param {HTMLElement} root @param {AbortSignal} signal */
  tour: (pic, root, signal) => treeCount(pic, root, pic.t.right, signal),
  /** @param {Pic} pic */
  solve: (pic) => lift(pic, true),
  /** The hand touches the whole's first dot, then the known part's (R7, R9). @param {Pic} pic @param {Hand} hand @param {Steps} steps */
  async demo(pic, hand, steps) {
    for (const dot of [pic.t.wholeDots[0], pic.t.left.dots[0]]) if (dot) await steps.press(dot);
    await steps.hint();
    await steps.tour();
  },
};

/** A pair card's ghosts under the two part circles, the left number then the right. @param {Pic} pic @param {HTMLElement} root @param {number[]} value @param {boolean} digits count-up */
const pairGhosts = (pic, root, value, digits) =>
  treeGhosts(pic, root, [{ place: pic.t.left.place, n: value[0] }, { place: pic.t.right.place, n: value[1] }], pic.d.whole, digits);

export const PAIRS = {
  /** @type {Record<string, Display>} */
  displays: {
    flash(pic, root) {
      ring(root, pic.t.L.top, '', 'is-round is-around');
      return blink(pic, [pic.t.top]);
    },
    'empty-plate'(pic, root) {
      const sides = [pic.t.left, pic.t.right].filter((s) => s.n === 0);
      const lids = liftForDisplay(pic, sides.flatMap((s) => s.covers));
      // The ring is the empty part's circle itself: a stem ends on its line, as on any circle.
      for (const s of sides) {
        ring(root, s.box, '150ms', 'is-round is-zero');
        digit(root, s.box, '0', '150ms', 'is-big');
      }
      return lids;
    },
    overflow(pic, root, { value }) {
      pairGhosts(pic, root, value, false);
      return [];
    },
    'count-up'(pic, root, { value }) {
      pairGhosts(pic, root, value, true);
      return [];
    },
  },
  prep: () => [],
  /** @param {Pic} pic @param {HTMLElement} root */
  hint(pic, root) {
    treeWholeHint(pic, root);
    for (const box of [pic.t.L.left, pic.t.L.right]) at(root, 'tf-ring is-round is-around is-hint', box);
  },
  /**
   * Both parts, each from 1, each in its own row of digits (R7), so the last [data-tour] is the
   * second part's last digit.
   * @param {Pic} pic @param {HTMLElement} root @param {AbortSignal} signal
   */
  async tour(pic, root, signal) {
    await treeCount(pic, root, pic.t.left, signal);
    if (!signal.aborted) await treeCount(pic, layer(pic, ''), pic.t.right, signal);
  },
  /** @param {Pic} pic */
  solve: (pic) => lift(pic, true),
  /** The hand touches the whole's first dot: both parts are unknown (R9). @param {Pic} pic @param {Hand} hand @param {Steps} steps */
  async demo(pic, hand, steps) {
    if (pic.t.wholeDots[0]) await steps.press(pic.t.wholeDots[0]);
    await steps.hint();
    await steps.tour();
  },
};

// ---------- Bundles: ten and some more ----------

/** @param {Pic} pic */
const stickBox = (pic, j) => pic.t.L.stick(j);
/** @type {(node: Element) => HTMLElement} a counter's veil: the unknown whole on it */
const veil = (node) => node.querySelector('.tf-veil');
/** @type {(b: Box) => Box} a bundle with its band, which passes 8% of its width on each side (game.css) */
const banded = (b) => ({ ...b, x: b.x - b.w * 0.08, w: b.w * 1.16 });
/**
 * From the loose sticks down to the hint's chip under them, in units: over nine sticks the unit is
 * about 20px at 320px and the chip is held at 18px tall, so its edge stays 6px off them (13px with up
 * to four sticks). Apart enough to read as the group's label, not a stick's.
 */
const UNDER = 0.4;
/** How far a chip held at 26 x 18px (game.css .is-held) passes its box at that unit: the tour's ring holds that too. */
const HELD = 0.1;
/** The band the chip takes under the sticks (its 0.72 units tall box and the room above it). */
const UNDER_BAND = UNDER + 0.72;
/**
 * The hint's chip of the loose sticks (design 7.2, 7.3): centred under them on the paper, as bridging
 * ten's chips stand by their group, so it covers no stick and no ink dot a touch left (6.3). With none
 * it stands under the place of the first two, off the tour's ring round the bundle alone.
 * @type {(pic: Pic) => Box}
 */
const onesChip = (pic) => {
  const group = around(Array.from({ length: pic.t.sticks.length || 2 }, (_, j) => stickBox(pic, j)));
  return { ...chipBox(group), y: group.y + group.h + UNDER };
};

/**
 * Grows the drawing for the rest of the round, for what the hint keeps on it (7.2): a display drawn
 * later grows it further and gives this size back (resize). @param {Pic} pic @param {number} dh
 */
function hold(pic, dh) {
  if (dh <= pic.size.dh) return;
  pic.size = { ...pic.size, dh };
  pic.draw.style.setProperty('--dh', String(Math.max(dh, Number(pic.draw.style.getPropertyValue('--dh')) || 0)));
}

export const BUNDLES = {
  /** @type {Record<string, Display>} */
  displays: {
    /** given.part, the bundle's 10 (10 + 4 = ?): the bundle blinks and stays ringed with its band. */
    flash(pic, root) {
      ring(root, banded(pic.t.L.bundle), '', 'is-around');
      return blink(pic, [pic.t.bundle]);
    },
    'label-ten'(pic, root) {
      const L = pic.t.L;
      ring(root, banded(L.bundle), '', 'is-around');
      chipAt(root, L.bundle, '10', 'tf-blink-in');
      return blink(pic, [pic.t.bundle]);
    },
    build(pic, root, { value }) {
      const L = pic.t.L;
      // The chosen number built next to the real one, the same way: bundles and sticks. Once the
      // hint's chip stands under the sticks (a third miss), the row goes under it.
      const down = pic.hint ? UNDER_BAND : 0;
      const row = L.row(Math.floor(value / 10), value % 10, L.below + down);
      resize(pic, row.right + 0.3, L.belowH + down);
      const all = [...row.bundles, ...row.sticks];
      all.forEach((box, j) => ghost(root, box, stagger(j, all.length), j < row.bundles.length ? 'is-bundle' : 'is-stick'));
      if (row.bundles.length) ring(root, around(row.bundles), '300ms', 'is-around');
      return [];
    },
    /** Counting on from the bundle: 10, then the loose sticks. */
    'count-up'(pic, root, { value }) {
      // The count starts at the bundle's 10: under it there is no stick to stop on (canShow keeps such a card out).
      if (!(value >= 10)) throw new Error(`ten-frame: count-up from the bundle needs 10 or more, not ${value}`);
      const { d } = pic;
      const L = pic.t.L;
      digit(root, L.above(L.bundle), '10', '', 'is-above');
      const last = Math.max(d.ones, value - 10);
      resize(pic, stickBox(pic, last).x + 1, L.dh);
      for (let j = 0; j < value - 10; j++) {
        const delay = stagger(j + 1, value - 9, 120);
        if (j >= d.ones) ghost(root, stickBox(pic, j), delay, 'is-stick');
        digit(root, L.above(stickBox(pic, j)), String(11 + j), delay, 'is-above');
      }
      const k = value - 10;
      if (k < d.ones) ring(root, stickBox(pic, k), stagger(k + 1, k + 2, 120), 'is-around');
      else ring(root, stickBox(pic, k - 1), stagger(k, k + 1, 120), 'is-around');
      return [];
    },
  },
  prep: () => [],
  /**
   * Each part with its number, left to right (R7; design 7.3): the bundle gets a 10 on its band
   * (place value: the ten is ten things tied), and the loose sticks a chip of the same size with
   * their count, under them, as bridging ten's hint labels its parts; the drawing grows to hold it.
   * Nine sticks make the unit small: both are held in pixels round their 14px digits, as level 9's
   * 10 (game.css). The parts, never the whole (R5), and a mark that no display shows (design 7.2).
   * @param {Pic} pic @param {HTMLElement} root
   */
  hint(pic, root) {
    chipAt(root, pic.t.L.bundle, '10', 'is-held');
    const chip = onesChip(pic);
    at(root, 'tf-chip is-held', chip, String(pic.t.sticks.length));
    hold(pic, chip.y + chip.h + HELD + 0.3);
  },
  /** Counts on from 10 over the loose sticks (R5: the unknown is the whole). @param {Pic} pic @param {HTMLElement} root @param {AbortSignal} signal */
  async tour(pic, root, signal) {
    const { t } = pic;
    const L = t.L;
    await count(root, [
      { box: L.above(L.bundle), n: 10, cls: 'is-above', before: () => show(veil(t.bundle)) },
      ...t.sticks.map((s, j) => ({ box: L.above(stickBox(pic, j)), n: 11 + j, cls: 'is-above', before: () => show(veil(s)) })),
    ], signal);
    // A ring round the bundle with its band and the sticks, in pixels (game.css .is-around): its
    // inner halo is a 3px gap off them, so the band's tips and the last stick keep their size. It
    // holds the hint's chip under the sticks too; not a 0 beside a bundle alone.
    const chip = pic.hint && t.sticks.length ? [grow(onesChip(pic), HELD)] : [];
    const boxes = [banded(L.bundle), ...t.sticks.map((_, j) => stickBox(pic, j)), ...chip];
    if (!signal.aborted) await settle(under(root, at(root, 'tf-ring is-around is-unknown tf-enter', around(boxes))), signal);
  },
  solve: () => [],
  /** The hand touches the bundle, then the first loose stick (R7, R9). @param {Pic} pic @param {Hand} hand @param {Steps} steps */
  async demo(pic, hand, steps) {
    await steps.press(pic.t.bundle);
    if (pic.t.sticks.length) await steps.press(pic.t.sticks[0]);
    await steps.hint();
    await steps.tour();
  },
};

// ---------- Bundles with the ones unknown: 14 = 10 + ? (level 9) ----------

export const BUNDLES_PART = {
  /** @type {Record<string, Display>} */
  displays: {
    flash(pic, root, { rule }) {
      const { t } = pic;
      if (rule === 'given.whole') return chipFlash(pic, t.chip);
      ring(root, banded(t.L.bundle), '', 'is-around');
      return blink(pic, [t.bundle]);
    },
    /**
     * From 1 on the ones' places (the unknown is a part): one place left without a digit is
     * ringed, or the extra digit lands on a ghost stick after them.
     */
    'count-up'(pic, root, { value }) {
      const { t, d } = pic;
      const L = t.L;
      const lids = liftForDisplay(pic);
      const last = Math.max(d.ones, value);
      resize(pic, L.stick(last - 1).x + 1, L.dh);
      for (let j = 0; j < last; j++) {
        const delay = stagger(j, last, 120);
        if (j >= d.ones) ghost(root, L.stick(j), delay, 'is-stick');
        else mark(root, 'tf-place is-stick tf-enter', L.stick(j), undefined, delay);
        if (j < value) digit(root, L.above(L.stick(j)), String(j + 1), delay, 'is-above');
      }
      if (value < d.ones) ring(root, L.stick(value), stagger(value, last, 120), 'is-around');
      else ring(root, L.stick(value - 1), stagger(value - 1, last, 120), 'is-around');
      return lids;
    },
  },
  prep: () => [],
  /** The bundle gets a 10 label, and the cover over the ones a ring (7.2). @param {Pic} pic @param {HTMLElement} root */
  hint(pic, root) {
    // Nine ones make the unit small: the chip is held in pixels round its 14px digits (game.css).
    chipAt(root, pic.t.L.bundle, '10', 'is-held');
    at(root, 'tf-ring is-around is-hint', pic.t.L.places);
  },
  /**
   * The cover lifts for good, and the ones are counted from 1 as they show (R5: the unknown is a
   * part, so the tour ends on the answer, not on the whole).
   * @param {Pic} pic @param {HTMLElement} root @param {AbortSignal} signal
   */
  async tour(pic, root, signal) {
    const { t } = pic;
    const L = t.L;
    pic.lidsUp = true;
    await settled(lift(pic, true), signal);
    await count(root, t.sticks.map((s, j) => ({ box: L.above(L.stick(j)), n: j + 1, cls: 'is-above', before: () => show(s) })), signal);
    // The ring around the counted ones is the hint's ring around their places: one line.
    if (!signal.aborted) await settle(under(root, at(root, 'tf-ring is-around is-unknown tf-enter', L.places)), signal);
  },
  /** @param {Pic} pic */
  solve: (pic) => lift(pic, true),
  /** The hand touches the bundle, the known part; the whole is the tag (R9). @param {Pic} pic @param {Hand} hand @param {Steps} steps */
  async demo(pic, hand, steps) {
    await steps.press(pic.t.bundle);
    await steps.hint();
    await steps.tour();
  },
};

// ---------- Two frames: bridging ten ----------

/** @param {Pic} pic @param {number} i */
const slot = (pic, i) => disc(pic.t.L.place(i));

/** @type {WeakMap<HTMLElement, HTMLElement[]>} each counter's latest move (what move returned) */
const lastMove = new WeakMap();

/**
 * Moves a counter of the second frame into the first frame's next cell; the rest of the second
 * frame closes up from the left (R6). When the first frame is full, the exercise is rewritten
 * as 10 + the rest (pedagogy 6.2: level 10 only; its picture is the only one that moves).
 * @param {Pic} pic
 * @param {HTMLElement} [which]
 * @returns {HTMLElement[]} what moves; land() it once it has settled
 */
export function move(pic, which) {
  if (!pic.d.move || pic.top.length >= 10 || !pic.bottom.length) return [];
  const i = Math.max(0, which ? pic.bottom.indexOf(which) : 0);
  const [node] = pic.bottom.splice(i, 1);
  pic.top.push(node);
  const moving = [node, ...pic.bottom.slice(i)];
  for (const m of moving) {
    m.classList.add('is-moving');
    lastMove.set(m, moving);
  }
  // A counter keeps its shade where it goes: the second addend's stay light (design 3).
  const spots = pic.t.L.counters(pic.top.length - pic.d.a);
  [...pic.top, ...pic.bottom].forEach((m, k) => put(m, slot(pic, spots[k].cell)));
  if (pic.top.length === 10) pic.full?.();
  if (pic.hint) BRIDGE.hint(pic, pic.hint);   // the hint follows the counters
  return moving;
}

/**
 * Ends a settled move: its counters stop sliding (is-moving carries the transition), except those a
 * later move took on while this one ran (a second tap, the tour's fill): they still slide there.
 * @param {HTMLElement[]} moving what move returned
 */
export function land(moving) {
  for (const m of moving) if (lastMove.get(m) === moving) m.classList.remove('is-moving');
}

/** Moves until the first frame is full, one counter at a time (level 10). @param {Pic} pic @param {AbortSignal} signal @param {Hand} [hand] */
export async function fill(pic, signal, hand) {
  while (pic.top.length < 10 && pic.bottom.length && !signal.aborted) {
    if (hand) await hand.tap(pic.bottom[0]);
    if (signal.aborted) return;
    const moving = move(pic);
    await settled(moving, signal);
    land(moving);
  }
}

/**
 * Where the bridging hint's gold lines stand (cells are 32.2px at 320px, 36.3px at 360px, 48.6px at 390px).
 * In the gap between cells (0.14 units) they run along its middle, 0.07: the line is then 2.1px off the dashed ring
 * of the cell beside it, and its 9px halo (4.5px each side) reaches 2.2px into that cell, so the rings are drawn after
 * the lines and keep their dashes whole. On a tray's border they run outside the tray, 0.17 units past its edge (5.5px
 * at 320px), so the halo stops a pixel short of the tray's rim and the rim stays whole; the whole's line stands past
 * them (draw.js WHOLE_OFF). No more than that: once the first frame is full, the line under the first frame and
 * the line over the second face each other across the 0.5 units between the trays, 0.16 units apart (2.2px of paper
 * between them at 320px), and all the halos are drawn before the lines.
 */
const HINT_PAD = { out: 0.31, in: 0.07, rows: 2 };

/**
 * Where the two frames stand now (a display draws on them): the counters in order, their places,
 * and the free places, the first frame's then on past the second's counters.
 * @param {Pic} pic
 */
function bridgeNow(pic) {
  const [top, bottom] = [pic.top, pic.bottom];
  const boxes = [...top.map((_, i) => slot(pic, i)), ...bottom.map((_, j) => slot(pic, 10 + j))];
  const free = [...Array(10 - top.length).keys()].map((i) => top.length + i)
    .concat([...Array(40).keys()].map((j) => 10 + bottom.length + j));
  return { top, bottom, counters: [...top, ...bottom], boxes, free };
}

export const BRIDGE = {
  /** @type {Record<string, Display>} */
  displays: {
    /** Counted twice: the counters that filled the ten are counted again with the whole second addend. */
    overflow(pic, root, { value }) {
      const { counters, free } = bridgeNow(pic);
      const extra = value - counters.length;
      const places = free.slice(0, extra);
      if (places.at(-1) >= 20) hypothetical(pic, root, places.at(-1), 20);
      places.forEach((i, j) => {
        ghost(root, slot(pic, i), stagger(j, extra));
        // In a real cell (the first 20 places) the ring keeps to the cell's white; in a hypothetical frame it has its halo.
        ring(root, slot(pic, i), stagger(j, extra), i < 20 ? CELL_GHOST_RING : GHOST_RING);
      });
      return [];
    },
    /**
     * The count stops at ten (or one short); the counters left over blink and stay ringed. One more
     * than the counters (a slip over the sum): the extra digit lands on a ghost in the second frame's
     * next place, in a ring (design 7.3), the same size as the two-digit numbers before it.
     */
    'count-up'(pic, root, { value }) {
      const { counters, boxes } = bridgeNow(pic);
      const n = Math.min(value, counters.length);
      const all = Math.max(n, value);
      for (let j = 0; j < n; j++) digit(root, boxes[j], String(j + 1), stagger(j, all, 120), j < 9 ? 'on-disc' : 'on-disc is-two');
      if (value > counters.length) {
        const box = slot(pic, 10 + pic.bottom.length);
        const delay = stagger(n, all, 120);
        ghost(root, box, delay);
        digit(root, box, String(value), delay, 'on-disc is-two');
        ring(root, box, delay, CELL_GHOST_RING);
        return [];
      }
      const left = counters.slice(value);
      left.forEach((_, j) => ring(root, grow(boxes[value + j], 0.1), '300ms', 'is-round on-part in-cell'));
      return blink(pic, left);
    },
    /**
     * Counted on from the first addend's last counter, itself counted (count.start-included): its
     * number on it, then on over the counters after it, so the count lands one short; the counter left
     * over blinks and stays ringed, as in the count that stops (design 7.3). The frames count with
     * numbers on the counters, so these jumps have no arcs.
     */
    jumps(pic, root, { value }) {
      const { a, b } = pic.d;
      if (!(value >= a && value < a + b)) throw new Error(`ten-frame: jumps on the two frames land from ${a} to ${a + b - 1}, not on ${value}`);
      const { counters, boxes } = bridgeNow(pic);
      const n = value - a + 1;
      for (let j = 0; j < n; j++) digit(root, boxes[a - 1 + j], String(a + j), stagger(j, n, 120), a + j < 10 ? 'on-disc' : 'on-disc is-two');
      const left = counters.slice(value);
      left.forEach((_, j) => ring(root, grow(boxes[value + j], 0.1), '300ms', 'is-round on-part in-cell'));
      return blink(pic, left);
    },
    /** The full first frame is the ten that was forgotten. */
    'label-ten'(pic, root) {
      const { top, bottom, boxes, free } = bridgeNow(pic);
      const L = pic.t.L;
      const m = 10 - top.length;
      free.slice(0, m).forEach((i, j) => ghost(root, slot(pic, i), stagger(j, m)));
      bottom.slice(0, m).forEach((_, j) => {
        const gone = mark(root, 'tf-gone tf-enter', boxes[top.length + j], undefined, stagger(j, m));
        gone.dataset.role = 'removed';
      });
      ring(root, grow(L.trays[0], 0.1), '', 'is-tray');
      chipAt(root, L.tag, '10', 'tf-blink-in');
      return blink(pic, [pic.t.trays[0]]);
    },
  },
  prep: () => [],
  /**
   * The second addend split as it goes into the frames (addsub-facts 4.7), each part with its
   * number (layoutBridge's labels): the counters that make the ten, dashed like the empty cells
   * they go to, and the rest in one outline, also when it wraps a row (one group, one label). Once
   * the first frame is full (level 10), the counters that came and the rest. No chip covers a
   * counter, and the outlines go first (HINT_PAD), then the dashed places, so no halo cuts a ring, and
   * the chips last, so none is cut. The whole's outline (a haloless line on the paper, shown by the tour
   * and the closing) stands past the hint's lines (draw.js WHOLE_OFF) and still moves up to just after
   * this layer, so no halo of the hint can cut its 3px line, as on a phone held sideways, where cells are
   * 26px and the halo reaches it; the tour's chip and numbers, drawn later, stay above it.
   * @param {Pic} pic @param {HTMLElement} root
   */
  hint(pic, root) {
    const L = pic.t.L;
    const groups = L.labels(pic.top.length - pic.d.a);
    root.replaceChildren();
    // One SVG for both groups' lines (once the first frame is full): the band between the frames is 0.5 units, so
    // the lines facing each other there stand 0.16 apart, and a halo drawn after a line would cut it.
    const lines = groups.filter((g) => g.line).map((g) => runPath(g.cells.map((i) => L.place(i)), HINT_PAD, true));
    if (lines.length) outline(root, L, lines, 'tf-line-part');
    if (pic.top.length < 10) {
      for (let i = pic.top.length; i < 10; i++) at(root, 'tf-place is-target', disc(L.place(i)));
      for (const i of groups[0].cells) at(root, 'tf-place is-target', grow(disc(L.place(i)), 0.08));
    }
    for (const g of groups) at(root, 'tf-chip', g.box, String(g.n));
    root.after(pic.t.whole);
  },
  /**
   * Ten, then on over the rest (addsub-facts 4.7, R5). Level 10 first fills the first frame, so
   * the exercise reads 10 + the rest; in fixed frames (levels 11-12) nothing moves and the
   * child's exercise stays: the ten is the first frame's counters and the ones that would fill
   * it, shown where they are. Its 10 sits above the first frame, clear of the hint's numbers.
   * No veil: the counters keep both shades (8 + 2, then + 3), each number on a white circle, and
   * the whole's outline closes the count (design 2, principle 3's exception).
   * @param {Pic} pic @param {HTMLElement} root @param {AbortSignal} signal
   */
  async tour(pic, root, signal) {
    const { t, d } = pic;
    const L = t.L;
    if (d.move) await fill(pic, signal);
    if (signal.aborted) return;
    // The counters in layoutBridge's order: the first ten are the ten (the first frame and the
    // ones that would fill it), the rest are counted on, every one of them the second addend's.
    const rest = [...pic.top, ...pic.bottom].slice(10);
    const spots = L.counters(pic.top.length - d.a);
    await count(root, [
      { box: L.tag, n: 10, cls: 'is-chip' },
      ...rest.map((_, j) => ({ box: slot(pic, spots[10 + j].cell), n: 11 + j, cls: 'on-disc is-two' })),
    ], signal);
    if (signal.aborted) return;
    show(t.whole);
    await settle(t.whole, signal);
  },
  /** The closing: the whole's outline shows (game.css, .is-solved); the counters stay as they are. */
  solve: () => [],
  /**
   * Level 10: the hand moves counters into the first frame until it is full, as its taps do in
   * play. Fixed frames: the hand touches the first counter of each addend (R7), then the hint and the tour.
   * @param {Pic} pic @param {Hand} hand @param {Steps} steps
   */
  async demo(pic, hand, steps) {
    if (pic.d.move) return fill(pic, steps.signal, hand);
    for (const counter of [pic.top[0], pic.bottom[0]]) if (counter) await steps.press(counter);
    await steps.hint();
    await steps.tour();
  },
};

/**
 * A demo's steps (R9): the hint and the tour, each after the hand rests, and press, the hand's tap
 * on a counted thing, which then gets the ink dot a touch leaves in play (design 6.3).
 * @typedef {{ hint: () => Promise<void>, tour: () => Promise<void>, press: (node: HTMLElement) => Promise<void>, signal: AbortSignal }} Steps
 */

export const KINDS = { frame: FRAME, tree: TREE, pairs: PAIRS, bundles: BUNDLES, 'bundles-part': BUNDLES_PART, bridge: BRIDGE };

/** @type {(kind: string, display: string) => boolean} whether a kind of picture has a drawing for a display */
export const draws = (kind, display) => Object.hasOwn(KINDS[kind].displays, display);

/**
 * A kind's drawing of a display (architecture 2.1). One it has none for throws, so a display never
 * falls through to another one's drawing.
 * @param {string} kind
 * @param {string} display
 * @returns {Display}
 */
export function displayOf(kind, display) {
  if (!draws(kind, display)) throw new Error(`ten-frame: the ${kind} picture has no ${display} display`);
  return KINDS[kind].displays[display];
}
