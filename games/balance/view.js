// The balance on screen (architecture 2.4; design 6.8-6.9, 7). Waits go through settle().
import { cover } from '../../lib/cover.js';
import { settle } from '../../lib/settle.js';
import { LINE, at, drawBalance, drawRows, el, ghostSlots, layoutPan, panLayer, ringPieces, rowsFor } from './stage.js';

/** @typedef {'left' | 'right'} Side */
/** @typedef {import('./stage.js').PanGroup} PanGroup */
/** @typedef {[HTMLElement, number][]} Steps a tour: the element and its digit */

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

/**
 * The groups on each side: same-as leaves the right pan empty, the others cover the unknown, a
 * judging round's pans hold the true card once chosen.
 * @param {Round} round
 * @param {boolean} solved
 * @returns {Record<Side, PanGroup[]>}
 */
function sidesOf(round, solved) {
  if (round.model === 'cards') {
    const numbers = (tokens, role) => (solved ? tokens.filter((t) => typeof t === 'number').map((count) => ({ role, count })) : []);
    return { left: numbers(round.answer.left, 'whole'), right: numbers(round.answer.right, 'part') };
  }
  const cover = round.unknown !== 'result-right' && !solved;
  /** @type {(name: Side) => PanGroup[]} */
  const side = (name) => groupsOf(round).filter((g) => g.side === name).map((g) => ({ role: g.role, count: g.count, cover: cover && g.role === 'unknown' }));
  return { left: side('left'), right: side('right') };
}

/**
 * The balance (models balance and cards): what a display, the hint and the tour draw.
 * @param {HTMLElement} host
 * @param {Round} round
 * @param {boolean} solved
 * @param {AbortSignal} signal
 */
function balanceScene(host, round, solved, signal) {
  const judging = round.model === 'cards';
  const data = sidesOf(round, solved);
  const restTilt = solved ? 'level' : tiltOf(weight(data.left), weight(data.right));
  const restRows = Math.max(rowsFor(layoutPan(data.left).slots), rowsFor(layoutPan(data.right).slots));
  const d = drawBalance(host, { ...data, tilt: restTilt, rows: restRows }, cover);
  const { scene, pans } = d;
  scene.toggleAttribute('data-judge', judging);
  /** @type {Side} the unknown's side, and k the other */
  const u = data.left.some((g) => g.role === 'unknown') ? 'left' : 'right';
  const k = u === 'left' ? 'right' : 'left';
  const ui = data[u].findIndex((g) => g.role === 'unknown');
  const span = pans[u].layout.spans[ui];
  /** @type {(side: Side, group: number) => HTMLElement[]} */
  const cubesOf = (side, group) => pans[side].cubes.filter((_, i) => pans[side].layout.cubes[i].group === group);
  const tilt = (to, rows = restRows) => {
    scene.dataset.tilt = to;
    scene.style.setProperty('--rows', String(rows));
  };
  /** @type {(stack: Element, start: number, length: number, className: string) => HTMLElement[]} */
  const rings = (stack, start, length, className) => ringPieces(start, length).map((box) => put(stack, `bl-ring ${className}`, box));
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
      Object.assign(pans[side], { layout, cubes: stagger(layout.cubes.map((spot) => put(pans[side].stack, 'bl-cube is-entering', spot))) });
      layout.cubes.forEach((spot, i) => { pans[side].cubes[i].dataset.role = spot.role; });
    }
  };

  return {
    stage: d.stage,
    scene,
    lids: () => [...pans.left.lids, ...pans.right.lids],
    unknowns: () => (ui < 0 ? [] : cubesOf(u, ui)),
    rest: (closed = false) => tilt(closed ? 'level' : restTilt),
    close: () => judging && layCard(),
    /**
     * What a wrong choice says (design 7.1, 7.3), in a layer [data-display].
     * @param {string} display
     * @param {any} value
     * @param {string} rule
     * @param {() => void} lift
     */
    show(display, value, rule, lift) {
      const layer = panLayer(scene);
      layer.el.dataset.display = display;
      if (judging) {
        // The card goes up on the balance as ghosts.
        const [left, right] = [total(value.left), total(value.right)];
        ghosts(layer.left, ghostSlots(layoutPan([]), -1, left));
        ghosts(layer.right, ghostSlots(layoutPan([]), -1, right));
        scene.classList.add('is-weighing');
        tilt(tiltOf(left, right), Math.max(restRows, rowsFor(left), rowsFor(right)));
      } else if (display === 'flash') {
        // The number is on a pan already: it blinks once and keeps a ring.
        const target = [u, k].flatMap((side) => data[side].map((g, i) => ({ g, i, side })))
          .find(({ g }) => g.role === (rule === 'given.whole' ? 'whole' : 'part'));
        for (const cube of cubesOf(target.side, target.i)) cube.classList.add('is-flash');
        const { start, length } = pans[target.side].layout.spans[target.i];
        rings(layer[target.side], start, length, 'is-wrong');
      } else if (display === 'empty-plate') {
        lift();
        put(layer[u], 'bl-zero is-wrong', at(span.start), 0);
      } else if (display === 'jumps') {
        // Counting on with the start counted: from the first part's last cube, one short.
        const { layout } = pans[k];
        const first = data[k][0].count;
        const second = layout.spans[1];
        const path = Array.from({ length: Math.max(second.length + 1, value - first + 1) }, (_, j) => second.start - 1 + j);
        const steps = path.slice(0, value - first + 1);
        stagger(steps.map((slot, j) => {
          if (j > 0 && at(steps[j - 1]).row === at(slot).row) put(layer[k], 'bl-arc', at(steps[j - 1]));
          if (slot >= layout.slots) put(layer[k], 'bl-cube bl-ghost', at(slot));
          return put(layer[k], 'bl-mark', at(slot), first + j);
        }));
        const missed = path.slice(steps.length).filter((slot) => slot < layout.slots);
        if (missed.length) rings(layer[k], missed[0], missed.length, 'is-wrong is-late');
      } else {
        // overflow, balance: ghosts in the unknown's pan; every cube weighs.
        lift();
        const slots = ghostSlots(pans[u].layout, ui, value);
        ghosts(layer[u], slots);
        const mine = weight(data[u].filter((g) => g.role !== 'unknown')) + value;
        scene.classList.add('is-weighing');
        tilt(u === 'left' ? tiltOf(mine, weight(data[k])) : tiltOf(weight(data[k]), mine), Math.max(restRows, rowsFor(Math.max(0, ...slots) + 1)));
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
        for (let j = 0; j < data[u][ui].count; j++) put(layer[u], 'bl-dash', at(span.start + j));
      } else if (round.skill === 'eq.sign.both-sides') {
        // "7 | 7": how many on each side.
        chip([all('left')], 'left', layer.el);
        chip([all('right')], 'right', layer.el);
      } else if (round.skill === 'eq.sign.relational') {
        // Cubes change group; what is left matches the cover.
        const a = data[k][0].count;
        const c = data[u].find((g) => g.role !== 'unknown').count;
        for (let slot = Math.min(a, c); slot < Math.max(a, c); slot++) pans[k].cubes.find((_, i) => pans[k].layout.cubes[i].slot === slot)?.classList.add('is-hop');
        rings(layer[k], c, pans[k].layout.slots - c, 'is-hint');
        rings(layer[u], span.start, span.length, 'is-hint');
      }
      // eq.sign.true-false: each card's small balance shows (game.css).
      return layer;
    },
    /**
     * Step 3 (R5, design 7.2): the tour's steps and the ring after it.
     * @param {{ el: HTMLElement, left: HTMLElement, right: HTMLElement }} layer the hint's
     * @returns {{ steps: Steps, pace: number, ring: () => HTMLElement[] }}
     */
    tour(layer) {
      if (judging) layCard();
      if (round.unknown === 'result-right') tilt('level');
      if (judging) {
        // Both sides counted together, pair by pair.
        const right = pans.right.cubes;
        return { steps: pans.left.cubes.flatMap((c, j) => [[c, j + 1], [right[j], j + 1]]), pace: 2, ring: () => rings(layer.right, 0, right.length, 'is-tour') };
      }
      if (round.unknown === 'result-right' || round.unknown === 'result-left') {
        // The unknown is the whole: count on from the first part.
        const first = data[k][0].count;
        return { steps: cubesOf(k, 1).map((c, j) => [c, first + j + 1]), pace: 1, ring: () => rings(layer[k], 0, pans[k].layout.slots, 'is-tour') };
      }
      const steps = /** @type {Steps} */ (cubesOf(u, ui).map((c, j) => [c, j + 1]));
      if (!steps.length) {
        // Nothing under the cover: a ring with 0.
        const zero = put(layer[u], 'bl-zero is-tour', at(span.start), 0);
        zero.dataset.tour = '0';
      }
      return { steps, pace: 1, ring: () => (steps.length ? rings(layer[u], span.start, span.length, 'is-tour') : []) };
    },
    /** @param {Hand} hand */
    async demo(hand) {
      if (judging) return;
      if (round.unknown === 'result-right') {
        await hand.tap(pans.left.stack);
        if (!signal.aborted) await hand.tap(pans.right.el.querySelector('.bl-bowl'));
      } else await hand.tap(pans[u].lids[0]);
    },
  };
}

/**
 * The turned rows (eq.props.commutative, model set).
 * @param {HTMLElement} host
 * @param {Round} round
 * @param {boolean} solved
 */
function rowsScene(host, round, solved) {
  const data = sidesOf(round, solved);
  const d = drawRows(host, { ...data, rows: 1 }, cover);
  const { scene, lines } = d;
  const restLen = scene.style.getPropertyValue('--len');
  const ui = data.right.findIndex((g) => g.role === 'unknown');
  const unknowns = () => lines.right.dots.filter((_, i) => lines.right.layout.dots[i].group === ui);
  const block = lines.right.layout.blocks[ui];
  const answer = data.right[ui].count;
  /** @type {(j: number) => { x: number, y: number }} the j-th place of the unknown's block, rows of five */
  const place = (j) => ({ x: block.x + (j % 5), y: LINE + Math.floor(j / 5) });
  /** @type {(layer: Element, from: number, to: number, className: string) => void} rings, a row at a time */
  const rings = (layer, from, to, className) => {
    for (let j = from; j < to; j = Math.floor(j / 5) * 5 + 5) put(layer, `bl-ring ${className}`, { ...place(j), w: Math.min(to, Math.floor(j / 5) * 5 + 5) - j });
  };
  const layer = () => put(scene, 'bl-layer');
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
    /** balance: ghosts in the turned row; what does not fit keeps a ring. */
    show(display, value, rule, lift) {
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
      const root = layer();
      root.dataset.hint = '';
      const copy = put(root, 'bl-turn', { x: 0, y: 0, w: lines.left.layout.length });
      for (const dot of lines.left.layout.dots) put(copy, 'bl-dot bl-copy', { x: dot.x, y: 0 });
      const twin = lines.left.layout.blocks.find((b) => b.count === answer);
      put(root, 'bl-ring is-hint', { x: twin.x, y: 0, w: answer });
      put(root, 'bl-ring is-hint', { ...place(0), w: answer });
      return { el: root, left: root, right: root };
    },
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
 * In symbols look the picture waits for picture(), but a thumb draws it.
 * @param {HTMLElement} host
 * @param {Round} round
 * @param {RenderContext} ctx
 * @returns {RoundView}
 */
export function renderBalance(host, round, { signal, mode, solved }) {
  /** @type {ReturnType<typeof balanceScene>} */
  let s = null;
  /** @type {ReturnType<ReturnType<typeof balanceScene>['hint']> | null} */
  let hint = null;
  const draw = (asSolved) => {
    s = round.model === 'set' ? /** @type {any} */ (rowsScene(host, round, asSolved)) : balanceScene(host, round, asSolved, signal);
    // A thumb: the stage at a phone's size, scaled into its host.
    if (mode !== 'thumb') return;
    s.stage.classList.add('is-thumb');
    s.stage.style.setProperty('--k', String(Math.min(host.clientWidth / 316, host.clientHeight / 186)));
  };
  if (round.look !== 'symbols' || mode === 'thumb') draw(mode === 'thumb' && solved);
  const lift = () => {
    for (const lid of s.lids()) {
      lid.classList.remove('is-back');
      lid.firstElementChild?.classList.add('is-lifted');
    }
    s.scene.classList.add('is-open');
  };
  /** Clears a display; the lids come back (moving when `back`). */
  const clear = (back) => {
    s.scene.querySelectorAll('.is-flash').forEach((n) => n.classList.remove('is-flash'));
    for (const lid of s.lids()) {
      const up = lid.firstElementChild?.classList.contains('is-lifted');
      lid.firstElementChild?.classList.remove('is-lifted');
      lid.classList.toggle('is-back', Boolean(back && up));
    }
    s.scene.classList.remove('is-open', 'is-weighing');
  };
  return {
    label: labelOf(round),
    picture: () => draw(false),
    async miss({ value, rule, display }, step) {
      if (!s) draw(false);
      // The previous display goes at once; the new one runs (R5, design 7.2).
      s.scene.querySelectorAll('[data-display]').forEach((n) => n.remove());
      clear(false);
      s.scene.classList.add('is-instant');
      s.rest();
      void s.scene.offsetWidth;
      s.scene.classList.remove('is-instant');
      if (step === 1 || !reduced()) {
        const root = s.show(display, value, rule, lift);
        await settle(s.scene, signal);
        if (step >= 2 && !signal.aborted) {
          // Then its ghosts leave: the start picture, cover included, gets the hint.
          root.classList.add('is-leaving');
          clear(true);
          s.rest();
          await settle(s.scene, signal);
          if (!signal.aborted) root.remove();
        }
      }
      if (signal.aborted) return;
      hint ??= step >= 2 ? s.hint() : null;
      if (step < 3) return;
      lift();
      for (const n of s.unknowns()) n.classList.add('is-shown');
      const { steps, pace, ring } = s.tour(hint);
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
    },
    async solve() {
      if (!s) return;
      s.scene.querySelectorAll('[data-display]').forEach((n) => n.remove());
      clear(false);
      s.close();
      lift();
      stagger(s.unknowns().filter((n) => !n.classList.contains('is-shown'))).forEach((n) => n.classList.add('is-entering'));
      s.rest(true);
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
