// The story scene (design 6.10, architecture 2.8): the stories' only geometry. Pure, and it imports
// nothing, so it can move to lib/ unchanged (the cover maker comes in data, as in the balance).
// planScene says what each place and the picture hold in one state, in places; layoutScene puts
// every mark in a box whose coordinates, sizes and strokes are lengths [a, b] = a·u + b px, so a Node
// test checks every clearance at every u, and the browser draws the same numbers (--u from the stage).

/** @typedef {[number, number]} Len a length: a·u + b px */
/** @typedef {{ x: Len, y: Len, w: Len, h: Len }} Box */
/** @typedef {{ t: Len, b: Len, l: Len, r: Len }} Slab a band of a region: top, bottom, left, right */
/**
 * What a state draws, in places (planScene): every item has an id (stable across states) and a kind;
 * last, the last place it fills; cols, the columns the round's pictures use (round.stage.cols).
 * @typedef {{ kind: string, s: number, k: number, r: number, n: number, rows: number, last: number, cols: number, object: string, items: Record<string, any>[], leaving: Record<string, any>[] }} Plan
 */
/**
 * A move's start (from) or end (to), added to the mark's box: x and y, and a share of the stage's
 * content box [of its width, of its height] (CSS: stage[0] * 100cqw). The drawing is centred in the
 * stage and fills it only on the axis that limits u, so a move measured from the drawing alone
 * could start or end inside the panel; measured from the stage, it starts and ends past the panel's clip.
 * @typedef {{ x: Len, y: Len, stage: [number, number] }} Offset
 */
/** @typedef {{ id: string, kind: string, layer: string, box: Box, [key: string]: any }} Mark a drawn mark (layoutScene) */
/** @typedef {{ dw: Len, dh: Len, n: number, rows: number, marks: Mark[] }} Layout */

/**
 * Pixel tokens of the round (design 6.6, 6.10, 7.1): app.css --ring is the line; the digit floor;
 * out, the panel's largest padding (app.css .panel), so a move past the stage's edge by it is clipped.
 */
export const PX = {
  line: 3, ringGap: 2, track1: 8, halo: 3, tick: 4, bracketGap: 6, dome: 28, bridge: 4,
  chipGap: 6, chipPad: 6, arc: 5, out: 16, hug: 17, digit: { k: 0.45, min: 14 }, tap: 8, tapEdge: 2,
};

/**
 * Rubik 800 (design 4, 6.10; measured in Chromium): the tabular advance of a chip's digits (em), and
 * the ink of the proportional digits on objects at 14px (w, h): one digit at most (4 the widest, 0
 * and 8 the tallest), 10 and 11. pad: game.css's top padding (em) on chips and digits, which keeps
 * their ink within 1px of the box's middle at every size a round uses, 14 to 29px (measured
 * 2026-10-31; 0.12em was 1.5 to 2.4px low from 20px up); the Node test takes the ink as centred,
 * and the browser check reads it. balloon: a balloon's disc to a dot's, which sizes its digits.
 */
export const GLYPH = { advance: 0.68, ink: 0.72, pad: 0.02, balloon: 0.78, ink14: { digit: [9.2, 10.1], 10: [16.3, 10.1], 11: [13.7, 9.8] } };

const px = (/** @type {number} */ b) => /** @type {Len} */ ([0, b]);
const LINE = PX.track1 + PX.line;

/**
 * The round's lengths. The top band holds what stands over the first row: the wrap's small dome and
 * its halo (add, take), the bracket and its dome over the basket's rim, or at level 3 the whole's
 * chip standing on its outline over the dome's rise (0.25u). Bands between rows hold a track-1 line
 * and a ring (0.1u + 17px), or only rings between display rows (0.1u + 11px; decisions.md 2026-10-30).
 */
export const ROUND = {
  G: /** @type {Len} */ ([0.1, 16]), Ms: /** @type {Len} */ ([0.05, 12]), B: /** @type {Len} */ ([0.25, 18]),
  Bh: /** @type {Len} */ ([0.1, 17]), Bd: /** @type {Len} */ ([0.1, 11]), Mb: /** @type {Len} */ ([0.05, 12]), Mbd: /** @type {Len} */ ([0.05, 6]),
  T: {
    add: px(LINE + PX.dome + PX.halo), take: px(LINE + PX.dome + PX.halo),
    basket: px(LINE + PX.bracketGap + PX.line + PX.dome + PX.halo), change: /** @type {Len} */ ([0.25 + 0.15, LINE + 18]),
  },
  line: px(PX.line), ringGap: px(PX.ringGap), track1: px(PX.track1), halo: px(PX.halo), tick: px(PX.tick), bracketGap: px(PX.bracketGap),
  dome: px(PX.dome), bridge: px(PX.bridge), strip: /** @type {Len} */ ([0.125, 2]),
  chipH: /** @type {Len} */ ([0.15, 18]), chipFont: /** @type {Len} */ ([0.15, 12]), chipPad: px(PX.chipPad), chipGap: px(PX.chipGap),
  arc: px(PX.arc), out: px(PX.out), hug: px(PX.hug), font: PX.digit, uMax: 64,
};

const unit = (/** @type {number} */ a) => /** @type {Len} */ ([a, 0]);

/** A thumb (design 6.10): the same layout in units only, chips and domes too; no text floor. At rest or solved. */
export const THUMB = {
  G: unit(0.4), Ms: unit(0.35), B: unit(0.6), Bh: unit(0.4), Bd: unit(0.3), Mb: unit(0.35), Mbd: unit(0.3),
  T: { add: unit(1), take: unit(1), basket: unit(1.3), change: unit(1.15) },
  line: unit(0.1), ringGap: unit(0.06), track1: unit(0.2), halo: unit(0.1), tick: unit(0.1), bracketGap: unit(0.2),
  dome: unit(0.6), bridge: unit(0.15), strip: unit(0.1),
  chipH: unit(0.6), chipFont: unit(0.45), chipPad: unit(0.15), chipGap: unit(0.15),
  arc: unit(0.3), out: unit(0.5), hug: null, font: { k: 0.45, min: 0 }, uMax: 64,
};

/** The roles' colour tokens (R6, design 3): a second part is the part's light shade. */
export const ROLE_TOKEN = {
  part: '--role-part', second: '--role-part-2', added: '--role-added', removed: '--role-removed', unknown: '--role-unknown', whole: '--role-whole',
};

/** The event's phases, in order; 'rest' is the end of the event (design 6.10). */
const PHASES = ['event:0', 'event:M', 'event:B', 'event:B2', 'rest'];

// ---------- Lengths ----------

const U = /** @type {Len} */ ([1, 0]);
/** @type {(...ls: Len[]) => Len} */
const add = (...ls) => [ls.reduce((a, l) => a + l[0], 0), ls.reduce((b, l) => b + l[1], 0)];
/** @type {(a: Len, b: Len) => Len} */
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
/** @type {(l: Len, k: number) => Len} */
const mul = (l, k) => [l[0] * k, l[1] * k];
/** @type {(l: Len, u: number) => number} a length's pixels at a unit of u px */
export const len = (l, u) => l[0] * u + l[1];
/** @type {(x: Len, y: Len, w: Len, h: Len) => Box} */
const box = (x, y, w, h) => ({ x, y, w, h });
/** @type {(x0: Len, y0: Len, x1: Len, y1: Len) => Box} */
const span = (x0, y0, x1, y1) => box(x0, y0, sub(x1, x0), sub(y1, y0));
/** @type {(b: Box, d: Len) => Box} */
const grow = (b, d) => box(sub(b.x, d), sub(b.y, d), add(b.w, mul(d, 2)), add(b.h, mul(d, 2)));
/** @type {(b: Box) => Len} */
const right = (b) => add(b.x, b.w);
/** @type {(b: Box) => Len} */
const bottom = (b) => add(b.y, b.h);
/** @type {(b: Box) => Len} */
const midX = (b) => add(b.x, mul(b.w, 0.5));
/** @type {(b: Box) => Len} */
const midY = (b) => add(b.y, mul(b.h, 0.5));

/**
 * The order of two lengths over the round's units (14-64px), the same at both ends and between them:
 * a layout's shape never changes with u.
 * @type {(a: Len, b: Len) => number}
 */
function cmp(a, b) {
  const d = [14, 39, 64].map((u) => len(a, u) - len(b, u));
  if (d.every((x) => Math.abs(x) < 1e-9)) return 0;
  const sign = Math.sign(d[0]);
  if (!sign || d.some((x) => Math.sign(x) !== sign)) throw new Error(`scene: ${a} and ${b} change order with u`);
  return sign;
}

/**
 * A line round a region (design 6.10): the region is a stack of slabs, each one interval wide, each
 * overlapping the next; the line stands g off it and is t thick, as axis-aligned boxes: a cap above
 * and below, a side per run of equal edges, and a step where the region narrows.
 * @param {Slab[]} slabs top to bottom
 * @param {Len} g
 * @param {Len} t
 * @returns {Box[]}
 */
export function outline(slabs, g, t) {
  const gt = add(g, t);
  const [first, last] = [slabs[0], slabs[slabs.length - 1]];
  const out = [span(sub(first.l, gt), sub(first.t, gt), add(first.r, gt), sub(first.t, g)), span(sub(last.l, gt), add(last.b, g), add(last.r, gt), add(last.b, gt))];
  for (const side of /** @type {const} */ (['l', 'r'])) {
    const dir = side === 'l' ? -1 : 1;
    /** @type {(x: Len, y0: Len, y1: Len) => Box} the side's box beside edge x */
    const along = (x, y0, y1) => (dir < 0 ? span(sub(x, gt), y0, sub(x, g), y1) : span(add(x, g), y0, add(x, gt), y1));
    let from = sub(first.t, g);
    for (let i = 0; i < slabs.length - 1; i++) {
      const [slab, next] = [slabs[i], slabs[i + 1]];
      // c < 0: the upper slab is wider, the step runs under it; c > 0: the lower one, over it.
      const c = cmp(next[side], slab[side]) * dir;
      if (c === 0) continue;
      const [narrow, wide] = c < 0 ? [next[side], slab[side]] : [slab[side], next[side]];
      const [y0, y1] = c < 0 ? [add(slab.b, g), add(slab.b, gt)] : [sub(slab.b, gt), sub(slab.b, g)];
      out.push(dir < 0 ? span(sub(wide, gt), y0, sub(narrow, g), y1) : span(add(narrow, g), y0, add(wide, gt), y1));
      out.push(along(slab[side], from, y0));
      from = y1;
    }
    out.push(along(last[side], from, add(last.b, g)));
  }
  return out;
}

// ---------- The plan ----------

/**
 * The story's numbers and drawing: kind add (result), change (add, the change unknown), take
 * (result) or basket (part-whole, the whole unknown); n story rows (the start of take, else the
 * result or whole; level 3 holds the rows of r from the mount); the objects, and what they were before
 * the morph.
 * @param {any} round
 */
export function storyOf(round) {
  const { s, k, r, verb } = round.story;
  const kind = round.structure === 'part-whole' ? 'basket' : round.structure === 'change-take' ? 'take' : round.unknown === 'change' ? 'change' : 'add';
  const thing = kind === 'basket' ? 'ball' : 'balloon';
  return {
    kind, s, k, r, verb, n: Math.ceil((kind === 'take' ? s : r) / 5),
    object: round.look === 'objects' ? thing : 'dot', pre: round.stage?.morph ? thing : null, wrap: round.stage?.wrap ?? 'rest',
  };
}

/**
 * Where level 3's fixed dome stands (design 6.10): after the last dot in its row while two places
 * are free there, else at the next row's start. A place number.
 * @type {(s: number) => number}
 */
export const lidAt = (s) => (s % 5 <= 3 ? s : 5 * Math.ceil(s / 5));

/** @type {(round: any) => string[]} the event's phases, 'rest' last (design 6.10); the basket has none but the morph */
export function phasesOf(round) {
  const { kind, pre } = storyOf(round);
  return PHASES.filter((p) => p === 'event:0' || p === 'rest' || (p === 'event:M' && pre) || (p === 'event:B' && kind !== 'basket') || (p === 'event:B2' && kind === 'change'));
}

/**
 * The tokens of the equation row shown at the end of a phase, by index in [...left, '=', ...right]
 * (ctx.build, design 6.10): the start, then its operator (and the change's number), then the '?',
 * then the rest; a reversed row grows from its right, and nothing moves. null: all of them.
 * @param {any} round
 * @param {string} phase
 * @returns {number[] | null}
 */
export function builtAt(round, phase) {
  const { kind } = storyOf(round);
  if (kind === 'basket' || phase === 'rest') return null;
  const at = round.equation.left.length === 1 ? 2 : 0;
  if (phase === 'event:B') return kind === 'change' ? [at, at + 1] : [at, at + 1, at + 2];
  return phase === 'event:B2' ? [at, at + 1, at + 2] : [at];
}

/**
 * A state, from a string ('event:0' ... 'rest', 'hint', 'solved') or an object { display, rule,
 * value, hint, tour, solved }.
 * @param {string | Record<string, any>} state
 */
function stateOf(state) {
  const st = typeof state === 'string' ? { phase: state } : state;
  const phase = PHASES.includes(st.phase) ? st.phase : 'rest';
  return {
    phase, display: st.display ?? null, rule: st.rule ?? null, value: st.value ?? 0,
    hint: Boolean(st.hint) || st.phase === 'hint', tour: st.tour ?? 0, solved: Boolean(st.solved) || st.phase === 'solved',
  };
}

/**
 * What the picture holds in one state (design 6.10, 7.3): the objects in rows of five from place 0
 * (R6: the start first, then what came, the leavers last), lines, covers, chips, rings, ghosts,
 * digits and arcs. Displays: { display, rule, value } (step 1); the hint and the tour (steps 2-3) come
 * back to the rest picture; on 3-option levels a display keeps its marks beside the hint.
 * @param {any} round
 * @param {string | Record<string, any>} state
 * @returns {Plan}
 */
export function planScene(round, state) {
  const st = stateOf(state);
  const { kind, s, k, r, n, object, pre, verb, wrap } = storyOf(round);
  const at = PHASES.indexOf(st.phase);
  const rest = at === PHASES.length - 1;
  /** @type {Record<string, any>[]} */
  const items = [];
  /** @type {Record<string, any>[]} */
  const leaving = [];
  let last = -1;
  /** @type {(item: Record<string, any>) => void} */
  const put = (item) => {
    items.push(item);
    if (typeof item.place === 'number') last = Math.max(last, item.place);
  };
  const shape = pre && at < 1 ? pre : object;
  // The morph's phase: each dot comes in from what it was (layoutScene's morph).
  const morph = pre && st.phase === 'event:M' ? pre : null;
  /** @type {(p: number, role: string, more?: Record<string, any>) => void} */
  const obj = (p, role, more = {}) => put({ id: `${shape === object ? 'obj' : 'pre'}-${p}`, kind: 'object', place: p, role, shape, ...(morph ? { morph } : {}), ...more });
  /** @type {(p: number, dash?: boolean) => void} */
  const ring = (p, dash = false) => put({ id: `ring-${p}`, kind: 'ring', place: p, dash });
  /** @type {(p: number) => void} a dashed empty place */
  const empty = (p) => put({ id: `place-${p}`, kind: 'place', place: p });
  /** @type {(p: number, text: number, tone: string, grow?: boolean) => void} */
  const digit = (p, text, tone, grow = false) => put({ id: `digit-${p}`, kind: 'digit', place: p, text: String(text), tone, grow });
  /** @type {(from: number, to: number) => void} */
  const arc = (from, to) => put({ id: `arc-${Math.min(from, to)}`, kind: 'arc', from, to });

  const shown = st.display !== null && st.display !== 'flash';
  const lifted = kind === 'change' && (shown || st.tour > 0 || st.solved);
  // The objects: the start, what came (add), what stayed and the leavers' outlines (take), the two
  // parts (basket), and level 3's unknown, drawn when revealed.
  if (kind === 'basket') for (let p = 0; p < r; p++) obj(p, 'part', p >= s ? { second: true } : {});
  else if (kind === 'take') {
    for (let p = 0; p < (at >= 2 ? r : s); p++) obj(p, 'part');
    if (at >= 2) for (let p = r; p < s; p++) put({ id: `out-${p}`, kind: 'outline', place: p, role: 'removed', hollow: true, faded: st.hint });
    if (at === 2) for (let p = r; p < s; p++) leaving.push({ id: `obj-${p}`, kind: 'object', place: p, role: 'part', shape, exit: verb === 'fly' ? 'up' : 'pop' });
  } else {
    for (let p = 0; p < s; p++) obj(p, 'part');
    if (kind === 'add' && at >= 2) for (let p = s; p < r; p++) obj(p, 'added', at === 2 ? { enter: 'right' } : {});
    if (kind === 'change' && lifted && !shown) for (let p = s; p < r; p++) put({ id: `obj-${p}`, kind: 'object', place: p, role: 'unknown', shape: object });
    if (kind === 'change' && shown) for (let p = s; p < r; p++) empty(p);
  }
  // The unknown's mark: the wrap and its small dome (add, take), the rim and the bracket (basket), the
  // fixed dome, then its '?', the whole's outline and chip (level 3); the hint's stretched cover. On
  // the mixed level the wrap comes with the hint, the tour or the closing: at rest the small dome
  // stands alone over the middle of the picture's first row (dome-top where that is not the wrap's).
  const wrapped = rest && (wrap !== 'hint' || st.hint || st.tour > 0 || st.solved);
  if ((kind === 'add' || kind === 'take') && wrapped) put({ id: 'wrap', kind: 'wrap', role: 'unknown', from: 0, to: r });
  if (kind === 'basket') {
    put({ id: 'rim', kind: 'rim' });
    put({ id: 'bracket', kind: 'bracket', role: 'unknown' });
  }
  const top = Math.min(kind === 'take' ? s : r, 5);
  const domeId = wrapped || top === Math.min(r, 5) ? 'dome' : 'dome-top';
  if (kind !== 'change' && (rest || kind === 'basket')) put(st.solved ? { id: 'answer', kind: 'chip', at: 'dome', text: String(round.answer), tone: 'unknown' } : { id: domeId, kind: 'dome', over: wrapped || kind === 'basket' ? 'line' : 'top' });
  if (kind === 'change') {
    put({ id: 'chip-start', kind: 'chip', at: 'start', text: String(s), tone: 'ink', ring: st.display === 'flash' && st.rule !== 'given.whole' });
    if (at >= 2 && !lifted && !st.hint) put({ id: 'lid', kind: 'lid', place: lidAt(s), mark: at >= 3 ? '?' : '', enter: at === 2 ? 'right' : null });
    if (rest && !lifted && st.hint) put({ id: 'cover', kind: 'cover', from: s, to: r });
    if (rest) {
      put({ id: 'whole', kind: 'whole', role: 'whole', lifted: lifted || st.hint });
      put({ id: 'chip-whole', kind: 'chip', at: 'whole', text: String(r), tone: 'whole', ring: st.display === 'flash' && st.rule === 'given.whole' });
    }
  }
  // Step 1: the display of the card (design 7.3). g0: where the asked group starts; it ends at r.
  const g0 = kind === 'change' ? s : 0;
  /** @type {(p: number) => string} */
  const content = (p) => (p < (kind === 'change' ? s : r) ? 'object' : kind === 'take' && p < s ? 'outline' : kind === 'change' && p < r ? 'unknown' : 'empty');
  const v = st.value;
  if (st.display === 'overflow') {
    for (let p = g0; p < g0 + v; p++) {
      if (content(p) === 'object') ring(p, true);
      else {
        // Past the group a ghost has a ring, but not inside the outline of one that left: the
        // outline marks that place already, and the two read as a bullseye (decisions.md 2026-10-31).
        put({ id: `ghost-${p}`, kind: 'ghost', place: p, inset: content(p) === 'outline' });
        if (p >= r && content(p) !== 'outline') ring(p);
      }
    }
    for (let p = g0 + v; p < r; p++) ring(p);
  } else if (st.display === 'flash' && kind !== 'change') {
    const [from, to] = kind === 'take' && st.rule === 'given.part' ? [r, s] : [0, s];
    for (let p = from; p < to; p++) ring(p);
  } else if (st.display === 'jumps') {
    // Counting on from the start's own last place (add); back from the last leaver (take); 1 on the
    // start's last place, on through the dome's places (level 3). The place it should not have counted, ringed.
    const steps = kind === 'take' ? Array.from({ length: k }, (_, j) => s - 1 - j) : Array.from({ length: kind === 'change' ? k + 1 : k }, (_, j) => s - 1 + j);
    steps.forEach((p, j) => {
      digit(p, kind === 'take' ? s - j : kind === 'change' ? j + 1 : s + j, 'added');
      if (j) arc(steps[j - 1], p);
    });
    ring(kind === 'take' ? r : kind === 'change' ? s - 1 : r - 1);
  } else if (st.display === 'count-up') {
    for (let j = 1; j <= v; j++) {
      const p = g0 + j - 1;
      digit(p, j, 'added');
      if (p >= r && content(p) === 'empty') empty(p);
      if (p >= r) ring(p);
    }
    for (let p = g0 + v; p < r; p++) ring(p);
  }
  // Steps 2-3: the hint (the start's chip; the outlines grey; the stretched cover) and the tour, which
  // ends on the answer: counting on from the chip, or from 1 on what stayed and on the dome's places.
  if (st.hint && (kind === 'add' || kind === 'basket')) put({ id: 'chip-hint', kind: 'chip', at: 'hint', text: String(s), tone: 'ink' });
  if (st.tour > 0) {
    const from = kind === 'take' ? 0 : s;
    for (let j = 1; j <= st.tour; j++) digit(from + j - 1, kind === 'add' || kind === 'basket' ? s + j : j, 'unknown', j === st.tour && st.tour === (kind === 'take' ? r : k));
    if (kind === 'change' && st.tour === k) put({ id: 'tour-ring', kind: 'tourRing', role: 'unknown', from: s, to: r });
  }
  const rows = Math.max(n, Math.ceil((last + 1) / 5));
  return { kind, s, k, r, n, rows, last, cols: round.stage?.cols ?? 5, object, items, leaving };
}

/**
 * The rows a display needs (design 6.10): the story's, and the places it fills beyond them. The
 * budget says no above 4.
 * @param {any} round
 * @param {string} display
 * @param {number} value
 * @returns {number}
 */
export const rowsFor = (round, display, value) => planScene(round, { display, value }).rows;

// ---------- The layout ----------

/**
 * Every mark of a plan in its box (design 6.10): places in rows of five at Ms + c(u + G), story rows
 * B apart under the top band T, display rows Bh and Bd apart; track-0 rings 2px off a disc, track-1
 * lines (wrap, whole, rim) 8px off the objects (a balloon with its string), 3px thick. A round whose
 * pictures use fewer than five columns (plan.cols) is shifted right by half the columns it leaves,
 * so it stands in the middle of the drawing, the same in every state.
 * @param {Plan} plan
 * @param {typeof ROUND | typeof THUMB} set
 * @returns {Layout}
 */
export function layoutScene(plan, set) {
  const { kind, s, r, n, rows, object, items } = plan;
  const T = set.T[kind];
  const shift = (5 - plan.cols) / 2;
  const colX = (/** @type {number} */ c) => add(set.Ms, mul(add(U, set.G), c + shift));
  const rowY = (/** @type {number} */ i) => (i < n ? add(T, mul(add(U, set.B), i)) : add(T, mul(add(U, set.B), n - 1), U, set.Bh, mul(add(U, set.Bd), i - n)));
  const dw = add(mul(U, 5), mul(set.G, 4), mul(set.Ms, 2));
  const dh = add(rowY(rows - 1), U, rows > n ? set.Mbd : set.Mb);
  const cell = (/** @type {number} */ p) => box(colX(p % 5), rowY(Math.floor(p / 5)), U, U);
  /** @type {(p: number, shape?: string) => Box} the object's disc */
  const disc = (p, shape = object) => (shape === 'balloon' ? box(add(cell(p).x, [0.11, 0]), cell(p).y, [0.78, 0], [0.78, 0]) : cell(p));
  /** @type {(p: number) => Box} what an object takes: a balloon's disc and string */
  const extent = (p) => (object === 'balloon' ? { ...disc(p), h: /** @type {Len} */ ([0.98, 0]) } : cell(p));
  const half = mul(set.line, 0.5);
  /** @type {Mark[]} */
  const marks = [];
  /** @type {(id: string, kind: string, layer: string, b: Box, more?: Record<string, any>) => Mark} */
  const mark = (id, kind_, layer, b, more = {}) => {
    const m = { id, kind: kind_, layer, box: b, ...more };
    marks.push(m);
    return m;
  };
  /** @type {(id: string, b: Box) => Mark} */
  const halo = (id, b) => mark(`${id}-halo`, 'halo', 'halo', grow(b, set.halo), { of: id });
  /** @type {(id: string, role: string, boxes: Box[], layer?: string) => void} */
  const line = (id, role, boxes, layer = 'lines') => boxes.forEach((b, i) => mark(`${id}-${i}`, 'line', layer, b, { role, group: id }));
  // An arrival starts out past the stage's right edge, a flown leaver ends out past its top (Offset):
  // the drawing is centred in the stage, so from the drawing's middle the stage's edge is half the stage away.
  /** @type {(b: Box) => Offset} */
  const enter = (b) => ({ x: sub(add(mul(dw, 0.5), set.out), b.x), y: px(0), stage: [0.5, 0] });
  // A leaver of the second row drifts half a column to the right as it rises, so it passes between
  // the first row's places, under the ones that stay (view.js draws the leavers first), not through them.
  /** @type {(b: Box, row: number) => Offset} */
  const flyUp = (b, row) => ({ x: row ? mul(add(U, set.G), 0.5) : px(0), y: sub(mul(dh, 0.5), add(bottom(b), set.out)), stage: [0, -0.5] });

  // A run of places in row pieces: [{ row, c0, c1 }], and as slabs of a region, the band between two rows joined.
  /** @type {(from: number, to: number) => { row: number, c0: number, c1: number }[]} */
  const pieces = (from, to) => {
    const out = [];
    for (let p = from; p < to; p = 5 * (Math.floor(p / 5) + 1)) out.push({ row: Math.floor(p / 5), c0: p % 5, c1: Math.min(4, (to - 1) - 5 * Math.floor(p / 5)) });
    return out;
  };
  /** @type {(from: number, to: number, hug: Len | null) => Slab[]} a run from place 0 over its objects; hug: the band's line stands this far over the lower row */
  const runSlabs = (from, to, hug) => {
    const [a, b] = pieces(from, to);
    const e0 = extent(5 * a.row + a.c0);
    const top = { t: e0.y, b: bottom(extent(5 * a.row + a.c1)), l: e0.x, r: right(extent(5 * a.row + a.c1)) };
    if (!b) return [top];
    const low = extent(5 * b.row + b.c1);
    const split = hug ? sub(low.y, hug) : top.b;
    return [{ ...top, b: split }, { t: split, b: bottom(low), l: extent(5 * b.row).x, r: right(low) }];
  };

  // The small dome: on the wrap's top line, in the middle of the run's first row; over the basket, on
  // the bracket in the middle. Its halo goes under the lines, so the line it stands on stays whole.
  // Alone at rest on the mixed level: at the same height, over the middle of the picture's first row.
  const wrapTop = sub(extent(0).y, add(set.track1, set.line));
  const bracketTop = sub(wrapTop, add(set.bracketGap, set.line));
  /** @type {(over: string) => Len} */
  const domeMidOf = (over) => {
    if (kind === 'basket') return mul(dw, 0.5);
    const first = Math.min(over === 'top' && kind === 'take' ? s : r, 5);
    return mul(add(extent(0).x, right(extent(first - 1))), 0.5);
  };
  /** @type {(over: string) => Box} */
  const domeBoxOf = (over) => box(sub(domeMidOf(over), mul(set.dome, 0.5)), sub(kind === 'basket' ? bracketTop : wrapTop, set.dome), set.dome, set.dome);
  const domeMid = domeMidOf('line');
  const domeBox = domeBoxOf('line');
  /** @type {(text: string) => Len} a single digit's chip is square; two digits, their advance and the padding */
  const chipW = (text) => (text.length === 1 ? set.chipH : add(mul(set.chipFont, GLYPH.advance * text.length), mul(set.chipPad, 2)));
  // Level 3's whole outline: round the dots and the fixed dome at rest; round the true places once the dome lifts.
  const lid = lidAt(s);
  const lidBox = box(colX(lid % 5), sub(rowY(Math.floor(lid / 5)), mul(U, 0.25)), mul(U, 1.25), mul(U, 1.25));
  /** @type {(lifted: boolean) => Slab[]} */
  const wholeSlabs = (lifted) => {
    if (lifted) return runSlabs(0, r, set.hug);
    if (lid < 5) return [{ t: lidBox.y, b: cell(0).y, l: lidBox.x, r: right(lidBox) }, { t: cell(0).y, b: bottom(cell(0)), l: colX(0), r: right(lidBox) }];
    return [{ t: cell(0).y, b: bottom(cell(0)), l: colX(0), r: right(cell(Math.min(s, 5) - 1)) }, { t: bottom(cell(0)), b: bottom(lidBox), l: colX(0), r: right(lidBox) }];
  };

  for (const item of items) {
    const { id, place } = item;
    if (item.kind === 'object') {
      const b = item.shape === 'balloon' ? { ...disc(place, 'balloon'), h: /** @type {Len} */ ([0.98, 0]) } : disc(place, item.shape);
      const m = mark(id, 'object', 'objects', b, { place, role: item.role, shape: item.shape, second: Boolean(item.second) });
      if (item.enter) m.from = enter(b);
      // A dot that was a balloon or a ball starts on that disc: the offset of its middle and its size
      // there (both discs are units only, so the ratio holds at every u).
      if (item.morph) {
        const was = disc(place, item.morph);
        m.morph = { dy: sub(add(was.y, mul(was.w, 0.5)), add(b.y, mul(b.h, 0.5))), k: was.w[0] / b.w[0] };
      }
    } else if (item.kind === 'outline') mark(id, 'outline', 'places', disc(place), { place, role: 'removed', hollow: true, faded: item.faded });
    else if (item.kind === 'ghost') mark(id, 'ghost', 'places', item.inset ? grow(disc(place), mul(set.line, -1)) : disc(place), { place, inset: Boolean(item.inset) });
    else if (item.kind === 'place') mark(id, 'place', 'places', disc(place), { place });
    else if (item.kind === 'ring') mark(id, 'ring', 'lines', grow(disc(place), add(set.ringGap, set.line)), { place, dash: item.dash, line: set.line });
    else if (item.kind === 'digit') {
      // On a balloon the digit is sized from its disc, as on a dot from its own (decisions.md 2026-10-31).
      const font = object === 'balloon' ? { ...set.font, k: set.font.k * GLYPH.balloon } : set.font;
      mark(id, 'digit', 'digits', disc(place), { place, text: item.text, tone: item.tone, grow: item.grow, font, on: object });
    }
    else if (item.kind === 'arc') {
      // From place top to place top, 5px high, so with its stroke it stays 1.5px under a track-1 line;
      // across a row break, out past the disc's ring and in before it, short of the side lines.
      const [a, b] = [Math.min(item.from, item.to), Math.max(item.from, item.to)];
      const [da, db] = [disc(a), disc(b)];
      const reach = add(mul(da.w, 0.5), set.ringGap, set.line);
      const parts = Math.floor(a / 5) === Math.floor(b / 5) ? [[midX(da), midX(db), da.y]] : [[midX(da), add(midX(da), reach), da.y], [sub(midX(db), reach), midX(db), db.y]];
      parts.forEach(([x0, x1, top], i) => mark(parts.length > 1 ? `${id}-${i}` : id, 'arc', 'arcs', grow(span(x0, sub(top, set.arc), x1, top), half), { half: parts.length > 1 ? (i ? 'in' : 'out') : null }));
    } else if (item.kind === 'wrap') line(id, 'unknown', outline(runSlabs(0, r, null), set.track1, set.line));
    else if (item.kind === 'whole') line(id, 'whole', outline(wholeSlabs(item.lifted), set.track1, set.line));
    else if (item.kind === 'rim') line(id, 'frame', outline([{ t: cell(0).y, b: bottom(cell(5 * n - 1)), l: colX(0), r: right(cell(4)) }], set.track1, set.line), 'basket');
    else if (item.kind === 'bracket') {
      const [l, rr] = [sub(colX(0), add(set.track1, set.line)), add(right(cell(4)), set.track1, set.line)];
      line(id, 'unknown', [span(l, bracketTop, rr, add(bracketTop, set.line)), span(l, add(bracketTop, set.line), add(l, set.line), add(bracketTop, set.line, set.tick)),
        span(sub(rr, set.line), add(bracketTop, set.line), rr, add(bracketTop, set.line, set.tick))]);
    } else if (item.kind === 'dome') {
      const b = domeBoxOf(item.over);
      halo(id, b);
      mark(id, 'dome', 'dome', b, { mark: '?', on: kind === 'basket' ? 'bracket' : item.over === 'top' ? 'top' : 'wrap' });
    } else if (item.kind === 'lid') {
      // Its halo moves with it, by the same offset, and starts past the clip too.
      const h = halo(id, lidBox);
      const m = mark(id, 'lid', 'covers', lidBox, { place, mark: item.mark });
      if (item.enter) h.from = m.from = enter(h.box);
      if (item.mark) mark(`${id}-q`, 'qmark', 'covers', grow(lidBox, mul(lidBox.w, -0.25)), { of: id });
    } else if (item.kind === 'cover') {
      // The stretched cover over the dome's places (design 7.3): a piece per row, the '?' on its first
      // place, a white dashed outline of each place; a 4px bridge down a shared column, else a dogleg in
      // the band under the dots, its strip clear of them and of the whole's line.
      const ps = pieces(item.from, item.to);
      const boxes = ps.map((pc) => span(colX(pc.c0), rowY(pc.row), right(cell(5 * pc.row + pc.c1)), bottom(cell(5 * pc.row))));
      if (ps.length === 2) {
        const [a, b] = ps;
        const bx = (/** @type {number} */ c) => sub(add(colX(c), mul(U, 0.5)), mul(set.bridge, 0.5));
        const [lo, hi] = [bottom(boxes[0]), boxes[1].y];
        if (a.c0 <= b.c1) boxes.push(box(bx(a.c0), sub(lo, px(2)), set.bridge, add(sub(hi, lo), px(4))));
        else {
          const strip = add(lo, set.strip);
          boxes.push(span(bx(a.c0), sub(lo, px(2)), add(bx(a.c0), set.bridge), add(strip, set.bridge)), span(bx(b.c1), strip, add(bx(a.c0), set.bridge), add(strip, set.bridge)),
            span(bx(b.c1), strip, add(bx(b.c1), set.bridge), add(hi, px(2))));
        }
      }
      boxes.forEach((b, i) => {
        halo(`${id}-${i}`, b);
        mark(`${id}-${i}`, 'cover', 'covers', b, { group: id, piece: i < ps.length, mark: i === 0 ? '?' : '' });
      });
      for (let p = item.from; p < item.to; p++) mark(`${id}-place-${p}`, 'coverPlace', 'covers', grow(disc(p), mul(set.line, -1)), { place: p, of: id });
      mark(`${id}-q`, 'qmark', 'covers', grow(disc(item.from), mul(U, -0.2)), { of: id });
    } else if (item.kind === 'tourRing') {
      // Round the counted places on track 0, one ring: a piece per row, the band between joined where
      // they share a column, else a link under the first row to the second piece's corner.
      const [a, b] = pieces(item.from, item.to);
      const slab = (/** @type {{ row: number, c0: number, c1: number }} */ pc) => ({ t: rowY(pc.row), b: bottom(cell(5 * pc.row)), l: colX(pc.c0), r: right(cell(5 * pc.row + pc.c1)) });
      const [g, gt] = [set.ringGap, add(set.ringGap, set.line)];
      if (!b) line(id, 'unknown', outline([slab(a)], g, set.line));
      else if (a.c0 <= b.c1) line(id, 'unknown', outline([slab(a), { t: slab(a).b, b: slab(b).t, l: colX(a.c0), r: slab(b).r }, slab(b)], g, set.line));
      else {
        const [A, B] = [slab(a), slab(b)];
        line(id, 'unknown', [...outline([A], g, set.line), ...outline([B], g, set.line),
          span(add(B.r, g), add(A.b, g), sub(A.l, gt), add(A.b, gt)), span(add(B.r, g), add(A.b, gt), add(B.r, gt), sub(B.t, gt))]);
      }
    } else if (item.kind === 'chip') {
      const w = chipW(item.text);
      const lifted = items.find((x) => x.kind === 'whole')?.lifted;
      let b;
      if (item.at === 'whole') {
        const top = outline(wholeSlabs(lifted), set.track1, set.line)[0];
        b = box(sub(right(top), w), sub(top.y, set.chipH), w, set.chipH);
      } else if (item.at === 'dome') b = box(sub(domeMid, mul(w, 0.5)), sub(midY(domeBox), mul(set.chipH, 0.5)), w, set.chipH);
      else {
        const foot = item.at === 'start' ? sub(disc(0).y, set.chipGap) : kind === 'basket' ? bracketTop : wrapTop;
        b = box(sub(midX(disc(0)), mul(w, 0.5)), sub(foot, set.chipH), w, set.chipH);
      }
      mark(id, 'chip', 'chips', b, { text: item.text, tone: item.tone, ring: Boolean(item.ring), font: set.chipFont, at: item.at });
    }
  }
  for (const item of plan.leaving) {
    const b = item.shape === 'balloon' ? { ...disc(item.place, 'balloon'), h: /** @type {Len} */ ([0.98, 0]) } : disc(item.place, item.shape);
    mark(item.id, 'object', 'objects', b, { place: item.place, role: item.role, shape: item.shape, leaving: item.exit, to: item.exit === 'up' ? flyUp(b, Math.floor(item.place / 5)) : null });
  }
  return { dw, dh, n, rows, marks };
}

/**
 * The unit a stage of W × H px gives a layout: the ten-frame's pattern, as game.css solves it.
 * @param {Layout} layout
 * @param {number} W
 * @param {number} H
 * @param {number} [uMax]
 */
export const unitFor = (layout, W, H, uMax = ROUND.uMax) => Math.min(uMax, (W - layout.dw[1]) / layout.dw[0], (H - layout.dh[1]) / layout.dh[0]);
