// What the ten-frame picture does after a choice (R5, design 7): the display of the rule chosen
// (step 1), the structure hint (step 2), the counting tour (step 3), the closing, and the demo's
// steps. One object per kind of picture; game.js runs them in order and settles their motion.
import { settle } from '../../lib/settle.js';
import { around, at, boxPath, disc, el, grow, outline, put, runPath, segments, stagger } from './draw.js';

/**
 * A drawn picture: the drawing's elements (from draw.js), its size, and its state.
 * @typedef {{ kind: string, draw: HTMLElement, base: HTMLElement, size: { dw: number, dh: number },
 *   d: any, t: any, covers: HTMLElement[], lidsUp: boolean, undo: (() => void)[], toured: boolean,
 *   top?: HTMLElement[], bottom?: HTMLElement[], full?: () => void, hint?: HTMLElement }} Pic
 */

/** @typedef {import('./draw.js').Box} Box */

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
const ghost = (parent, box, delay, cls = '') => mark(parent, `tf-ghost tf-enter ${cls}`, box, undefined, delay);
const ring = (parent, box, delay, cls = 'is-round') => mark(parent, `tf-ring tf-blink-in ${cls}`, box, undefined, delay);
/** A chip with a number (design 7.2: numbers on white chips). @param {Element} parent @param {Box} box @param {string} text */
const chipAt = (parent, box, text, cls = '') => at(parent, `tf-chip ${cls}`, { x: box.x + box.w / 2 - 0.55, y: box.y + box.h / 2 - 0.36, w: 1.1, h: 0.72 }, text);
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

/** The tour shows an unknown thing now, not in the closing's fill order. @param {HTMLElement} node */
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

export const FRAME = {
  /** @param {Pic} pic @param {HTMLElement} root @param {{ value: any, rule: string, display: string }} choice */
  display(pic, root, { value, rule, display }) {
    const { t, d } = pic;
    const L = frameAt(pic);
    const real = L.cells.length;
    if (display === 'flash' && rule === 'given.whole') {
      const target = t.chip ?? t.tray;
      ring(root, grow(t.chip ? L.tag : L.trays[0], 0.1), '', t.chip ? 'is-chip' : 'is-tray');
      return blink(pic, [target]);
    }
    if (display === 'flash') {
      t.parts.forEach((_, i) => ring(root, grow(disc(L.cells[i]), 0.1), '', 'is-round on-part'));
      return blink(pic, t.parts);
    }
    const lids = liftForDisplay(pic);
    if (display === 'empty-plate') {
      const box = disc(t.empty);
      ring(root, grow(box, 0.08), '150ms', 'is-round is-zero');
      digit(root, box, '0', '150ms');
      return lids;
    }
    const whole = d.part + d.unknown;
    const start = d.part;
    const ghosts = display === 'overflow' ? value : Math.max(0, value - d.unknown);
    if (ghosts) hypothetical(pic, root, start + Math.max(value, d.unknown) - 1, real);
    if (display === 'overflow') {
      // The chosen value as ghosts from the unknown's first place: what fits, then the excess
      // past the whole (ringed in the frame) and into hypothetical frames.
      for (let j = 0; j < value; j++) {
        const i = start + j;
        const box = disc(L.place(i));
        ghost(root, box, stagger(j, value));
        if (t.chip && i >= whole && i < real) ring(root, grow(box, 0.1), stagger(j, value));
      }
      return lids;
    }
    // count-up: digits 1..value on the unknown's places; one left without a digit is ringed,
    // or the extra digit lands on a ghost after them.
    for (let j = 0; j < value; j++) {
      const i = start + j;
      const delay = stagger(j, value, 120);
      if (j >= d.unknown) ghost(root, disc(L.place(i)), delay);
      digit(root, L.place(i), String(j + 1), delay, j >= d.unknown ? 'on-ghost' : '');
    }
    if (value < d.unknown) ring(root, L.place(start + value), stagger(value, value + 1, 120), 'is-cell');
    else ring(root, grow(disc(L.place(start + value - 1)), 0.1), stagger(value - 1, value, 120));
    return lids;
  },

  /** Before the hint: the cover lifts for good (R5 step 2), so the unknown's cells can be marked; a bracket stays. @param {Pic} pic */
  prep(pic) {
    if (pic.t.wrap || !pic.d.covered) return [];
    pic.lidsUp = true;
    return lift(pic, true);
  },

  /** The whole's outline (parts of a number), and every unknown cell ringed (design 7.3). @param {Pic} pic @param {HTMLElement} root */
  hint(pic, root) {
    const { t, d } = pic;
    const L = frameAt(pic);
    if (t.chip) outline(root, L, [runPath(L.cells.slice(0, d.part + d.unknown), 0.1)], 'tf-line-whole');
    for (const c of t.run.length ? t.run : [t.empty]) at(root, 'tf-ring is-cell is-hint', c);
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
      return settle(ring(root, grow(disc(t.empty), 0.08), '', 'is-round is-zero is-unknown'), signal);
    }
    await count(root, t.run.map((c, j) => ({ box: c, n: j + 1, cls: 'on-cell' })), signal);
    // A bracket around the empty cells is already the ring, and a second outline's halo would
    // cut its '?' dome (design 6.6, 7.3).
    if (!signal.aborted && !t.wrap) await settle(outline(root, L, [runPath(t.run, 0.1)], 'tf-line-unknown tf-enter'), signal);
  },

  /** The cover lifts and the unknown fills in, in fill order (design 6.9). @param {Pic} pic */
  solve(pic) {
    const { t } = pic;
    const moved = lift(pic, true);
    t.wrap?.classList.add('is-gone');
    if (!t.run.length && !pic.toured) zero(pic);
    return moved;
  },

  /** @param {Pic} pic @param {Hand} hand @param {Steps} steps */
  async demo(pic, hand, steps) {
    await hand.tap(pic.covers[0] ?? pic.t.cells[pic.d.part]);
    await steps.hint();
    await steps.tour();
  },
};

/** The empty unknown, closed: a ring with 0 in --role-unknown (design 7.3). @param {Pic} pic */
function zero(pic) {
  const root = layer(pic, '');
  const box = disc(pic.t.empty);
  at(root, 'tf-ring is-round is-zero is-unknown tf-enter', grow(box, 0.08));
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
    for (let j = 0; j < side.n; j++, k++) {
      const box = side.place(j);
      const delay = stagger(k, total, digits ? 120 : 40);
      // count-up on a bond: the unknown's own places stay empty circles, the extra ones are ghosts.
      const place = digits && pic.kind === 'tree' && k < fit;
      if (place) mark(root, 'tf-place tf-enter', box, undefined, delay);
      else ghost(root, box, delay, 'is-dot');
      // On a ghost a digit is 19px, or a two-digit number sits on a white label (design 4).
      if (digits) digit(root, box, String(k + 1), delay, place ? 'is-small' : k + 1 > 9 ? 'is-small is-label' : 'is-small on-ghost');
      if (!digits && k >= fit) ring(root, grow(box, 0.12), delay);
    }
  }
  if (!digits) return;
  const lastSide = sides.at(-1);
  if (total < fit) {
    const box = lastSide.place(lastSide.n);
    mark(root, 'tf-place tf-enter', box, undefined, stagger(total, total + 1, 120));
    ring(root, grow(box, 0.12), stagger(total, total + 1, 120));
  } else {
    const side = sides[sides.length - 1].n ? sides[sides.length - 1] : sides[0];
    // Under the digits: a two-digit label is wider than its ghost.
    under(root, ring(root, grow(side.place(side.n - 1), 0.12), stagger(total - 1, total, 120)));
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
    // the place's top (clear of the circle's hint ring above), and the 0 sits in its middle.
    const p = side.place(0);
    const box = { x: p.x - 0.25, y: p.y - 0.12, w: p.w + 0.5, h: p.h + 0.5 };
    await count(root, [{ box: { ...p, y: p.y + 0.13 }, n: 0 }], signal);
    return settle(under(root, ring(root, box, '', 'is-round is-zero is-unknown')), signal);
  }
  await count(root, side.dots.map((dot, j) => ({ box: side.place(j), n: j + 1, cls: 'on-unknown is-small',
    before: () => show(dot) })), signal);
  if (!signal.aborted) {
    const group = around(side.dots.map((_, j) => side.place(j)));
    // Under the drawing: the dots sit 0.35 units below the part circle, too close for the outline's
    // 9px halo to clear them, so the dots, their digits and the circle's ring are drawn over it.
    const line = outline(root, L, [boxPath(group, 0.16, 0.5)], 'tf-line-unknown tf-enter');
    pic.base.before(line);
    await settle(line, signal);
  }
}

export const TREE = {
  /** @param {Pic} pic @param {HTMLElement} root @param {{ value: any, rule: string, display: string }} choice */
  display(pic, root, { value, rule, display }) {
    const { t, d } = pic;
    if (display === 'flash') {
      const circle = rule === 'given.whole' ? t.top : t.left.circle;
      // A ring round the part's circle clears its 3px edge, and the ring's halo the dots below.
      if (rule === 'given.whole') ring(root, grow(t.L.top, 0.12));
      else ring(root, grow(t.L.left, 0.17), '', 'is-round on-part');
      return blink(pic, [circle]);
    }
    treeGhosts(pic, root, [{ place: t.right.place, n: value }], d.unknown, display === 'count-up');
    return [];
  },
  prep: () => [],
  /** The whole's outline, and the cover of the unknown ringed. @param {Pic} pic @param {HTMLElement} root */
  hint(pic, root) {
    treeWholeHint(pic, root);
    at(root, 'tf-ring is-round is-hint', grow(pic.t.L.right, 0.14));
  },
  /** @param {Pic} pic @param {HTMLElement} root @param {AbortSignal} signal */
  tour: (pic, root, signal) => treeCount(pic, root, pic.t.right, signal),
  /** @param {Pic} pic */
  solve: (pic) => lift(pic, true),
  /** @param {Pic} pic @param {Hand} hand @param {Steps} steps */
  async demo(pic, hand, steps) {
    await hand.tap(pic.t.top);
    await hand.tap(pic.t.left.circle);
    await hand.tap(pic.covers[0]);
    await steps.hint();
    await steps.tour();
  },
};

export const PAIRS = {
  /** @param {Pic} pic @param {HTMLElement} root @param {{ value: any, rule: string, display: string }} choice */
  display(pic, root, { value, display }) {
    const { t, d } = pic;
    if (display === 'flash') {
      ring(root, grow(t.L.top, 0.12));
      return blink(pic, [t.top]);
    }
    if (display === 'empty-plate') {
      const sides = [t.left, t.right].filter((s) => s.n === 0);
      const lids = liftForDisplay(pic, sides.flatMap((s) => s.covers));
      // The ring is the empty part's circle itself: a stem ends on its line, as on any circle.
      for (const s of sides) {
        ring(root, s.box, '150ms', 'is-round is-zero');
        digit(root, s.box, '0', '150ms', 'is-big');
      }
      return lids;
    }
    treeGhosts(pic, root, [{ place: t.left.place, n: value[0] }, { place: t.right.place, n: value[1] }], d.whole, display === 'count-up');
    return [];
  },
  prep: () => [],
  /** @param {Pic} pic @param {HTMLElement} root */
  hint(pic, root) {
    treeWholeHint(pic, root);
    for (const box of [pic.t.L.left, pic.t.L.right]) at(root, 'tf-ring is-round is-hint', grow(box, 0.14));
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
  /** @param {Pic} pic @param {Hand} hand @param {Steps} steps */
  async demo(pic, hand, steps) {
    await hand.tap(pic.t.top);
    for (const node of pic.covers) await hand.tap(node);
    await steps.hint();
    await steps.tour();
  },
};

// ---------- Bundles: ten and some more ----------

/** @param {Pic} pic */
const stickBox = (pic, j) => pic.t.L.stick(j);
/** @type {(node: Element) => HTMLElement} a counter's veil: the unknown whole on it */
const veil = (node) => node.querySelector('.tf-veil');

export const BUNDLES = {
  /** @param {Pic} pic @param {HTMLElement} root @param {{ value: any, rule: string, display: string }} choice */
  display(pic, root, { value, display }) {
    const { t, d } = pic;
    const L = t.L;
    if (display === 'label-ten') {
      ring(root, grow(L.bundle, 0.14), '', 'is-tray');
      chipAt(root, L.bundle, '10', 'tf-blink-in');
      return blink(pic, [t.bundle]);
    }
    if (display === 'build') {
      // The chosen number built next to the real one, the same way: bundles and sticks.
      const row = L.row(Math.floor(value / 10), value % 10, L.below);
      resize(pic, row.right + 0.3, L.belowH);
      const all = [...row.bundles, ...row.sticks];
      all.forEach((box, j) => ghost(root, box, stagger(j, all.length), j < row.bundles.length ? 'is-bundle' : 'is-stick'));
      if (row.bundles.length) ring(root, grow(around(row.bundles), 0.14), '300ms', 'is-tray');
      return [];
    }
    // count-up, counting on from the bundle: 10, then the loose sticks.
    digit(root, L.above(L.bundle), '10', '', 'is-above');
    const last = Math.max(d.ones, value - 10);
    resize(pic, stickBox(pic, last).x + 1, L.dh);
    for (let j = 0; j < value - 10; j++) {
      const delay = stagger(j + 1, value - 9, 120);
      if (j >= d.ones) ghost(root, stickBox(pic, j), delay, 'is-stick');
      digit(root, L.above(stickBox(pic, j)), String(11 + j), delay, 'is-above');
    }
    const k = value - 10;
    if (k < d.ones) ring(root, grow(stickBox(pic, k), 0.14), stagger(k + 1, k + 2, 120), 'is-tray');
    else ring(root, grow(stickBox(pic, k - 1), 0.14), stagger(k, k + 1, 120), 'is-tray');
    return [];
  },
  prep: () => [],
  /** The bundle gets a 10 label (place value: the ten is ten things tied). @param {Pic} pic @param {HTMLElement} root */
  hint: (pic, root) => chipAt(root, pic.t.L.bundle, '10'),
  /** Counts on from 10 over the loose sticks (R5: the unknown is the whole). @param {Pic} pic @param {HTMLElement} root @param {AbortSignal} signal */
  async tour(pic, root, signal) {
    const { t } = pic;
    const L = t.L;
    await count(root, [
      { box: L.above(L.bundle), n: 10, cls: 'is-above', before: () => show(veil(t.bundle)) },
      ...t.sticks.map((s, j) => ({ box: L.above(stickBox(pic, j)), n: 11 + j, cls: 'is-above', before: () => show(veil(s)) })),
    ], signal);
    const boxes = [L.bundle, ...t.sticks.map((_, j) => stickBox(pic, j))];
    if (!signal.aborted) await settle(under(root, outline(root, L, [boxPath(around(boxes), 0.18, 0.4)], 'tf-line-unknown tf-enter')), signal);
  },
  solve: () => [],
  /** @param {Pic} pic @param {Hand} hand @param {Steps} steps */
  async demo(pic, hand, steps) {
    await hand.tap(pic.t.bundle);
    await steps.hint();
    if (pic.t.sticks.length) await hand.tap(pic.t.sticks[0]);
    await steps.tour();
  },
};

// ---------- Bundles with the ones unknown: 14 = 10 + ? (level 9) ----------

export const BUNDLES_PART = {
  /** @param {Pic} pic @param {HTMLElement} root @param {{ value: any, rule: string, display: string }} choice */
  display(pic, root, { value, rule, display }) {
    const { t, d } = pic;
    const L = t.L;
    if (display === 'flash' && rule === 'given.whole') {
      ring(root, grow(L.tag, 0.18), '', 'is-chip');
      return blink(pic, [t.chip]);
    }
    if (display === 'flash') {
      ring(root, grow(L.bundle, 0.14), '', 'is-tray');
      return blink(pic, [t.bundle]);
    }
    // count-up from 1 on the ones' places (the unknown is a part): one place left without a digit
    // is ringed, or the extra digit lands on a ghost stick after them.
    const lids = liftForDisplay(pic);
    const last = Math.max(d.ones, value);
    resize(pic, L.stick(last - 1).x + 1, L.dh);
    for (let j = 0; j < last; j++) {
      const delay = stagger(j, last, 120);
      if (j >= d.ones) ghost(root, L.stick(j), delay, 'is-stick');
      else mark(root, 'tf-place is-stick tf-enter', L.stick(j), undefined, delay);
      if (j < value) digit(root, L.above(L.stick(j)), String(j + 1), delay, 'is-above');
    }
    if (value < d.ones) ring(root, grow(L.stick(value), 0.14), stagger(value, last, 120), 'is-tray');
    else ring(root, grow(L.stick(value - 1), 0.14), stagger(value - 1, last, 120), 'is-tray');
    return lids;
  },
  prep: () => [],
  /** The bundle gets a 10 label, and the cover over the ones a ring (7.2). @param {Pic} pic @param {HTMLElement} root */
  hint(pic, root) {
    chipAt(root, pic.t.L.bundle, '10');
    at(root, 'tf-ring is-tray is-hint', grow(pic.t.L.places, 0.14));
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
    // The ring around the counted ones lies on the hint's ring around their places: one line.
    if (!signal.aborted) await settle(under(root, outline(root, L, [boxPath(L.places, 0.14, 0.5)], 'tf-line-unknown tf-enter')), signal);
  },
  /** @param {Pic} pic */
  solve: (pic) => lift(pic, true),
  /** @param {Pic} pic @param {Hand} hand @param {Steps} steps */
  async demo(pic, hand, steps) {
    await hand.tap(pic.t.bundle);
    if (pic.covers[0]) await hand.tap(pic.covers[0]);
    await steps.hint();
    await steps.tour();
  },
};

// ---------- Two frames: bridging ten ----------

/** @param {Pic} pic @param {number} i */
const slot = (pic, i) => disc(pic.t.L.place(i));

/**
 * Moves a counter of the second frame into the first frame's next cell; the rest of the second
 * frame closes up from the left (R6). When the first frame is full, the exercise is rewritten
 * as 10 + the rest (pedagogy 6.2: level 10 only; its picture is the only one that moves).
 * @param {Pic} pic
 * @param {HTMLElement} [which]
 * @returns {HTMLElement[]} what moves
 */
export function move(pic, which) {
  if (!pic.d.move || pic.top.length >= 10 || !pic.bottom.length) return [];
  const i = Math.max(0, which ? pic.bottom.indexOf(which) : 0);
  const [node] = pic.bottom.splice(i, 1);
  pic.top.push(node);
  const moving = [node, ...pic.bottom.slice(i)];
  for (const m of moving) m.classList.add('is-moving');
  put(node, slot(pic, pic.top.length - 1));
  pic.bottom.forEach((m, j) => put(m, slot(pic, 10 + j)));
  if (pic.top.length === 10) pic.full?.();
  if (pic.hint) BRIDGE.hint(pic, pic.hint);   // the hint follows the counters
  return moving;
}

/** Moves until the first frame is full, one counter at a time (level 10). @param {Pic} pic @param {AbortSignal} signal @param {Hand} [hand] */
export async function fill(pic, signal, hand) {
  while (pic.top.length < 10 && pic.bottom.length && !signal.aborted) {
    if (hand) await hand.tap(pic.bottom[0]);
    if (signal.aborted) return;
    const moving = move(pic);
    await settled(moving, signal);
    for (const m of moving) m.classList.remove('is-moving');
  }
}

export const BRIDGE = {
  /** @param {Pic} pic @param {HTMLElement} root @param {{ value: any, rule: string, display: string }} choice */
  display(pic, root, { value, display }) {
    const { t } = pic;
    const L = t.L;
    const [top, bottom] = [pic.top, pic.bottom];
    const counters = [...top, ...bottom];
    const boxes = [...top.map((_, i) => slot(pic, i)), ...bottom.map((_, j) => slot(pic, 10 + j))];
    const free = [...Array(10 - top.length).keys()].map((i) => top.length + i)
      .concat([...Array(40).keys()].map((j) => 10 + bottom.length + j));
    if (display === 'overflow') {
      // Counted twice: the counters that filled the ten are counted again with the whole second addend.
      const extra = value - counters.length;
      const places = free.slice(0, extra);
      if (places.at(-1) >= 20) hypothetical(pic, root, places.at(-1), 20);
      places.forEach((i, j) => {
        ghost(root, slot(pic, i), stagger(j, extra));
        ring(root, grow(slot(pic, i), 0.1), stagger(j, extra));
      });
      return [];
    }
    if (display === 'count-up') {
      // The count stops at ten; the counters left over blink and stay ringed.
      const n = Math.min(value, counters.length);
      for (let j = 0; j < n; j++) digit(root, boxes[j], String(j + 1), stagger(j, n, 120), 'on-disc');
      const left = counters.slice(value);
      left.forEach((_, j) => ring(root, grow(boxes[value + j], 0.1), '300ms', 'is-round on-part'));
      return blink(pic, left);
    }
    // label-ten: the full first frame is the ten that was forgotten.
    const m = 10 - top.length;
    free.slice(0, m).forEach((i, j) => ghost(root, slot(pic, i), stagger(j, m)));
    bottom.slice(0, m).forEach((_, j) => {
      const gone = mark(root, 'tf-gone tf-enter', boxes[top.length + j], undefined, stagger(j, m));
      gone.dataset.role = 'removed';
    });
    ring(root, grow(L.trays[0], 0.1), '', 'is-tray');
    chipAt(root, L.tag, '10', 'tf-blink-in');
    return blink(pic, [t.trays[0]]);
  },
  prep: () => [],
  /**
   * The second addend split as it goes into the frames (addsub-facts 4.7), each part with its
   * number: the counters that make the ten, dashed like the empty cells they go to, and the rest
   * in one outline, also when it wraps a row (one group, one label). Once the first frame is full
   * (level 10), the counters that came and the rest.
   * @param {Pic} pic @param {HTMLElement} root
   */
  hint(pic, root) {
    const { t, d } = pic;
    const L = t.L;
    const [top, bottom] = [pic.top, pic.bottom];
    const m = 10 - top.length;
    // A group's number on a white chip (0.72 high) centred over a box at y, by default on the top
    // edge of the group's first row.
    const label = (cells, n, box = segments(cells)[0], y = box.y - 0.2) => chipAt(root, { x: box.x, y: y - 0.3, w: box.w, h: 0.6 }, String(n));
    const group = (cells, n) => {
      if (!cells.length) return;
      outline(root, L, [runPath(cells, 0.12, true)], 'tf-line-part');
      label(cells, n);
    };
    root.replaceChildren();
    if (m > 0) {
      for (let i = top.length; i < 10; i++) at(root, 'tf-place is-target', disc(L.place(i)));
      const going = bottom.slice(0, m).map((_, j) => L.place(10 + j));
      for (const c of going) at(root, 'tf-place is-target', grow(disc(c), 0.08));
      if (going.length) label(going, going.length);
      group(bottom.slice(m).map((_, j) => L.place(10 + m + j)), bottom.length - m);
    } else {
      // The first frame full: the counters that came fill its second row, under its first, so
      // each group's number goes below it: theirs in the gap between the frames, the rest's
      // below its first row, over the second frame's empty cells. No chip covers a counter, and
      // both outlines go first, so neither cuts a chip.
      const came = [...Array(10 - d.a).keys()].map((j) => L.place(d.a + j));
      const rest = bottom.map((_, j) => L.place(10 + j));
      for (const cells of [came, rest]) outline(root, L, [runPath(cells, 0.12, true)], 'tf-line-part');
      label(came, came.length, segments(came)[0], (L.place(5).y + 1 + L.place(10).y) / 2);
      // Under the cells of its first row that have none below them, the chip's top on their bottom edge.
      const open = rest.filter((c) => c.row === 0 && !rest.some((r) => r.row === 1 && r.col === c.col));
      if (open.length) label(rest, rest.length, around(open), open[0].y + 1 + 0.36);
    }
  },
  /**
   * Ten, then on over the rest (addsub-facts 4.7, R5). Level 10 first fills the first frame, so
   * the exercise reads 10 + the rest; in fixed frames (levels 11-12) nothing moves and the
   * child's exercise stays: the ten is the first frame's counters and the ones that would fill
   * it, shown where they are. Its 10 sits above the first frame, clear of the hint's numbers.
   * @param {Pic} pic @param {HTMLElement} root @param {AbortSignal} signal
   */
  async tour(pic, root, signal) {
    const { t, d } = pic;
    const L = t.L;
    if (d.move) await fill(pic, signal);
    if (signal.aborted) return;
    const m = 10 - pic.top.length;
    [...pic.top, ...pic.bottom.slice(0, m)].forEach((c, j) => {
      veil(c).style.setProperty('--d', stagger(j, 10));
      veil(c).classList.add('is-shown');
    });
    await count(root, [
      { box: L.tag, n: 10, cls: 'is-chip' },
      ...pic.bottom.slice(m).map((c, j) => ({ box: slot(pic, 10 + m + j), n: 11 + j, cls: 'on-unknown', before: () => show(veil(c)) })),
    ], signal);
    if (!signal.aborted) await settle(under(root, outline(root, L, [boxPath(around(L.trays), 0.12, 0.5)], 'tf-line-unknown tf-enter')), signal);
  },
  solve: () => [],
  /**
   * Level 10: the hand moves counters into the first frame until it is full. Fixed frames: the
   * hand points at the second addend, then the hint and the tour.
   * @param {Pic} pic @param {Hand} hand @param {Steps} steps
   */
  async demo(pic, hand, steps) {
    if (pic.d.move) return fill(pic, steps.signal, hand);
    if (pic.bottom.length) await hand.tap(pic.bottom[0]);
    await steps.hint();
    await steps.tour();
  },
};

/**
 * @typedef {{ hint: () => Promise<void>, tour: () => Promise<void>, signal: AbortSignal }} Steps
 */

export const KINDS = { frame: FRAME, tree: TREE, pairs: PAIRS, bundles: BUNDLES, 'bundles-part': BUNDLES_PART, bridge: BRIDGE };
