// The stories on screen (architecture 2.4, 2.8; design 6.10, 7). scene.js says what each state
// holds and where; drawScene puts its marks in the page, one span per mark in its layer, its box in
// CSS variables (game.css has the one positioning rule). The view moves the picture from state to
// state, a mark keeping its node while its id stays: the event, a display, the hint, the tour, the
// closing. Waits go through settle(); delays only between items entering in order (R10), and in the
// event between what comes or goes, a beat apart (decisions.md 2026-11-03).
import { cover } from '../../lib/cover.js';
import { reduced, settle } from '../../lib/settle.js';
import { PX, ROUND, THUMB, builtAt, layoutScene, phasesOf, planScene, storyOf } from './scene.js';

/** @typedef {import('./scene.js').Len} Len */
/** @typedef {import('./scene.js').Mark} Mark */
/** @typedef {import('./scene.js').Layout} Layout */
/** @typedef {{ el: HTMLElement, m: Mark, changed: Set<string> }} Placed a mark's node, and what changed on a kept one */
/** @typedef {{ draw: HTMLElement, added: Placed[], kept: Placed[], gone: HTMLElement[] }} Drawn what drawScene did */
/** @typedef {{ display: string, rule: string, value: number }} Shown a wrong choice and its display */
/** @typedef {{ phase: string, display: Shown | null, hint: boolean, tour: number, solved: boolean }} State */

/** The displays the scene draws (architecture 2.1): miss throws on any other before the picture changes. */
export const DISPLAYS = ['overflow', 'flash', 'count-up', 'jumps'];

/** The layers, bottom up (design 6.10): appended in this order, and nothing goes between them. */
const LAYERS = ['basket', 'halo', 'places', 'objects', 'lines', 'arcs', 'covers', 'chips', 'digits', 'dome'];
/** A mark's class by kind. A '?' (qmark) is its cover's own mark, drawn by app.css, so it has no node. */
const CLASS = {
  object: 'st-obj', outline: 'st-outline', ghost: 'st-ghost', place: 'st-place', ring: 'st-ring', line: 'st-line', halo: 'st-halo',
  arc: 'st-arc', lid: 'st-lid', cover: 'st-piece', coverPlace: 'st-dash', chip: 'st-chip', digit: 'st-digit', dome: 'st-dome',
};
/** The kinds drawn as lib/cover.js's cover: they come down as they enter and lift as they go (design 6.6). */
const DOMES = ['lid', 'cover', 'dome'];
/** The kinds drawn in their object's shape (a balloon's egg) at its place. */
const SHAPED = ['object', 'outline', 'ghost', 'place', 'ring'];
/**
 * What a tap on a mark is in the off-target log (architecture 3.2), by kind: a counted thing (an object, the outline
 * a leaver left), a chip, a line (the basket's rim, a frame, is none); a cover is lib/cover.js's own.
 * @type {(m: Mark) => string | null}
 */
const tapOf = (m) => (m.kind === 'object' || m.kind === 'outline' ? 'object' : m.kind === 'chip' ? 'chip'
  : m.kind === 'line' && m.role !== 'frame' ? 'line' : null);
const SVG = 'http://www.w3.org/2000/svg';

/**
 * A balloon's string (design 6.10): a short S under its knot, in a box game.css sizes from the unit;
 * the stroke keeps its width at any size (a whole 2px in a round), as the balance's strings do.
 * @returns {SVGSVGElement}
 */
function balloonString() {
  const svg = document.createElementNS(SVG, 'svg');
  for (const [k, v] of [['class', 'st-string'], ['viewBox', '0 0 100 100'], ['preserveAspectRatio', 'none'], ['aria-hidden', 'true']]) svg.setAttribute(k, v);
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', 'M50 0C83 35 23 65 57 100');
  path.setAttribute('vector-effect', 'non-scaling-stroke');
  svg.append(path);
  return svg;
}

/** @type {(j: number, n: number, step?: number) => number} the j-th of n entering in order, ms: at most 40 apart, the last by 0.3 s (the ten-frame's stagger) */
const stagger = (j, n, step = 40) => Math.round(j * Math.min(step, 300 / Math.max(1, n - 1)));
/**
 * The story's beat (design 6.10, decisions.md 2026-11-03): in the event what comes or goes moves one by
 * one, each this many ms after the one before it, so a child sees each balloon come or go.
 */
export const BEAT = 330;
/** @type {(n: number) => string} a number for a CSS variable, without float noise */
const num = (n) => String(Math.round(n * 1e4) / 1e4);
/** @type {(l: Len, k: number) => Len} */
const times = (l, k) => [l[0] * k, l[1] * k];

/**
 * Sets an attribute: removed for null or false, empty for true.
 * @param {Element} el @param {string} name @param {string | number | boolean | null | undefined} value
 * @returns {boolean} whether it changed
 */
function attr(el, name, value) {
  const was = el.getAttribute(name);
  const now = value === null || value === undefined || value === false ? null : value === true ? '' : String(value);
  if (was === now) return false;
  if (now === null) el.removeAttribute(name);
  else el.setAttribute(name, now);
  return true;
}

/** @type {(el: HTMLElement, name: string, l: Len) => void} a length as two variables: --<name>u and --<name>p */
const setLen = (el, name, l) => {
  el.style.setProperty(`--${name}u`, num(l[0]));
  el.style.setProperty(`--${name}p`, num(l[1]));
};

/** @type {(el: HTMLElement, u: number) => { x: number, y: number, h: number }} a node's middle and height at a unit of u px, from its variables */
const at = (el, u) => {
  const v = (/** @type {string} */ name) => parseFloat(el.style.getPropertyValue(`--${name}u`)) * u + parseFloat(el.style.getPropertyValue(`--${name}p`));
  return { x: v('x') + v('w') / 2, y: v('y') + v('h') / 2, h: v('h') };
};
/** @type {(a: HTMLElement, b: HTMLElement) => boolean} a reads before b (R7): the line above, else further left on the same line */
const readsBefore = (a, b) => {
  const [p, q] = [at(a, 40), at(b, 40)];
  return Math.abs(p.y - q.y) > Math.min(p.h, q.h) / 2 ? p.y < q.y : p.x < q.x;
};

/**
 * Draws a layout into host (condition 6: host and data only, role tokens only): the stage (the
 * host's content box, a size container), the drawing centred in it, its layers, and a node per
 * mark. Called again with another layout of the same round, it keeps the node of each mark whose
 * id stays, sets its box and attributes, adds the new ones and hands back the ones that went,
 * still in the page: the caller lifts, fades or removes them.
 * @param {HTMLElement} host the panel or a thumb
 * @param {{ layout: Layout, set: typeof ROUND | typeof THUMB, cover: (mark?: string) => HTMLElement }} data
 * @returns {Drawn}
 */
export function drawScene(host, { layout, set, cover: make }) {
  let draw = /** @type {HTMLElement | null} */ (host.querySelector(':scope > .st-stage > .st-draw'));
  if (!draw) {
    const stage = document.createElement('div');
    stage.className = 'st-stage';
    stage.dir = 'ltr';
    stage.dataset.math = '';
    draw = document.createElement('div');
    draw.className = 'st-draw';
    for (const name of LAYERS) {
      const layer = document.createElement('div');
      layer.className = 'st-layer';
      layer.dataset.layer = name;
      draw.append(layer);
    }
    // Strokes and fonts from the set (design 6.10): the line, a thin edge (chips, dashes on a
    // cover), a balloon's string (2px, a whole pixel, so every string draws alike); digits on
    // objects, a floor in rounds and none in thumbs.
    setLen(draw, 'l', set.line);
    setLen(draw, 't', times(set.line, 2 / 3));
    setLen(draw, 's', times(set.line, 2 / 3));
    setLen(draw, 'cf', set.chipFont);
    draw.style.setProperty('--fk', num(set.font.k));
    draw.style.setProperty('--fmin', num(set.font.min));
    draw.style.setProperty('--umax', num(set.uMax));
    draw.style.setProperty('--tap', num(PX.tap));
    draw.style.setProperty('--tap-edge', num(PX.tapEdge));
    stage.append(draw);
    host.append(stage);
  }
  setLen(draw, 'dw', layout.dw);
  setLen(draw, 'dh', layout.dh);
  const layers = Object.fromEntries([...draw.children].map((l) => [/** @type {HTMLElement} */ (l).dataset.layer, l]));
  const old = new Map([...draw.querySelectorAll('[data-id]')].map((el) => [/** @type {HTMLElement} */ (el).dataset.id, /** @type {HTMLElement} */ (el)]));
  const byId = new Map(layout.marks.map((m) => [m.id, m]));
  /** The places a digit stands on: a balloon there hides its shine under the digit's white circle. */
  const digits = new Set(layout.marks.filter((m) => m.kind === 'digit').map((m) => m.place));
  /** @type {Placed[]} */
  const added = [];
  /** @type {Placed[]} */
  const kept = [];
  for (const m of layout.marks) {
    if (m.kind === 'qmark') continue;
    let el = old.get(m.id);
    const fresh = !el;
    if (fresh) {
      el = document.createElement('span');
      el.className = `st-mark ${CLASS[m.kind]}`;
      el.dataset.id = m.id;
      const tap = tapOf(m);
      if (tap) el.dataset.tap = tap;
      if (DOMES.includes(m.kind)) el.append(make(m.mark ?? '?'));
      // A node keeps its shape: a dot that was a balloon is a node of its own (the morph).
      if (m.kind === 'object' && m.shape === 'balloon') el.append(balloonString());
    }
    old.delete(m.id);
    const changed = paint(el, m, byId, digits);
    if (fresh) {
      layers[m.layer].append(el);
      added.push({ el, m, changed });
    } else kept.push({ el, m, changed });
    // A leaver is drawn under what stays, so one that rises past another passes behind it; a dot of
    // the morph under the balloon it was, which fades over it, shine and string too.
    if ((m.leaving || (fresh && m.morph)) && layers[m.layer].firstChild !== el) layers[m.layer].prepend(el);
  }
  const gone = [...old.values()];
  for (const el of gone) delete el.dataset.id;
  // Text in reading order (R7): the chips and the digits, top line first, left to right on a line.
  // A chip that moves (the whole's, as the dome lifts) may change its place in that order.
  for (const name of ['chips', 'digits']) {
    const live = /** @type {HTMLElement[]} */ ([...layers[name].children].filter((n) => n instanceof HTMLElement && n.dataset.id));
    const sorted = [...live].sort((a, b) => (readsBefore(a, b) ? -1 : readsBefore(b, a) ? 1 : 0));
    if (sorted.some((n, i) => n !== live[i])) layers[name].append(...sorted);
  }
  return { draw, added, kept, gone };
}

/**
 * A mark's box and attributes on its node. Colours come from the role (data-role, data-second) or
 * a tone; game.css draws each kind.
 * @param {HTMLElement} el
 * @param {Mark} m
 * @param {Map<string, Mark>} byId
 * @param {Set<number>} digits the places a digit stands on
 * @returns {Set<string>} the attributes that changed on it
 */
function paint(el, m, byId, digits) {
  const { x, y, w, h } = m.box;
  setLen(el, 'x', x);
  setLen(el, 'y', y);
  setLen(el, 'w', w);
  setLen(el, 'h', h);
  /** @type {Set<string>} */
  const changed = new Set();
  const set = (/** @type {string} */ name, /** @type {any} */ value) => { if (attr(el, `data-${name}`, value)) changed.add(name); };
  // An arrival's start, a flown leaver's end: a length and a share of the stage (scene.js Offset).
  for (const [key, off] of /** @type {const} */ ([['f', m.from], ['t', m.to]])) {
    if (!off) continue;
    setLen(el, `${key}x`, off.x);
    setLen(el, `${key}y`, off.y);
    el.style.setProperty(`--${key}sx`, num(off.stage[0]));
    el.style.setProperty(`--${key}sy`, num(off.stage[1]));
  }
  // A dot that comes in from its balloon's or ball's disc (the morph): that disc's middle and size.
  if (m.morph) {
    setLen(el, 'my', m.morph.dy);
    el.style.setProperty('--mk', num(m.morph.k));
  }
  if (SHAPED.includes(m.kind)) set('shape', m.shape ?? null);
  if (m.kind === 'object' || m.kind === 'outline') {
    set('role', m.role);
    set('digit', m.kind === 'object' && digits.has(m.place));
    set('second', Boolean(m.second));
    set('faded', Boolean(m.faded));
    set('leaving', m.leaving ?? null);
  } else if (m.kind === 'ring') set('dash', Boolean(m.dash));
  else if (m.kind === 'ghost') set('inset', Boolean(m.inset));
  else if (m.kind === 'line') {
    set('tone', m.role);
    set('group', m.group);
  } else if (m.kind === 'halo') {
    // A dome's or a cover piece's halo has its shape; a bridge's is plain.
    const of = byId.get(m.of);
    set('shape', of && (of.kind !== 'cover' || of.piece) ? 'dome' : null);
  } else if (m.kind === 'arc') set('half', m.half);
  else if (m.kind === 'cover') el.classList.toggle('is-bridge', !m.piece);
  else if (m.kind === 'chip' || m.kind === 'digit') {
    set('tone', m.tone);
    set('ring', Boolean(m.ring));
    // The tour's digits (R5, architecture 2.5 step 4): the last one the answer. A digit's font from
    // its disc: a balloon's is smaller than a dot's (scene.js).
    set('tour', m.kind === 'digit' && m.tone === 'unknown' ? m.text : null);
    set('on', m.kind === 'digit' && m.on === 'balloon' ? 'balloon' : null);
    if (m.kind === 'digit') el.style.setProperty('--fk', num(m.font.k));
    if (el.textContent !== m.text) el.textContent = m.text;
    el.classList.toggle('is-grow', Boolean(m.grow));
    el.classList.toggle('is-two', m.text.length > 1);
  }
  if (DOMES.includes(m.kind) && m.mark !== undefined) {
    const lid = /** @type {HTMLElement} */ (el.firstElementChild);
    if (lid.dataset.mark !== m.mark) {
      lid.dataset.mark = m.mark;
      changed.add('mark');
    }
  }
  return changed;
}

/**
 * The game's render (architecture 2.4): the event from the mount, under [data-event], building the
 * equation row with it; a miss's display, the hint and the tour; the closing; the demo. A thumb,
 * with reduced motion, is the end state at once.
 * @param {HTMLElement} host
 * @param {Round} round
 * @param {RenderContext} ctx
 * @returns {RoundView}
 */
export function renderScene(host, round, ctx) {
  const { signal, mode } = ctx;
  const thumb = mode === 'thumb';
  const set = thumb ? THUMB : ROUND;
  const { kind, s, k, r } = storyOf(round);
  /** @type {State} */
  let st = { phase: 'rest', display: null, hint: false, tour: 0, solved: thumb && ctx.solved };
  /** @type {HTMLElement} */
  let draw;
  /** Nodes on their way out (faded, lifted): removed once their motion ends. */
  /** @type {HTMLElement[]} */
  const exiting = [];
  const sweep = () => { if (!signal.aborted) for (const el of exiting.splice(0)) el.remove(); };
  /** While a display runs, and once solved, a touch leaves no mark (as the cards, design 7.1). */
  let [busy, solved] = [false, false];
  /** @type {(id: string) => HTMLElement | null} */
  const node = (id) => draw.querySelector(`[data-id="${id}"]`);
  /** @type {(el: HTMLElement | null, anim: string, delay?: number) => void} */
  const play = (el, anim, delay = 0) => {
    if (!el) return;
    el.dataset.anim = anim;
    el.style.animationDelay = delay ? `${delay}ms` : '';
  };
  /** @type {(group: string) => HTMLElement[]} a line's pieces */
  const pieces = (group) => [...draw.querySelectorAll(`.st-line[data-id][data-group="${group}"]`)].map((el) => /** @type {HTMLElement} */ (el));
  /** @type {(a: Placed, b: Placed) => number} */
  const byPlace = (a, b) => (a.m.place ?? 0) - (b.m.place ?? 0);

  /**
   * Moves the picture to a state (scene.js planScene, layoutScene): what stays keeps its node, what
   * comes enters (how), what goes lifts or fades; at once with reduced motion, in thumbs and on a reset.
   * @param {State} next
   * @param {'instant' | 'enter' | 'event' | 'display' | 'hint' | 'return' | 'tour' | 'solve'} how
   */
  const apply = (next, how) => {
    const instant = how === 'instant' || thumb || reduced();
    const prev = st;
    st = next;
    const { phase, display, hint, tour } = next;
    const plan = planScene(round, phase === 'rest' ? { display: display?.display ?? null, rule: display?.rule ?? null, value: display?.value ?? 0, hint, tour, solved: next.solved } : phase);
    // The motion of the last state ends: its marks keep their place and lose their animation.
    if (draw) {
      for (const el of /** @type {NodeListOf<HTMLElement>} */ (draw.querySelectorAll('[data-id][data-anim]'))) {
        for (const a of el.getAnimations({ subtree: true })) a.finish();
        delete el.dataset.anim;
        el.style.animationDelay = '';
      }
      // The 'before' still (a hold on the objects' layer) ends with its state too.
      for (const el of /** @type {NodeListOf<HTMLElement>} */ (draw.querySelectorAll('.st-layer[data-anim]'))) {
        for (const a of el.getAnimations()) a.finish();
        delete el.dataset.anim;
        el.style.animationDelay = '';
      }
      draw.classList.toggle('is-instant', instant);
    }
    const drawn = drawScene(host, { layout: layoutScene(plan, set), set, cover });
    draw = drawn.draw;
    attr(draw, 'data-display', display?.display ?? null);
    attr(draw, 'data-hint', hint);
    // The tour shows what was under the cover (design 7.3), with motion or without.
    if (tour) for (const el of draw.querySelectorAll('.st-obj[data-role="unknown"]')) el.classList.add('is-shown');
    if (instant) {
      for (const el of drawn.gone) el.remove();
      // The drawing's size jumps too (no transition while is-instant), then transitions again.
      void draw.offsetWidth;
      draw.classList.remove('is-instant');
      return;
    }
    animate(drawn, prev, how);
  };

  /**
   * The motion of a change of state (design 6.10, 7.1-7.3, 8): each kind enters its way, with the
   * first picture's, the event's, the display's, the hint's and the closing's own order.
   * @param {Drawn} drawn
   * @param {State} prev
   * @param {string} how
   */
  const animate = ({ added, kept, gone }, prev, how) => {
    // Lines: a new one draws; one that re-wraps (the whole's, as the dome lifts) jumps.
    const had = new Set([...kept.filter((p) => p.m.kind === 'line').map((p) => p.m.group), ...gone.map((el) => el.dataset.group)]);
    for (const { el, m } of added) {
      const enter = m.kind === 'line' ? (had.has(m.group) ? null : 'in')
        : m.from ? 'from'
          : DOMES.includes(m.kind) ? 'drop'
            : m.kind === 'ring' ? (m.dash ? 'in' : 'ring')
              : m.kind === 'coverPlace' ? 'ring'
                : m.kind === 'digit' ? 'digit' : 'in';
      if (enter) play(el, enter);
    }
    for (const el of gone) {
      // A flown leaver is gone already; a cover lifts (app.css); a line that re-wraps goes at once.
      const lid = el.querySelector(':scope > .cover');
      if (el.dataset.leaving || (el.dataset.group && draw.querySelector(`.st-line[data-id][data-group="${el.dataset.group}"]`))) el.remove();
      else {
        if (lid) lid.classList.add('is-lifted');
        // In the event at the story's pace: a balloon fades over the dot it becomes (the morph).
        else play(el, how === 'event' ? 'fade' : 'out');
        exiting.push(el);
      }
    }
    // A chip that names the flashed number blinks once and keeps its ring (design 7.1).
    for (const { el, m, changed } of kept) {
      if (changed.has('ring') && m.ring) play(el, 'blink');
      if (changed.has('mark') && m.mark) play(el, 'q');
    }
    if (how === 'enter') {
      // The still 'before' (design 6.10): the start's objects enter in place order, as the ten-frame's
      // items do, and their chip with the last one; the rest of the first picture is there at once.
      // Then it holds still (decisions.md 2026-11-03): an animation of nothing on the objects' layer,
      // which starts with the last of the start, so the event's next phase waits for both: 'first
      // there were s' is seen a while before anything comes or goes.
      const objects = added.filter((p) => p.m.kind === 'object').sort(byPlace);
      objects.forEach((p, j) => play(p.el, 'in', stagger(j, objects.length)));
      const last = stagger(objects.length - 1, objects.length);
      for (const p of added.filter((q) => q.m.kind === 'chip')) play(p.el, 'in', last);
      play(/** @type {HTMLElement} */ (draw.querySelector('.st-layer[data-layer="objects"]')), 'hold', last);
      return;
    }
    if (how === 'event') {
      // The morph (levels 2, 5, 7; design 6.10): each dot starts under its balloon, on its disc, and
      // slides down and grows to its place while the balloon fades over it, so nothing grows as it goes
      // (a pop does). A ball is a dot's size already: the two cross-fade, so its seam fades too.
      for (const p of added.filter((q) => q.m.morph && (q.m.morph.k !== 1 || q.m.morph.dy.some(Boolean)))) play(p.el, 'morph');
      // Arrivals slide in, leavers fly up or pop, one by one in place order, a beat apart (decisions.md
      // 2026-11-03); each leaver's outline traces in as it goes.
      const arrivals = added.filter((p) => p.m.kind === 'object' && p.m.from).sort(byPlace);
      arrivals.forEach((p, j) => play(p.el, 'from', j * BEAT));
      const leavers = kept.filter((p) => p.changed.has('leaving') && p.m.leaving).sort(byPlace);
      leavers.forEach((p, j) => {
        play(p.el, p.m.leaving === 'up' ? 'fly' : 'pop', j * BEAT);
        play(node(`out-${p.m.place}`), 'trace', j * BEAT);
      });
    } else if (how === 'display') {
      // Ghosts and the dashed rings fill in order; digits are written one by one; what the value
      // does not reach, or passes, blinks once and keeps its ring at 250 ms, and not before the last
      // ghost or digit starts, so a ring never comes before its ghost (0.3 s at most, R10; design 7.1, 7.3).
      const fill = added.filter((p) => p.m.kind === 'ghost' || (p.m.kind === 'ring' && p.m.dash)).sort(byPlace);
      fill.forEach((p, j) => play(p.el, 'in', stagger(j, fill.length)));
      const digits = added.filter((p) => p.m.kind === 'digit');
      /** @type {Map<number, number>} each digit's delay by its place */
      const at = new Map(digits.map((p, j) => [p.m.place, stagger(j, digits.length, 120)]));
      digits.forEach((p) => play(p.el, 'digit', at.get(p.m.place)));
      // A jump comes with the digit it lands on: the next place counting on, the one before counting back.
      for (const p of added.filter((q) => q.m.kind === 'arc')) {
        const from = Number(p.m.id.split('-')[1]);
        play(p.el, 'in', at.get(kind === 'take' ? from : from + 1) ?? 0);
      }
      const last = Math.max(stagger(fill.length - 1, fill.length), stagger(digits.length - 1, digits.length, 120));
      const late = fill.length || digits.length ? Math.min(300, Math.max(250, last)) : 0;
      for (const p of added.filter((q) => q.m.kind === 'ring' && !q.m.dash)) {
        play(p.el, 'ring', late);
        // The object or outline under it blinks; a ghost there is what the value adds.
        play(node(`obj-${p.m.place}`) ?? (node(`ghost-${p.m.place}`) ? null : node(`out-${p.m.place}`)), 'blink', late);
      }
    } else if (how === 'hint' || how === 'return') {
      // Step 2 (design 7.3): the start's chip over its first object, and the start pulses once; in
      // take the outlines grey (game.css) and the wrap pulses; on level 3 the stretched cover's
      // dashed places (drawn as it comes down).
      if (!prev.hint && (kind === 'add' || kind === 'basket')) for (let p = 0; p < s; p++) play(node(`obj-${p}`), 'pulse');
      if (!prev.hint && kind === 'take') pieces('wrap').forEach((el) => play(el, 'pulse'));
    } else if (how === 'tour') {
      // What the cover hid comes in, in fill order, as the tour starts; the ring after the last digit.
      const shown = added.filter((p) => p.m.kind === 'object').sort(byPlace);
      shown.forEach((p, j) => play(p.el, 'in', stagger(j, shown.length)));
      for (const p of added.filter((q) => q.m.group === 'tour-ring')) play(p.el, 'ring', 150);
    } else if (how === 'solve') {
      // The closing (design 6.9, 6.10): the dome lifts; the answer's chip, or what was under the cover, in fill order.
      const shown = added.filter((p) => p.m.kind === 'object').sort(byPlace);
      shown.forEach((p, j) => play(p.el, 'in', stagger(j, shown.length)));
    }
  };

  // ---------- The event (design 6.10): the story first, then its '?'; the row built with it ----------
  const phases = phasesOf(round);
  let ended = true;
  /** @type {Promise<void>} */
  let story = Promise.resolve();
  /** The counted things are targets once the story is told (design 6.3, 6.10): in play, and for the demo's hand (R9). */
  const targets = () => {
    if (thumb) return;
    for (const el of /** @type {NodeListOf<HTMLElement>} */ (draw.querySelectorAll('[data-id]:is(.st-obj, .st-outline):not([data-role="unknown"], [data-marked])'))) el.dataset.target = '';
  };
  const end = () => {
    ended = true;
    sweep();
    draw.removeAttribute('data-event');
    ctx.build(null);
    targets();
  };
  /** A tap during the event (architecture 2.4): every motion to its end, every token built, [data-event] gone. */
  const finishEvent = () => {
    if (ended) return;
    for (const a of draw.getAnimations({ subtree: true })) a.finish();
    apply({ ...st, phase: 'rest' }, 'instant');
    end();
  };
  if (thumb) apply(st, 'instant');
  else if (reduced() || phases.length < 3) {
    // Nothing moves (the basket without the morph has no event), or reduced motion: the end at once.
    apply(st, 'instant');
    ctx.build(null);
    targets();
  } else {
    ended = false;
    apply({ ...st, phase: phases[0] }, 'enter');
    draw.dataset.event = phases[0];
    ctx.build(builtAt(round, phases[0]));
    story = (async () => {
      for (const phase of phases.slice(1)) {
        await settle(draw, signal);
        if (ended || signal.aborted) return;
        sweep();
        apply({ ...st, phase }, 'event');
        draw.dataset.event = phase;
        ctx.build(builtAt(round, phase));
      }
      await settle(draw, signal);
      if (!ended && !signal.aborted) end();
    })();
  }

  /**
   * A touch on a counted thing, in play and from the demo's hand: one ink dot; it is no longer a target, so a
   * second touch does nothing and play logs it.
   * @param {HTMLElement} target
   */
  const touch = (target) => {
    if ('marked' in target.dataset) return;
    target.dataset.marked = '';
    delete target.dataset.target;
    const dot = document.createElement('span');
    dot.className = 'st-touch';
    target.append(dot);
  };
  if (mode === 'play') {
    host.addEventListener('click', (e) => {
      const target = e.target instanceof Element ? e.target.closest('[data-target]') : null;
      if (target instanceof HTMLElement && !busy && !solved) touch(target);
    }, { signal });
  }

  /** Step 3 (R5, design 7.2): digits 150 ms each, the last the answer, then the ring: on level 3 its own, else the wrap or the bracket pulses. */
  const tour = async () => {
    const n = kind === 'take' ? r : k;
    for (let j = 1; j <= n && !signal.aborted; j++) {
      apply({ ...st, tour: j }, 'tour');
      await settle(draw, signal);
      sweep();
    }
    if (signal.aborted || kind === 'change') return;
    pieces(kind === 'basket' ? 'bracket' : 'wrap').forEach((el) => play(el, 'pulse'));
    await settle(draw, signal);
  };

  /**
   * A miss (architecture 2.5 step 4): its display; from step 2 the hint; at step 3 the tour.
   * @param {Miss} choice
   */
  const missed = async ({ value, rule, display, step, first }) => {
    // The previous display goes at once; the new one runs (R5, design 7.2).
    const base = { ...st, display: null, tour: 0 };
    if (st.display) apply(base, 'instant');
    // A first miss keeps its display to the next tap (on a 3-option level, none since 2026-10-31, the hint joins it); a later
    // one runs, then the picture comes back to its start, cover down, with the hint drawn as it does.
    // With reduced motion a later display is skipped. On level 3 a display that lifts the dome shows
    // the places under it, so the answer: a first miss's runs and comes back too, the dome down and no
    // hint; and at step 3 any display goes straight to the tour, the dome staying up (decisions.md
    // 2026-10-31), so the cover never comes down between two lifts.
    const lifts = kind === 'change' && display !== 'flash';
    if (first || !reduced()) {
      apply({ ...base, display: { display, rule, value } }, 'display');
      await settle(draw, signal);
      if (signal.aborted) return;
      sweep();
      if (first && !lifts) {
        if (step >= 2) apply({ ...st, hint: true }, 'hint');
        return;
      }
      if (kind === 'change' && step === 3) {
        st = { ...base, hint: true };
        await tour();
        return;
      }
      apply({ ...base, hint: !first || step >= 2 }, 'return');
      // The cards lock only while a display runs (design 7.1): at step 2 the return is not awaited.
      const back = settle(draw, signal).then(sweep);
      if (step < 3) return;
      await back;
    } else apply({ ...base, hint: true }, 'instant');
    if (step === 3 && !signal.aborted) await tour();
  };

  return {
    async miss(choice) {
      // A display the scene has no drawing for throws before the picture changes (architecture 2.1).
      if (!DISPLAYS.includes(choice.display)) throw new Error(`stories: no drawing for ${choice.display}`);
      finishEvent();
      busy = true;
      await missed(choice);
      busy = false;
    },
    async solve() {
      finishEvent();
      [busy, solved] = [true, true];
      if (st.display) apply({ ...st, display: null }, 'instant');
      apply({ ...st, solved: true }, 'solve');
      await settle(draw, signal);
      sweep();
    },
    async demo(hand) {
      // The demo shows the story as the child would see it, then the hand touches the first object of
      // each known number, in reading order (R7): the start, then what came or what left (its first
      // outline), or the basket's two parts; on level 3 the start alone, as the whole's outline and
      // the chips take no touch. Each tap is a touch, as in play (design 6.3). Then the hint and the
      // tour (R9, the ten-frame's pattern).
      await story;
      for (const id of ['obj-0', kind === 'take' ? `out-${r}` : kind === 'change' ? null : `obj-${s}`]) {
        const el = signal.aborted || !id ? null : node(id);
        if (!el) continue;
        await hand.tap(el);
        if (!signal.aborted) touch(el);
      }
      // The hand steps off the picture: on the cover it would hide the tour's digits under it.
      if (!signal.aborted) await hand.rest();
      if (signal.aborted) return;
      apply({ ...st, hint: true }, 'hint');
      await settle(draw, signal);
      sweep();
      if (!signal.aborted) await tour();
    },
  };
}
