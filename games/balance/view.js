// The balance on screen (architecture 2.4; design 6.8-6.9, 7). Waits go through settle().
import { cover } from '../../lib/cover.js';
import { settle } from '../../lib/settle.js';
import { LINE, at, drawBalance, drawRows, el, ghostSlots, layoutPan, panLayer, ringPieces, rowsFor, runsOf } from './stage.js';

/** @typedef {'left' | 'right'} Side */
/** @typedef {import('./stage.js').PanGroup} PanGroup */
/** @typedef {import('./stage.js').Run} Run */
/** @typedef {[HTMLElement, number][]} Steps a tour: the element and its digit */
/** @typedef {{ el: HTMLElement, left: HTMLElement, right: HTMLElement }} Layer an overlay with a stack per pan (panLayer) */
/** @typedef {{ steps: Steps, pace: number, ring: () => HTMLElement[] }} Tour digits `pace` at a time, then the ring */
/**
 * What renderBalance asks of a picture: the balance (balanceScene) or the turned rows (rowsScene).
 * @typedef {object} Scene
 * @property {HTMLElement} stage
 * @property {HTMLElement} scene
 * @property {() => HTMLElement[]} lids the cover's pieces
 * @property {() => HTMLElement[]} unknowns the unknown's cubes or dots
 * @property {(closed?: boolean, animate?: boolean) => void} rest back to the start picture (level once closed)
 * @property {() => void} close the closing's own part (judging: the true card's cubes)
 * @property {() => void} intro on mount, in play and demo
 * @property {(display: string, value: any, rule: string, lift: () => void) => Promise<HTMLElement>} show a display (step 1)
 * @property {() => Layer} hint step 2, kept to the end of the round
 * @property {(hint: Layer) => Tour} tour step 3
 * @property {(hand: Hand) => Promise<void>} demo
 */

const reduced = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
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

// The picture's description (design 6.3): locked templates with nikud.
const WORDS = {
  balance: 'מֹאזְנַיִם', versus: 'מוּל', cover: 'מִכְסֶה', empty: 'כַּף רֵיקָה', emptyScale: 'מֹאזְנַיִם רֵיקִים',
  cube: 'קֻבִּיָּה אַחַת', cubes: 'קֻבִּיּוֹת', dot: 'נְקֻדָּה אַחַת', dots: 'נְקֻדּוֹת', rows: 'שְׁתֵּי שׁוּרוֹת',
};

/** @type {(round: Round) => string} */
function labelOf(round) {
  if (round.model === 'cards') return WORDS.emptyScale;
  const set = round.model === 'set';
  const side = (name) => groupsOf(round).filter((g) => g.side === name).map((g) => {
    if (g.role === 'unknown') return round.unknown === 'result-right' ? WORDS.empty : WORDS.cover;
    const [one, many] = set ? [WORDS.dot, WORDS.dots] : [WORDS.cube, WORDS.cubes];
    return g.count === 1 ? one : `${g.count} ${many}`;
  }).join(', ');
  return `${set ? WORDS.rows : WORDS.balance}: ${side('left')} ${WORDS.versus} ${side('right')}`;
}

/** @type {(tokens: any[], role: string) => PanGroup[]} a card side's numbers, a pile each */
const piles = (tokens, role) => tokens.filter((t) => typeof t === 'number').map((count, i) => ({ role, count, fresh: i > 0 }));

/**
 * The groups on each side: same-as leaves the right pan empty, the others cover the unknown, a
 * judging round's pans hold the true card once chosen. A known number after another starts a
 * row (its own pile); `? = a + b` covers places in the shape of a and b.
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
  /** @type {(name: Side) => PanGroup[]} */
  const side = (name) => {
    const mine = all.filter((g) => g.side === name);
    const shape = round.unknown === 'result-left' ? all.filter((g) => g.side !== name).map((g) => g.count) : [];
    return mine.map((g, i) => ({
      role: g.role, count: g.count, cover: round.unknown !== 'result-right' && !solved && g.role === 'unknown',
      fresh: i > 0 && g.role !== 'unknown' && mine[i - 1].role !== 'unknown',
      ...(g.role === 'unknown' && shape.length > 1 && { blocks: shape }),
    }));
  };
  return { left: side('left'), right: side('right') };
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
  const rowsOf = (a, b) => Math.max(rowsFor(a.slots), rowsFor(b.slots));
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
  /** @type {(stack: Element, runs: Run[], className: string) => HTMLElement[]} rings over runs of places, a box per row */
  const rings = (stack, runs, className) => runs.flatMap((r) => ringPieces(r.start, r.length)).map((box) => put(stack, `bl-ring ${className}`, box));
  /** @type {(stack: Element, slots: number[]) => HTMLElement[]} */
  const ghosts = (stack, slots) => stagger(slots.map((slot) => put(stack, 'bl-cube bl-ghost', at(slot))));
  /** @type {(tokens: (string | number)[], side: Side, layer: Element) => void} a chip under a pan (design 6.8) */
  const chip = (tokens, side, layer) => {
    const node = put(layer, 'bl-chip');
    node.dataset.pan = side;
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
      pans[side].cubes = stagger(layout.cubes.map((spot) => put(pans[side].stack, 'bl-cube is-entering', spot)));
      layout.cubes.forEach((spot, i) => { pans[side].cubes[i].dataset.role = spot.role; });
    }
    tilt(scene.dataset.tilt);
  };
  // eq.sign.relational, a + b = c + ?: cubes change group in a + b (depth 4.9). d is c - a.
  const moving = round.skill === 'eq.sign.relational' && { a: cubesOf(k, 0), b: cubesOf(k, 1), d: data[u][0].count - data[k][0].count };
  let hinted = 0; // cubes the hint moved; they stay moved to the end of the round
  /**
   * Moves n cubes from the second group to the end of the first (n < 0: from the first back to
   * the second), and lays both out again. With `animate` they slide there (FLIP), unless motion is
   * reduced.
   * @param {number} n
   * @param {boolean} [animate]
   */
  const shift = (n, animate) => {
    if (!moving) return;
    const { a, b } = moving;
    const first = n >= 0 ? [...a, ...b.slice(b.length - n)] : a.slice(0, a.length + n);
    const second = n >= 0 ? b.slice(0, b.length - n) : [...b, ...a.slice(a.length + n)];
    const layout = layoutPan([{ role: 'part', count: first.length }, { role: 'part', count: second.length, fresh: true }]);
    const cubes = [...first, ...second];
    const slide = animate && !reduced();
    const before = cubes.map((c) => slide && c.getBoundingClientRect());
    cubes.forEach((cube, i) => {
      cube.style.setProperty('--c', String(layout.cubes[i].col));
      cube.style.setProperty('--r', String(layout.cubes[i].row));
    });
    Object.assign(pans[k], { layout, cubes });
    pans[k].stack.dataset.groups = `${first.length} ${second.length}`;
    if (!slide) return;
    // Each cube starts where it was and slides to its new place, in the design's move time.
    const style = getComputedStyle(scene);
    const timing = { duration: parseFloat(style.getPropertyValue('--t-move')) || 250, easing: style.getPropertyValue('--ease').trim() || 'ease' };
    cubes.forEach((cube, i) => {
      const after = cube.getBoundingClientRect();
      const [x, y] = [before[i].left - after.left, before[i].top - after.top];
      if (Math.abs(x) + Math.abs(y) > 0.5) cube.animate([{ transform: `translate(${x}px, ${y}px)` }, { transform: 'none' }], timing);
    });
  };
  shift(0);

  return {
    stage: d.stage,
    scene,
    lids: () => [...pans.left.lids, ...pans.right.lids],
    unknowns: () => (ui < 0 ? [] : cubesOf(u, ui)),
    /** The start picture (level once closed); cubes the hint moved stay moved. */
    rest: (closed = false, animate = false) => {
      shift(hinted, animate);
      tilt(closed ? 'level' : restTilt);
    },
    close: () => judging && layCard(),
    intro: () => {},
    /**
     * What a wrong choice says (design 7.1, 7.3), in a layer [data-display].
     * @param {string} display
     * @param {any} value
     * @param {string} rule
     * @param {() => void} lift
     */
    async show(display, value, rule, lift) {
      const layer = panLayer(scene);
      layer.el.dataset.display = display;
      if (judging) {
        // The card goes up on the balance as ghosts, a pile per number.
        const pile = (tokens) => layoutPan(piles(tokens, '')).cubes.map((c) => c.slot);
        const [left, right] = [pile(value.left), pile(value.right)];
        ghosts(layer.left, left);
        ghosts(layer.right, right);
        scene.classList.add('is-weighing');
        tilt(tiltOf(total(value.left), total(value.right)), Math.max(rowsNow(), rowsFor(Math.max(0, ...left, ...right) + 1)));
      } else if (display === 'flash') {
        // The number is on a pan already: it blinks once and keeps a ring.
        const target = [u, k].flatMap((side) => data[side].map((g, i) => ({ g, i, side })))
          .find(({ g }) => g.role === (rule === 'given.whole' ? 'whole' : 'part'));
        for (const cube of cubesOf(target.side, target.i)) cube.classList.add('is-flash');
        rings(layer[target.side], pans[target.side].layout.spans[target.i].runs, 'is-wrong');
      } else if (display === 'empty-plate') {
        lift();
        put(layer[u], 'bl-zero is-wrong', at(span.places[0]), 0);
      } else if (display === 'jumps') {
        // Counting on with the start counted (? = a + b): from a's last cube, one short; the
        // places it missed keep a ring.
        const { layout } = pans[k];
        const first = data[k][0].count;
        const path = [layout.spans[0].places.at(-1), ...layout.spans[1].places];
        while (path.length <= value - first) path.push(layout.slots + path.length - layout.spans[1].places.length - 1);
        const steps = path.slice(0, value - first + 1);
        stagger(steps.map((slot, j) => {
          if (slot === steps[j - 1] + 1 && slot % 5) put(layer[k], 'bl-arc', at(slot - 1));
          if (slot >= layout.slots) put(layer[k], 'bl-cube bl-ghost', at(slot));
          return put(layer[k], 'bl-mark', at(slot), first + j);
        }));
        rings(layer[k], runsOf(path.slice(steps.length).filter((slot) => slot < layout.slots)), 'is-wrong is-late');
      } else {
        // overflow, balance: ghosts in the unknown's pan.
        if (rule === 'equal.compensate-wrong' && moving) {
          // The cube goes the wrong way: the second group is the choice.
          shift(-moving.d, true);
          tilt(restTilt);
          await settle(pans[k].stack, signal);
          if (signal.aborted) return layer.el;
        } else scene.classList.add('is-weighing');
        // Ghosts in the unknown's places, then on after the pan's last; every cube weighs.
        lift();
        const slots = ghostSlots(pans[u].layout, ui, value);
        ghosts(layer[u], slots);
        const mine = weight(data[u].filter((g) => g.role !== 'unknown')) + value;
        tilt(u === 'left' ? tiltOf(mine, weight(data[k])) : tiltOf(weight(data[k]), mine), Math.max(rowsNow(), rowsFor(Math.max(0, ...slots) + 1)));
      }
      return layer.el;
    },
    /** Step 2: the skill's hint (depth 4.9), kept to the end of the round. */
    hint() {
      const layer = panLayer(scene);
      layer.el.dataset.hint = '';
      if (round.skill === 'eq.sign.same-as') {
        chip([all('left')], 'left', layer.el);
        chip(['?'], 'right', layer.el);
      } else if (round.skill === 'eq.sign.missing') {
        // How many on each pan; the cover shows the missing cubes' outline.
        chip(groups('left'), 'left', layer.el);
        chip(groups('right'), 'right', layer.el);
        for (const slot of span.places.slice(0, data[u][ui].count)) put(layer[u], 'bl-dash', at(slot));
      } else if (round.skill === 'eq.sign.both-sides') {
        // "7 | 7": how many on each side.
        chip([all('left')], 'left', layer.el);
        chip([all('right')], 'right', layer.el);
      } else if (moving) {
        // Cubes change group: a becomes c and the beam is level; what is left of b faces the
        // cover. Rings in the colours of the roles they mark (design 7.2).
        shift(hinted = moving.d, true);
        tilt(restTilt);
        rings(layer[k], pans[k].layout.spans[1].runs, 'is-hint is-part is-late');
        rings(layer[u], span.runs, 'is-hint is-late');
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
        return { steps: pans.left.cubes.flatMap((c, j) => [[c, j + 1], [right[j], j + 1]]), pace: 2, ring: () => rings(layer.right, cubeRuns('right'), 'is-tour') };
      }
      const first = data[k][0]?.count;
      if (round.unknown === 'result-left') {
        // The unknown is the whole: counting on over what was covered, a + 1 to a + b.
        return { steps: cubesOf(u, ui).slice(first).map((c, j) => [c, first + j + 1]), pace: 1, ring: () => rings(layer[u], span.runs, 'is-tour') };
      }
      if (round.unknown === 'result-right') {
        // same-as: counting on from the left's first group over its second.
        tilt('level');
        return { steps: cubesOf(k, 1).map((c, j) => [c, first + j + 1]), pace: 1, ring: () => rings(layer[k], cubeRuns(k), 'is-tour') };
      }
      const steps = /** @type {Steps} */ (cubesOf(u, ui).map((c, j) => [c, j + 1]));
      // Nothing under the cover: a ring with 0.
      if (!steps.length) put(layer[u], 'bl-zero is-tour', at(span.places[0]), 0).dataset.tour = '0';
      return { steps, pace: 1, ring: () => (steps.length ? rings(layer[u], span.runs, 'is-tour') : []) };
    },
    /** @param {Hand} hand */
    async demo(hand) {
      if (judging) return;
      if (round.unknown !== 'result-right') return hand.tap(pans[u].lids[0]);
      await hand.tap(pans.left.stack);
      if (!signal.aborted) await hand.tap(pans.right.el.querySelector('.bl-bowl'));
    },
  };
}

/**
 * The turned rows (eq.props.commutative, model set).
 * @param {HTMLElement} host
 * @param {Round} round
 * @param {boolean} solved
 * @returns {Scene}
 */
function rowsScene(host, round, solved) {
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
    for (const dot of lines.left.layout.dots) put(root, 'bl-dot bl-twin', dot).dataset.role = dot.role;
    return root;
  };
  /** @type {(len: number | string, rows: number) => void} the set's size in cells */
  const size = (len, rows) => {
    scene.style.setProperty('--len', String(len));
    scene.style.setProperty('--rows', String(rows));
  };
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
     * balance: ghosts in the turned row; what does not fit keeps a ring.
     * @param {string} display
     * @param {number} value
     * @param {string} rule
     * @param {() => void} lift
     */
    async show(display, value, rule, lift) {
      const root = layer();
      root.dataset.display = display;
      lift();
      stagger(Array.from({ length: value }, (_, j) => put(root, 'bl-dot bl-ghost', place(j))));
      rings(root, Math.min(value, answer), Math.max(value, answer), 'is-wrong is-late');
      const width = lines.right.layout.length - Math.min(5, answer) + Math.min(5, Math.max(value, answer));
      size(Math.max(Number(restLen), width), Math.max(1, Math.ceil(value / 5)));
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
    /** @param {Hand} hand */
    async demo(hand) {
      await hand.tap(d.lids[0]);
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
    s.stage.style.setProperty('--k', String(Math.min(host.clientWidth / 316, host.clientHeight / 186)));
  };
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
   * @param {{ value: any, rule: string, display: string }} choice
   * @param {number} step
   */
  const missed = async ({ value, rule, display }, step) => {
    if (!s) draw(false);
    // The previous display goes at once; the new one runs (R5, design 7.2).
    clear(false);
    s.scene.classList.add('is-instant');
    s.rest();
    void s.scene.offsetWidth;
    s.scene.classList.remove('is-instant');
    // A first miss keeps its display to the next tap: step 1, or step 2 on a 3-option level,
    // where the hint joins it (architecture 2.5 step 4). A later miss's display runs and leaves,
    // so the start picture, cover included, gets the hint; with reduced motion it is skipped.
    const first = step === 1 || (step === 2 && round.choices.length === 3);
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
        s.rest(false, true);
        const back = settle(s.scene, signal).then(() => { if (!signal.aborted) root.remove(); });
        if (step < 3) return;
        await back;
      }
    }
    if (signal.aborted) return;
    hint ??= step >= 2 ? s.hint() : null;
    if (step < 3) return;
    // Step 3, the tour: the unknown shows, and each digit is written in turn (R5).
    lift();
    for (const n of s.unknowns()) n.classList.add('is-shown');
    const { steps, pace, ring } = s.tour(hint);
    countable();   // a judging round's true card is on the pans now
    await settle(s.scene, signal);
    for (let j = 0; j < steps.length && !signal.aborted; j += pace) {
      const digits = steps.slice(j, j + pace).map(([target, n]) => {
        const last = j + pace >= steps.length ? ' is-last' : '';
        const digit = put(target, `bl-digit${target.dataset.role === 'unknown' ? '' : ' on-known'}${last}`, undefined, n);
        digit.dataset.tour = String(n);
        return digit;
      });
      await Promise.all(digits.map((digit) => settle(digit, signal)));
    }
    if (!signal.aborted) await Promise.all(ring().map((r) => settle(r, signal)));
  };
  return {
    label: labelOf(round),
    picture: () => draw(false),
    async miss(choice, step) {
      busy = true;
      await missed(choice, step);
      busy = false;
    },
    async solve() {
      busy = true;
      // Judging: the true card is written in the equation row, so the full exercise is on screen (R5).
      if (round.model === 'cards') setEquation(round.answer);
      if (!s) return;
      clear(false);
      s.close();
      lift();
      stagger(s.unknowns().filter((n) => !n.classList.contains('is-shown'))).forEach((n) => n.classList.add('is-entering'));
      s.rest(true, true);
      await settle(s.scene, signal);
    },
    async demo(hand) {
      await s?.demo(hand);
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
