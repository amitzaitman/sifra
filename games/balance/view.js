// The balance on screen (architecture 2.4; design 6.8-6.9, 7). Waits go through settle().
import { cover } from '../../lib/cover.js';
import { reduced, settle } from '../../lib/settle.js';
import { LINE, at, drawBalance, drawRows, el, ghostRows, ghostSlots, layoutPan, lidPlaces, paint, panLayer, ringClip, ringLinks, ringPieces, rowsOfPan, runsOf } from './stage.js';

/** @typedef {'left' | 'right'} Side */
/** @typedef {import('./stage.js').PanGroup} PanGroup */
/** @typedef {import('./stage.js').Run} Run */
/** @typedef {[HTMLElement, number][]} Steps a tour: the element and its digit */
/** @typedef {{ el: HTMLElement, left: HTMLElement, right: HTMLElement }} Layer an overlay with a stack per pan (panLayer) */
/** @typedef {{ steps: Steps, pace: number, ring: () => HTMLElement[] }} Tour digits `pace` at a time, then the ring */
/** @typedef {{ display: string, value: any, rule: string }} Shown a wrong choice and its display */
/** @typedef {(layer: Layer, choice: Shown, lift: () => void) => void | Promise<void>} Show a display's drawing on the balance, in its layer */
/**
 * What renderBalance asks of a picture: the balance (balanceScene) or the turned rows (rowsScene).
 * @typedef {object} Scene
 * @property {HTMLElement} stage
 * @property {HTMLElement} scene
 * @property {() => HTMLElement[]} lids the cover's pieces
 * @property {() => HTMLElement[]} unknowns the unknown's cubes or dots
 * @property {(closed?: boolean) => void} rest back to the start picture (level once closed)
 * @property {() => void} close the closing's own part (judging: the true card's cubes)
 * @property {() => void} intro on mount, in play and demo
 * @property {(display: string, value: any, rule: string, lift: () => void) => Promise<HTMLElement>} show a display (step 1)
 * @property {() => Layer} hint step 2, kept to the end of the round
 * @property {(hint: Layer) => Tour} tour step 3
 * @property {(hand: Hand, steps: DemoSteps) => Promise<void>} demo the hand's taps, then the hint and the tour (R9)
 */
/** @typedef {{ hint: () => Promise<void>, tour: () => Promise<void> }} DemoSteps what a demo shows after the hand's taps, as a third miss does */

/** @type {(round: Round) => any[]} */
const groupsOf = (round) => (round.look === 'symbols' ? round.helpPicture : round.picture) ?? [];
/** @type {(tokens: any[]) => number} a side of a card */
const total = (tokens) => tokens.reduce((n, t, i) => (typeof t !== 'number' ? n : tokens[i - 1] === '−' ? n - t : n + t), 0);
/** @type {(left: number, right: number) => 'level' | 'left' | 'right'} one stop for any difference */
const tiltOf = (left, right) => (left > right ? 'left' : left < right ? 'right' : 'level');
/** @type {(groups: PanGroup[]) => number} the known cubes and what lies under a cover */
const weight = (groups) => groups.reduce((n, g) => n + (g.role !== 'unknown' || g.cover ? g.count : 0), 0);
/** @type {(k: number, n: number) => string} the k-th of n entering in order: at most 0.28 s (R10) */
const delay = (k, n) => `${Math.round(Math.min(280, 40 + k * Math.min(40, 240 / Math.max(1, n - 1))))}ms`;
/** @type {(nodes: HTMLElement[]) => HTMLElement[]} */
const stagger = (nodes) => nodes.map((n, k) => Object.assign(n.style, { animationDelay: delay(k, nodes.length) }) && n);
/** @type {(parent: Element, className: string, box?: any, text?: string | number) => HTMLElement} */
const put = (parent, className, box, text) => {
  const node = el('span', className, box);
  if (text !== undefined) node.textContent = String(text);
  parent.append(node);
  return node;
};

/** How to redo each condensed node's squeeze, by node: a turned phone resizes the cubes (bug hunt #11). */
const refits = new WeakMap();

/**
 * The digits of a two-digit number in a node, condensed across (--sx, `.bl-fit` centres them) so that a number as
 * wide as two tabular digits, 0.68em each, fits the box's width less `pad` px; their height, so the 14px, stays
 * (design 4, 7.3). The squeeze is measured again when the picture is resized (renderBalance's observer).
 * @type {(node: HTMLElement, n: number, box: HTMLElement, pad: number) => void}
 */
const condense = (node, n, box, pad) => {
  node.textContent = '';
  put(node, 'bl-fit', undefined, n);
  const fit = () => {
    const wide = String(n).length * 0.68 * parseFloat(getComputedStyle(node).fontSize);
    node.style.setProperty('--sx', Math.min(1, (box.offsetWidth - pad) / wide).toFixed(3));
  };
  refits.set(node, fit);
  fit();
};

// The picture's description (design 6.3): locked templates with nikud.
const WORDS = {
  balance: 'מֹאזְנַיִם', versus: 'מוּל', cover: 'מִכְסֶה', empty: 'כַּף רֵיקָה', emptyScale: 'מֹאזְנַיִם רֵיקִים',
  cube: 'קֻבִּיָּה אַחַת', cubes: 'קֻבִּיּוֹת', dot: 'נְקֻדָּה אַחַת', dots: 'נְקֻדּוֹת', rows: 'שְׁתֵּי שׁוּרוֹת',
};

/**
 * The picture's label: the cover or the empty pan before the solve; solved, the unknown's cubes by their count, and a
 * judging round's true card on the pans (bug hunt #24).
 * @type {(round: Round, solved?: boolean) => string}
 */
function labelOf(round, solved = false) {
  if (round.model === 'cards' && !solved) return WORDS.emptyScale;
  const set = round.model === 'set';
  const data = sidesOf(round, solved);
  const side = (name) => data[name].filter((g) => !solved || g.count > 0).map((g) => {
    if (g.role === 'unknown' && !solved) return round.unknown === 'result-right' ? WORDS.empty : WORDS.cover;
    const [one, many] = set ? [WORDS.dot, WORDS.dots] : [WORDS.cube, WORDS.cubes];
    return g.count === 1 ? one : `${g.count} ${many}`;
  }).join(', ') || WORDS.empty;
  return `${set ? WORDS.rows : WORDS.balance}: ${side('left')} ${WORDS.versus} ${side('right')}`;
}

/** @type {(tokens: any[], role: string) => PanGroup[]} a card side's numbers in order, the second part in the light shade */
const piles = (tokens, role) => tokens.filter((t) => typeof t === 'number').map((count, i) => ({ role, count, second: role === 'part' && i > 0 }));

/**
 * The groups on each side: same-as leaves the right pan empty, the others cover the unknown, a
 * judging round's pans hold the true card once chosen. Groups follow on in rows of five; the
 * second of two known parts on a side takes the part's light shade (design 3, 6.8), and in the
 * turned row each number keeps its colour, so the colours change sides (depth 4.9).
 * @param {Round} round
 * @param {boolean} solved
 * @returns {Record<Side, PanGroup[]>}
 */
function sidesOf(round, solved) {
  if (round.model === 'cards') {
    const { left, right } = solved ? round.answer : { left: [], right: [] };
    // A lone number is its side's whole (7 = 7); a side with an operation holds parts.
    const role = (tokens) => (tokens.length === 1 ? 'whole' : 'part');
    return { left: piles(left, role(left)), right: piles(right, role(right)) };
  }
  const all = groupsOf(round);
  // a + b = b + ?: the right row is the left one turned, its known part the left's second.
  const turned = round.skill === 'eq.props.commutative';
  /** @type {(name: Side) => PanGroup[]} */
  const side = (name) => {
    const mine = all.filter((g) => g.side === name);
    return mine.map((g, i) => ({
      role: g.role, count: g.count, cover: round.unknown !== 'result-right' && !solved && g.role === 'unknown',
      second: g.role === 'part' && ((turned && name === 'right') || mine.slice(0, i).some((h) => h.role === 'part')),
    }));
  };
  return { left: side('left'), right: side('right') };
}

/** The displays drawn on the picture's own places (show). */
const IN_PLACE = ['flash', 'empty-plate', 'jumps'];
/**
 * The displays drawn as ghosts on the unknown's pan, the beam tipped (show). A slip's count-up too
 * (design 7.3): every cube weighs, so one cube short or over tips the beam.
 */
const GHOSTS = ['overflow', 'balance', 'count-up'];
/** Every display the balance draws (architecture 2.1): the pans each its own way, a judging card and the turned rows each as ghosts. */
export const DISPLAYS = [...IN_PLACE, ...GHOSTS];

/**
 * A scene's drawing of a display, from its table keyed by display id (architecture 2.1). One it
 * has none for throws, so a display never falls through to another one's drawing.
 * @template T
 * @param {Record<string, T>} table
 * @param {string} display
 * @returns {T}
 */
function drawingOf(table, display) {
  if (!Object.hasOwn(table, display)) throw new Error(`balance: no drawing for ${display}`);
  return table[display];
}
/** @type {<T>(drawing: T) => Record<string, T>} one drawing for every display (a judging card, the turned rows) */
const forEvery = (drawing) => Object.fromEntries(DISPLAYS.map((id) => [id, drawing]));

/** @type {(round: Round) => boolean} a missing part (a + ? = c, ? + a = c, c = a + ?): the unknown's pan holds a known part */
const missingPart = (round) => round.unknown === 'right-part' || round.unknown === 'left-part';

/**
 * Whether show() can draw a display on this round (design 7.1, 7.3): one of DISPLAYS, which a
 * judging card and the turned rows draw as ghosts and the pans each its own way. The jumps count on
 * over the two numbers of the other pan (? = a + b), or, on a missing part, from the known part's last
 * cube over the unknown's places (a + ? = c, ? + a = c, c = a + ?; decisions.md 2026-10-31).
 * @param {Round} round
 * @param {string} display
 * @returns {boolean}
 */
export function drawable(round, display) {
  if (!DISPLAYS.includes(display)) return false;
  if (round.model !== 'balance' || display !== 'jumps') return true;
  const data = sidesOf(round, false);
  const u = data.left.some((g) => g.role === 'unknown') ? 'left' : 'right';
  if (missingPart(round)) return data[u].some((g) => g.role === 'part');
  return data[u === 'left' ? 'right' : 'left'].length === 2;
}

/**
 * The rows a wrong choice's display needs (design 6.8, 7.1): the start picture's, or more where its
 * ghosts go on past a pan's last place, the value from the unknown's places on or a judging card's
 * sides on the empty pans. The turned rows: the ghost dots' rows. show() sets the same.
 * @param {Round} round
 * @param {string} display
 * @param {any} value
 * @returns {number}
 */
export function displayRows(round, display, value) {
  if (round.model === 'set') return Math.max(1, Math.ceil(value / 5));
  const data = sidesOf(round, false);
  const pans = { left: layoutPan(data.left), right: layoutPan(data.right) };
  const rest = Math.max(rowsOfPan(pans.left), rowsOfPan(pans.right));
  if (round.model === 'cards') return Math.max(rest, ghostRows(pans.left, -1, total(value.left)), ghostRows(pans.right, -1, total(value.right)));
  if (IN_PLACE.includes(display)) return rest;
  const u = data.left.some((g) => g.role === 'unknown') ? 'left' : 'right';
  return Math.max(rest, ghostRows(pans[u], data[u].findIndex((g) => g.role === 'unknown'), value));
}

/**
 * The balance (models balance and cards): what a display, the hint and the tour draw.
 * @param {HTMLElement} host
 * @param {Round} round
 * @param {boolean} solved
 * @param {AbortSignal} signal
 * @returns {Scene}
 */
function balanceScene(host, round, solved, signal) {
  const judging = round.model === 'cards';
  const data = sidesOf(round, solved);
  const restTilt = solved ? 'level' : tiltOf(weight(data.left), weight(data.right));
  /** @type {(a: import('./stage.js').PanLayout, b: import('./stage.js').PanLayout) => number} rows for both pans */
  const rowsOf = (a, b) => Math.max(rowsOfPan(a), rowsOfPan(b));
  const d = drawBalance(host, { ...data, tilt: restTilt, rows: rowsOf(layoutPan(data.left), layoutPan(data.right)), cover });
  /** The rows the pans need now (a judging card or a hint may change what lies on them). */
  const rowsNow = () => rowsOf(d.pans.left.layout, d.pans.right.layout);
  const { scene, pans } = d;
  scene.toggleAttribute('data-judge', judging);
  /** @type {Side} the unknown's side, and k the other */
  const u = data.left.some((g) => g.role === 'unknown') ? 'left' : 'right';
  const k = u === 'left' ? 'right' : 'left';
  const ui = data[u].findIndex((g) => g.role === 'unknown');
  const span = pans[u].layout.spans[ui];
  /** @type {(side: Side, group: number) => HTMLElement[]} */
  const cubesOf = (side, group) => pans[side].cubes.filter((_, i) => pans[side].layout.cubes[i].group === group);
  /** @type {(side: Side) => Run[]} every cube of a pan, as runs */
  const cubeRuns = (side) => runsOf(pans[side].layout.cubes.map((c) => c.slot));
  /** @type {(to: string, rows?: number) => void} */
  const tilt = (to, rows = rowsNow()) => {
    scene.dataset.tilt = to;
    scene.style.setProperty('--rows', String(rows));
  };
  let outlined = false; // the hint is drawn: the cover's outline shows instead of the fixed cover (game.css)
  /**
   * Rings over runs of places in a layer's pan, a box per row, each cut back where another group's
   * cube or cover lies next to it, and where its own group goes on in the next row (ringClip), so
   * a ring never paints over a cube. Two pieces that share no column (a run from mid-row into the
   * next row) are joined by a link of the ring's line in the rows' gap, where the cover's bridge
   * runs, so the group reads as one outline (design 6.8, 7.2).
   * `marked`: places a display drew on (a jump's marks), neighbours too.
   * @type {(layer: Layer, side: Side, runs: Run[], className: string, marked?: number[]) => HTMLElement[]}
   */
  const rings = (layer, side, runs, className, marked = []) => {
    const own = new Set(runs.flatMap((r) => Array.from({ length: r.length }, (_, i) => r.start + i)));
    const { layout } = pans[side];
    // Before the hint the cover is the fixed one: what lies under it is no neighbour, its places look empty.
    // Lifted (is-open), the fixed one is gone.
    const places = data[side].flatMap((g, i) => (g.cover ? layout.spans[i]?.places ?? [] : []));
    const covered = outlined ? places : layout.lid && !scene.classList.contains('is-open') ? lidPlaces(layout.lid) : [];
    const cubes = layout.cubes.map((c) => c.slot).filter((slot) => outlined || !places.includes(slot));
    const taken = new Set([...cubes, ...covered, ...marked].filter((slot) => !own.has(slot)));
    const on = (col, row) => col >= 0 && col < 5 && row >= 0;
    const other = (col, row) => on(col, row) && taken.has(row * 5 + col);
    return runs.flatMap((r) => {
      const nodes = ringPieces(r.start, r.length).map((box) => {
        const node = put(layer[side], `bl-ring ${className}`, box);
        const outside = (col, row) => col < box.col || col >= box.col + box.w || row < box.row || row >= box.row + box.h;
        const clip = ringClip(box, other, (col, row) => on(col, row) && own.has(row * 5 + col) && outside(col, row));
        if (clip) node.style.clipPath = clip;
        return node;
      });
      const links = ringLinks(r.start, r.length).map((b) => put(layer[side], `bl-ring-link ${className}`, { col: b.from, row: b.row, w: b.to - b.from }));
      return [...nodes, ...links];
    });
  };
  /** @type {(stack: Element, slots: number[]) => HTMLElement[]} */
  const ghosts = (stack, slots) => stagger(slots.map((slot) => put(stack, 'bl-cube bl-ghost', at(slot))));
  /** @type {(tokens: (string | number)[], side: Side, layer: Element) => void} a chip under a pan (design 6.8), named for the off-target log (architecture 3.2) */
  const chip = (tokens, side, layer) => {
    const node = put(layer, 'bl-chip');
    node.dataset.pan = side;
    node.dataset.tap = 'chip';
    node.dir = 'ltr';
    for (const t of tokens) put(node, t === '+' ? 'bl-op' : t === '?' ? 'bl-q' : 'bl-n', undefined, t);
  };
  /** @type {(side: Side) => (string | number)[]} each group of a pan, '?' for the unknown */
  const groups = (side) => data[side].flatMap((g, i) => [...(i ? ['+'] : []), g.role === 'unknown' ? '?' : g.count]);
  /** @type {(side: Side) => number} */
  const all = (side) => data[side].reduce((n, g) => n + g.count, 0);
  /** Lays the true card's cubes on the pans (judging rounds), entering in order. */
  const layCard = () => {
    if (pans.left.cubes.length) return;
    const card = sidesOf(round, true);
    for (const side of /** @type {Side[]} */ (['left', 'right'])) {
      const layout = layoutPan(card[side]);
      pans[side].layout = layout;
      pans[side].cubes = stagger(layout.cubes.map((spot) => paint(put(pans[side].stack, 'bl-cube is-entering', spot), spot)));
    }
    tilt(scene.dataset.tilt);
  };
  // eq.sign.relational, a + b = c + ?: cubes change group in a + b (depth 4.9). d is c - a.
  const moving = round.skill === 'eq.sign.relational' && { a: cubesOf(k, 0), b: cubesOf(k, 1), d: data[u][0].count - data[k][0].count };
  let hinted = 0; // cubes the hint moved; they stay moved to the end of the round
  /**
   * Moves n cubes from the second group to the first (n < 0: from the first to the second). They
   * are the cubes where the groups meet, and the groups follow on in rows of five, so none changes
   * place: each takes its new group's colour (game.css fades it in the move time).
   * @param {number} n
   */
  const shift = (n) => {
    if (!moving) return;
    const { a, b } = moving;
    const first = n >= 0 ? [...a, ...b.slice(0, n)] : a.slice(0, a.length + n);
    const second = n >= 0 ? b.slice(n) : [...a.slice(a.length + n), ...b];
    const layout = layoutPan([{ role: 'part', count: first.length }, { role: 'part', count: second.length, second: true }]);
    const cubes = [...first, ...second];
    cubes.forEach((cube, i) => paint(cube, layout.cubes[i]));
    Object.assign(pans[k], { layout, cubes });
    pans[k].stack.dataset.groups = `${first.length} ${second.length}`;
  };
  shift(0);

  /** @type {Show} The card goes up on the balance as ghosts, each side in rows of five. */
  const card = (layer, { display, value }) => {
    const pile = (tokens) => Array.from({ length: total(tokens) }, (_, slot) => slot);
    const [left, right] = [pile(value.left), pile(value.right)];
    ghosts(layer.left, left);
    ghosts(layer.right, right);
    scene.classList.add('is-weighing');
    tilt(tiltOf(total(value.left), total(value.right)), displayRows(round, display, value));
  };
  /** @type {Show} The number is on a pan already: it blinks once and keeps a ring. */
  const flash = (layer, { rule }) => {
    const target = [u, k].flatMap((side) => data[side].map((g, i) => ({ g, i, side })))
      .find(({ g }) => g.role === (rule === 'given.whole' ? 'whole' : 'part'));
    for (const cube of cubesOf(target.side, target.i)) cube.classList.add('is-flash');
    rings(layer, target.side, pans[target.side].layout.spans[target.i].runs, 'is-wrong');
  };
  /** @type {Show} */
  const emptyPlate = (layer, choice, lift) => {
    lift();
    put(layer[u], 'bl-zero is-wrong', at(span.places[0]), 0);
  };
  /**
   * Numbered marks along a path of places in a pan, from `first`, with an arc between two that follow
   * on in a row; a place past the pan's last gets a ghost cube under its mark.
   * @type {(layer: Layer, side: Side, path: number[], first: number) => void}
   */
  const hop = (layer, side, path, first) => {
    const { layout } = pans[side];
    stagger(path.map((slot, j) => {
      if (slot === path[j - 1] + 1 && slot % 5) put(layer[side], 'bl-arc', at(slot - 1));
      if (slot >= layout.slots) put(layer[side], 'bl-cube bl-ghost', at(slot));
      const mark = put(layer[side], 'bl-mark', at(slot), first + j);
      // A mark is a white disc with a 2px edge, like a known cube: its digits get the same room, 3px each side.
      if (first + j > 9) condense(mark, first + j, mark, 6);
      return mark;
    }));
  };
  /** @type {(layout: import('./stage.js').PanLayout, path: number[], n: number) => number[]} the path's first n places, on past the pan's last */
  const along = (layout, path, n) => {
    const out = path.slice(0, n);
    for (let next = layout.slots; out.length < n; next++) out.push(next);
    return out;
  };
  /**
   * Counting on with the start counted (design 7.3). ? = a + b: from a's last cube, a on it, one short;
   * the places it missed keep a ring. A missing part (a + ? = c): the cover lifts, 1 on the known part's
   * last cube, then over the unknown's places to the whole, one more than the answer; the cube counted
   * as 1 blinks and keeps a ring ("you counted one that was already there").
   * @type {Show}
   */
  const jumps = (layer, { value }, lift) => {
    if (missingPart(round)) {
      lift();
      const pi = data[u].findIndex((g) => g.role === 'part');
      const start = pans[u].layout.spans[pi].places.at(-1);
      const path = along(pans[u].layout, [start, ...span.places], value);
      hop(layer, u, path, 1);
      cubesOf(u, pi).at(-1)?.classList.add('is-flash');
      rings(layer, u, [{ start, length: 1 }], 'is-wrong is-late', path);
      return;
    }
    const { layout } = pans[k];
    const first = data[k][0].count;
    const path = [layout.spans[0].places.at(-1), ...layout.spans[1].places];
    const steps = along(layout, path, value - first + 1);
    hop(layer, k, steps, first);
    rings(layer, k, runsOf(path.slice(steps.length).filter((slot) => slot < layout.slots)), 'is-wrong is-late');
  };
  /**
   * overflow, balance, count-up: ghosts in the unknown's pan.
   * @param {Layer} layer @param {Shown} choice @param {() => void} lift
   */
  const weigh = async (layer, { display, value, rule }, lift) => {
    if (rule === 'equal.compensate-wrong' && moving) {
      // The cube goes the wrong way: the second group is the choice.
      shift(-moving.d);
      tilt(restTilt);
      await settle(pans[k].stack, signal);
      if (signal.aborted) return;
    } else scene.classList.add('is-weighing');
    // Ghosts in the unknown's places, then on after the pan's last; every cube weighs.
    lift();
    const slots = ghostSlots(pans[u].layout, ui, value);
    ghosts(layer[u], slots);
    const mine = weight(data[u].filter((g) => g.role !== 'unknown')) + value;
    tilt(u === 'left' ? tiltOf(mine, weight(data[k])) : tiltOf(weight(data[k]), mine), displayRows(round, display, value));
  };
  /** Each display's drawing (design 7.1, 7.3), by display id: on the pans each its own way; a judging card whatever its display. */
  const shows = judging ? forEvery(card) : { flash, 'empty-plate': emptyPlate, jumps, ...Object.fromEntries(GHOSTS.map((id) => [id, weigh])) };

  return {
    stage: d.stage,
    scene,
    lids: () => [...pans.left.lids, ...pans.right.lids],
    unknowns: () => (ui < 0 ? [] : cubesOf(u, ui)),
    /** The start picture (level once closed); cubes the hint moved stay moved. */
    rest: (closed = false) => {
      shift(hinted);
      tilt(closed ? 'level' : restTilt);
    },
    close: () => {
      if (judging) layCard();
      // Solved, the hint's '?' under a pan reads the unknown's count, in its colour, as the row does (design 6.9, 7.3).
      if (ui >= 0) for (const q of scene.querySelectorAll('.bl-chip .bl-q')) q.textContent = String(data[u][ui].count);
    },
    intro: () => {},
    /**
     * What a wrong choice says (design 7.1, 7.3), in a layer [data-display]: its display's drawing,
     * looked up before the layer is added (a display the scene has none for throws).
     * @param {string} display
     * @param {any} value
     * @param {string} rule
     * @param {() => void} lift
     */
    async show(display, value, rule, lift) {
      const drawing = drawingOf(shows, display);
      const layer = panLayer(scene);
      layer.el.dataset.display = display;
      await drawing(layer, { display, value, rule }, lift);
      return layer.el;
    },
    /** Step 2: the skill's hint (depth 4.9), kept to the end of the round. */
    hint() {
      const layer = panLayer(scene);
      layer.el.dataset.hint = '';
      outlined = true;
      if (round.skill === 'eq.sign.same-as') {
        chip([all('left')], 'left', layer.el);
        chip(['?'], 'right', layer.el);
      } else if (round.skill === 'eq.sign.missing') {
        // How many on each pan; the cover shows the missing cubes' outline.
        chip(groups('left'), 'left', layer.el);
        chip(groups('right'), 'right', layer.el);
        // At each end of a cover's piece a dash rounds its top outer corner as the dome does, so
        // it stays inside the dome's shoulder (design 6.6).
        const { places } = span;
        for (const slot of places.slice(0, data[u][ui].count)) {
          const ends = `${slot === places[0] || slot % 5 === 0 ? ' is-start' : ''}${slot === places.at(-1) || slot % 5 === 4 ? ' is-end' : ''}`;
          put(layer[u], `bl-dash${ends}`, at(slot));
        }
      } else if (round.skill === 'eq.sign.both-sides') {
        // "7 | 7": how many on each side.
        chip([all('left')], 'left', layer.el);
        chip([all('right')], 'right', layer.el);
      } else if (moving) {
        // Cubes change group: a becomes c and the beam is level; what is left of b faces the
        // cover. Rings in the colours of the roles they mark (design 7.2).
        shift(hinted = moving.d);
        tilt(restTilt);
        rings(layer, k, pans[k].layout.spans[1].runs, 'is-hint is-part is-late');
        rings(layer, u, span.runs, 'is-hint is-late');
      }
      // eq.sign.true-false: each card's small balance shows (game.css).
      return layer;
    },
    /**
     * Step 3 (R5, design 7.2): the tour's steps and the ring after it.
     * @param {Layer} layer the hint's
     * @returns {Tour}
     */
    tour(layer) {
      if (judging) {
        // The true card's sides counted together, pair by pair.
        layCard();
        const right = pans.right.cubes;
        return { steps: pans.left.cubes.flatMap((c, j) => [[c, j + 1], [right[j], j + 1]]), pace: 2, ring: () => rings(layer, 'right', cubeRuns('right'), 'is-tour') };
      }
      const first = data[k][0]?.count;
      if (round.unknown === 'result-left') {
        // The unknown is the whole: counting on over what was covered, a + 1 to a + b.
        return { steps: cubesOf(u, ui).slice(first).map((c, j) => [c, first + j + 1]), pace: 1, ring: () => rings(layer, u, span.runs, 'is-tour') };
      }
      if (round.unknown === 'result-right') {
        // same-as: counting on from the left's first group over its second.
        tilt('level');
        return { steps: cubesOf(k, 1).map((c, j) => [c, first + j + 1]), pace: 1, ring: () => rings(layer, k, cubeRuns(k), 'is-tour') };
      }
      const steps = /** @type {Steps} */ (cubesOf(u, ui).map((c, j) => [c, j + 1]));
      // Nothing under the cover: a ring with 0.
      if (!steps.length) put(layer[u], 'bl-zero is-tour', at(span.places[0]), 0).dataset.tour = '0';
      return { steps, pace: 1, ring: () => (steps.length ? rings(layer, u, span.runs, 'is-tour') : []) };
    },
    /**
     * The demo (R9): the hand touches the pans left to right (R7; an empty pan at its bowl), steps off the picture,
     * then the hint and the tour as a third miss draws them. A judging round's pans are empty: it starts at the hint.
     * @param {Hand} hand
     * @param {DemoSteps} steps
     */
    async demo(hand, steps) {
      /** @type {(side: Side) => Element} */
      const touch = (side) => (pans[side].cubes.length || pans[side].lids.length ? pans[side].stack : pans[side].el.querySelector('.bl-bowl'));
      if (!judging) {
        await hand.tap(touch('left'));
        if (!signal.aborted) await hand.tap(touch('right'));
        if (!signal.aborted) await hand.rest();
      }
      if (!signal.aborted) await steps.hint();
      if (!signal.aborted) await steps.tour();
    },
  };
}

/**
 * The turned rows (eq.props.commutative, model set).
 * @param {HTMLElement} host
 * @param {Round} round
 * @param {boolean} solved
 * @param {AbortSignal} signal
 * @returns {Scene}
 */
function rowsScene(host, round, solved, signal) {
  const data = sidesOf(round, solved);
  const d = drawRows(host, { ...data, rows: 1, cover });
  const { scene, lines } = d;
  const restLen = scene.style.getPropertyValue('--len');
  const ui = data.right.findIndex((g) => g.role === 'unknown');
  const unknowns = () => lines.right.dots.filter((_, i) => lines.right.layout.dots[i].group === ui);
  const block = lines.right.layout.blocks[ui];
  const answer = data.right[ui].count;
  /** @type {(j: number) => { x: number, y: number }} the j-th place of the unknown's block, rows of five */
  const place = (j) => ({ x: block.x + (j % 5), y: LINE + Math.floor(j / 5) });
  /** @type {(layer: Element, from: number, to: number, className: string) => void} rings over the unknown's places from to, a row at a time */
  const rings = (layer, from, to, className) => {
    for (let j = from; j < to; j = Math.floor(j / 5) * 5 + 5) put(layer, `bl-ring ${className}`, { ...place(j), w: Math.min(to, Math.floor(j / 5) * 5 + 5) - j });
  };
  /** @type {(className?: string) => HTMLElement} */
  const layer = (className = '') => put(scene, `bl-layer ${className}`);
  /**
   * The first row's copy turns over onto the second (depth 4.9); only dots move (R10).
   * @param {HTMLElement} root
   * @returns {HTMLElement}
   */
  const turn = (root) => {
    for (const dot of lines.left.layout.dots) paint(put(root, 'bl-dot bl-twin', dot), dot);
    return root;
  };
  /** @type {(len: number | string, rows: number) => void} the set's size in cells */
  const size = (len, rows) => {
    scene.style.setProperty('--len', String(len));
    scene.style.setProperty('--rows', String(rows));
  };
  /** @type {(root: HTMLElement, choice: Shown, lift: () => void) => void} ghosts in the turned row, whatever the display */
  const ghostRow = (root, { display, value }, lift) => {
    lift();
    stagger(Array.from({ length: value }, (_, j) => put(root, 'bl-dot bl-ghost', place(j))));
    rings(root, Math.min(value, answer), Math.max(value, answer), 'is-wrong is-late');
    const width = lines.right.layout.length - Math.min(5, answer) + Math.min(5, Math.max(value, answer));
    size(Math.max(Number(restLen), width), displayRows(round, display, value));
  };
  const shows = forEvery(ghostRow);
  return {
    stage: d.stage,
    scene,
    lids: () => d.lids,
    unknowns,
    rest: () => size(restLen, 1),
    close: () => {},
    /** On mount, in play and demo: the row turns once. */
    intro: () => turn(layer('bl-turning')),
    /**
     * Any display (one of DISPLAYS): ghosts in the turned row; what does not fit keeps a ring.
     * @param {string} display
     * @param {number} value
     * @param {string} rule
     * @param {() => void} lift
     */
    async show(display, value, rule, lift) {
      const drawing = drawingOf(shows, display);
      const root = layer();
      root.dataset.display = display;
      drawing(root, { display, value, rule }, lift);
      return root;
    },
    /** Step 2: the row turns again, slowly; the unknown and its twin keep a ring. */
    hint() {
      const root = turn(layer('bl-turning is-slow'));
      root.dataset.hint = '';
      const twin = lines.left.layout.blocks.find((b) => b.count === answer);
      put(root, 'bl-ring is-hint is-part', { x: twin.x, y: 0, w: answer });
      put(root, 'bl-ring is-hint', { ...place(0), w: answer });
      return { el: root, left: root, right: root };
    },
    /**
     * Step 3: the unknown counted from 1 (R5).
     * @param {Layer} hint
     * @returns {Tour}
     */
    tour(hint) {
      return { steps: /** @type {Steps} */ (unknowns().map((dot, j) => [dot, j + 1])), pace: 1, ring: () => [put(hint.el, 'bl-ring is-tour', { ...place(0), w: answer })] };
    },
    /**
     * The demo (R9): the hand touches the cover, steps off, then the hint and the tour.
     * @param {Hand} hand
     * @param {DemoSteps} steps
     */
    async demo(hand, steps) {
      await hand.tap(d.lids[0]);
      if (!signal.aborted) await hand.rest();
      if (!signal.aborted) await steps.hint();
      if (!signal.aborted) await steps.tour();
    },
  };
}

/**
 * The game's render (architecture 2.4). In symbols look the picture waits for picture(), but a
 * thumb draws it.
 * @param {HTMLElement} host
 * @param {Round} round
 * @param {RenderContext} ctx
 * @returns {RoundView}
 */
export function renderBalance(host, round, { signal, mode, solved, setEquation }) {
  /** @type {Scene | null} */
  let s = null;
  /** @type {Layer | null} the hint, once drawn */
  let hint = null;
  /** While a display runs, and once solved, a touch leaves no mark (as the cards, design 7.1). */
  let busy = false;
  /** Solved: the picture asked for after the solve (symbols look) is the solved still. */
  let closed = false;
  /** Counted things (design 6.3): the known cubes on the real pans and the known dots of the rows. */
  const counted = ':scope > .bl-pan > .bl-stack > .bl-cube:not([data-role="unknown"]), :scope > .bl-dot:not([data-role="unknown"])';
  /** In play, counted things are targets (architecture 2.8), so the shell does not log them as off-target. */
  const countable = () => {
    if (mode !== 'play') return;
    s.scene.querySelectorAll(counted).forEach((n) => { if (!(n instanceof HTMLElement) || 'marked' in n.dataset) return; n.dataset.target = ''; });
  };
  // A touch on a counted thing leaves one ink dot; it is no longer a target, so a second touch is logged.
  if (mode === 'play') {
    host.addEventListener('click', (e) => {
      const node = e.target instanceof Element ? e.target.closest('[data-target]') : null;
      if (!(node instanceof HTMLElement) || busy) return;
      node.dataset.marked = '';
      delete node.dataset.target;
      node.append(el('span', 'bl-touch'));
    }, { signal });
  }
  /**
   * Draws the picture; in play and demo its intro runs, unless it is drawn solved or motion is reduced.
   * @param {boolean} asSolved
   */
  const draw = (asSolved) => {
    s = (round.model === 'set' ? rowsScene : balanceScene)(host, round, asSolved, signal);
    countable();
    if (mode !== 'thumb') return asSolved || reduced() || s.intro();
    // A thumb: the stage at a phone's size, scaled into its host, still.
    s.stage.classList.add('is-thumb');
    fitThumb();
  };
  /** A thumb's scale from its host's size, measured again when the host is resized (a turned phone, bug hunt #11). */
  const fitThumb = () => s?.stage.style.setProperty('--k', String(Math.min(host.clientWidth / 316, host.clientHeight / 186)));
  // One observer per render: a turned phone resizes the host, the thumb's scale and every squeezed number follow.
  // Their writes do not change the host's size, so it does not loop (app.js ignores the loop message anyway).
  const resized = new ResizeObserver(() => {
    if (mode === 'thumb') fitThumb();
    host.querySelectorAll('.bl-fit').forEach((f) => refits.get(f.parentElement)?.());
  });
  resized.observe(host);
  signal.addEventListener('abort', () => resized.disconnect(), { once: true });
  if (round.look !== 'symbols' || mode === 'thumb') draw(mode === 'thumb' && solved);
  /** The cover lifts; the open pans show what lies under it. */
  const lift = () => {
    for (const lid of s.lids()) {
      lid.classList.remove('is-back');
      lid.firstElementChild?.classList.add('is-lifted');
    }
    s.scene.classList.add('is-open');
  };
  /**
   * Clears a display: it goes at once, or leaves (moving when `back`); the lids come back.
   * @param {boolean} back
   */
  const clear = (back) => {
    s.scene.querySelectorAll('[data-display]').forEach((n) => (back ? n.classList.add('is-leaving') : n.remove()));
    s.scene.querySelectorAll('.is-flash').forEach((n) => n.classList.remove('is-flash'));
    for (const lid of s.lids()) {
      const up = lid.firstElementChild?.classList.contains('is-lifted');
      lid.firstElementChild?.classList.remove('is-lifted');
      lid.classList.toggle('is-back', Boolean(back && up));
    }
    s.scene.classList.remove('is-open', 'is-weighing');
  };
  /**
   * A miss (architecture 2.5 step 4): its display, the hint from step 2, the tour at step 3.
   * @param {Miss} choice
   */
  const missed = async ({ value, rule, display, step, first }) => {
    // A display the round has no drawing for throws before the picture changes (architecture 2.1).
    if (!drawable(round, display)) throw new Error(`balance: no drawing for ${display} on this round`);
    if (!s) draw(false);
    // The previous display goes at once; the new one runs (R5, design 7.2).
    clear(false);
    s.scene.classList.add('is-instant');
    s.rest();
    void s.scene.offsetWidth;
    s.scene.classList.remove('is-instant');
    // A first miss keeps its display to the next tap: step 1, or step 2 on a 3-option level (none
    // since 2026-10-31), where the hint joins it (architecture 2.5 step 4). A later miss's display runs and leaves,
    // so the start picture, cover included, gets the hint; with reduced motion it is skipped.
    if (first || !reduced()) {
      const root = await s.show(display, value, rule, lift);
      await settle(s.scene, signal);
      if (!first && !signal.aborted) {
        clear(true);
        // The hint goes on the start picture as it comes back, above the leaving ghosts (design
        // 7.2), so it is on screen when the cards unlock, as the shell has logged it (architecture
        // 2.5 step 4); R10 allows no delay that would wait out the return. It is drawn while the
        // pans still hold the display's tilt (panLayer reads the style), so its pans swing back
        // with the real ones. The cards lock only while the display runs (design 7.1): at step 2
        // the return is not awaited; the tour (step 3) follows it.
        hint ??= s.hint();
        s.rest(false);
        const back = settle(s.scene, signal).then(() => { if (!signal.aborted) root.remove(); });
        if (step < 3) return;
        await back;
      }
    }
    if (signal.aborted) return;
    hint ??= step >= 2 ? s.hint() : null;
    if (step < 3) return;
    await tour();
  };
  /** Step 3, the tour (R5): the unknown shows, and each digit is written in turn; then the ring. */
  const tour = async () => {
    lift();
    for (const n of s.unknowns()) n.classList.add('is-shown');
    const { steps, pace, ring } = s.tour(hint);
    countable();   // a judging round's true card is on the pans now
    await settle(s.scene, signal);
    for (let j = 0; j < steps.length && !signal.aborted; j += pace) {
      const digits = steps.slice(j, j + pace).map(([target, n]) => {
        const last = j + pace >= steps.length ? ' is-last' : '';
        const kind = `bl-digit${target.dataset.role === 'unknown' ? '' : ' on-known'}${last}`;
        // A two-digit last number grows 1.3 in height only: it goes in the hint's pan at its cube's
        // place, above the ring that follows; the cube keeps its size (design 7.3).
        const side = last && n > 9 ? /** @type {Side | undefined} */ (target.closest('.bl-pan')?.getAttribute('data-pan')) : undefined;
        const digit = side
          ? put(hint[side], `${kind} is-over`, { col: target.style.getPropertyValue('--c'), row: target.style.getPropertyValue('--r') }, n)
          : put(target, kind, undefined, n);
        digit.dataset.tour = String(n);
        // Two digits at 14px can be wider than a small cube: condensed (--sx) so that a number as wide as two
        // tabular digits, 0.68em each, fits the cube's width less 2px each side and the cube's colour shows round
        // it. The digits drawn are proportional (1.05em for 11 to 1.38em for 24), so they end up about 2px or
        // more from the edge. On a known cube: less its 2px edge and 1px more each side, so they sit on white
        // inside the edge (design 4, 7.3).
        if (n > 9) condense(digit, n, target, target.dataset.role === 'unknown' ? 4 : 6);
        return digit;
      });
      await Promise.all(digits.map((digit) => settle(digit, signal)));
    }
    if (!signal.aborted) await Promise.all(ring().map((r) => settle(r, signal)));
  };
  return {
    /** Read again by the shell after the solve (2.4): solved, the cubes under the cover by their count. */
    get label() { return labelOf(round, closed || (mode === 'thumb' && solved)); },
    picture: () => draw(closed),
    async miss(choice) {
      busy = true;
      await missed(choice);
      busy = false;
    },
    async solve() {
      busy = true;
      closed = true;
      // Judging: the true card is written in the equation row, so the full exercise is on screen (R5).
      if (round.model === 'cards') setEquation(round.answer);
      if (!s) return;
      clear(false);
      s.close();
      lift();
      stagger(s.unknowns().filter((n) => !n.classList.contains('is-shown'))).forEach((n) => n.classList.add('is-entering'));
      s.rest(true);
      await settle(s.scene, signal);
    },
    async demo(hand) {
      if (!s) draw(false);
      busy = true;
      // After the hand's taps, the hint and the tour, as a third miss shows them (R9).
      await s.demo(hand, {
        hint: async () => {
          hint ??= s.hint();
          await settle(s.scene, signal);
        },
        tour,
      });
    },
  };
}

/**
 * A card's face: a pile without a digit (same-as, depth 4.9); an exercise on one line (R7) with a
 * small balance the hint shows (judging); else false.
 * @param {HTMLElement} host
 * @param {any} value
 * @param {Round} round
 * @returns {boolean}
 */
export function drawFace(host, value, round) {
  if (Array.isArray(value?.left)) {
    const face = put(host, 'bl-card');
    const row = put(face, 'bl-eq');
    row.dir = 'ltr';
    const tokens = [...value.left, '=', ...value.right];
    // The row's width in em (Rubik 800, tabular digits): a size that keeps one line.
    const em = tokens.reduce((n, t) => n + (typeof t === 'number' ? 0.68 * String(t).length : 0.6), 0.25 * (tokens.length - 1));
    row.style.setProperty('--em', em.toFixed(2));
    for (const t of tokens) put(row, t === '+' || t === '−' ? 'bl-op' : 'bl-n', undefined, t);
    const mini = put(face, 'bl-mini');
    mini.dataset.tilt = tiltOf(total(value.left), total(value.right));
    mini.setAttribute('aria-hidden', 'true');
    put(mini, 'bl-mini-beam');
    return true;
  }
  if (round.skill !== 'eq.sign.same-as' || round.look !== 'objects' || !Number.isInteger(value)) return false;
  const pile = put(host, 'bl-pile');
  pile.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < value; i++) pile.append(document.createElement('i'));
  return true;
}
