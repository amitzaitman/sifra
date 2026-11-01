// What the two fixture games share: choosing tagged wrong answers, and a plain drawing of groups
// with the shell's cover. Test code: real games keep their own helpers in their own folders.
import { cover } from '../../lib/cover.js';
import { place } from '../../lib/place.js';
import { settle } from '../../lib/settle.js';

/**
 * The choices of a round: the answer, then one wrong value per rule in the skill's order (real
 * errors first, slips only on values no real error predicts), each value once, with the answer's
 * place drawn by the rng (lib/place.js, R4); ascending.
 * @param {Round} round
 * @param {number} options
 * @param {Record<string, (round: Round) => any>} rules
 * @param {string[]} order the skill's rule order (skills.md), limited to the game's rules
 * @param {Rng} rng
 * @returns {Choice[]}
 */
export function choose(round, options, rules, order, rng) {
  const predicted = order.filter((id) => !id.startsWith('slip.')).map((id) => rules[id](round));
  /** @type {(v: number) => 'below' | 'above'} */
  const side = (v) => (v < round.answer ? 'below' : 'above');
  /** @type {(room: { below: number, above: number }, leave: (rule: string, value: any) => boolean) => Choice[]} */
  const deal = (room, leave) => {
    const left = { ...room };
    const taken = [round.answer];
    /** @type {Choice[]} */
    const wrong = [];
    /** @type {any[]} the values of the rules before this one, dealt or not (R4: a tie is the first rule's) */
    const earlier = [];
    for (const id of order) {
      if (wrong.length === options - 1) break;
      const value = rules[id](round);
      const candidates = value !== null && typeof value === 'object' ? value.oneOf : [value];
      const before = [...earlier];
      earlier.push(...candidates);
      const ok = (v) => !leave(id, v) && Number.isInteger(v) && v >= 0 && !taken.includes(v) && !before.includes(v) && (!id.startsWith('slip.') || !predicted.includes(v)) && left[side(v)] > 0;
      const fits = candidates.filter(ok);
      if (!fits.length) continue;
      const pick = fits.length > 1 ? rng.pick(fits) : fits[0];
      left[side(pick)] -= 1;
      taken.push(pick);
      wrong.push({ value: pick, rule: id });
    }
    return wrong;
  };
  /** @type {any[]} what the skill's slips give on this round (lib/place.js) */
  const slips = order.filter((id) => id.startsWith('slip.')).flatMap((id) => { const v = rules[id](round); return v !== null && typeof v === 'object' ? v.oneOf : [v]; });
  const wrong = place(options, deal, (c) => side(c.value) === 'below', rng, (v) => slips.includes(v)) ?? [];
  return [{ value: round.answer, rule: null }, ...wrong].sort((a, b) => a.value - b.value);
}

/** @type {(value: any) => number} the size of a value's ghost row: a number, or a card's left side */
const amount = (value) => (typeof value === 'number' ? value
  : Array.isArray(value?.left) ? value.left.reduce((n, t, i) => (typeof t !== 'number' ? n : value.left[i - 1] === '−' ? n - t : n + t), 0) : 0);

/** @type {(round: Round, role: string) => number} the count of the first group with a role */
export const count = (round, role) => (round.look === 'symbols' ? round.helpPicture : round.picture).find((g) => g.role === role).count;

/**
 * @param {string} tag
 * @param {string} className
 * @param {string} [text]
 */
function el(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Draws groups left to right: dots in rows of five with their role, a chip for a tag, and the
 * cover over the unknown (none when solved). No groups (a judging round): an empty stage.
 * @param {HTMLElement} host
 * @param {Group[]} groups
 * @param {boolean} solved
 */
function drawGroups(host, groups, solved) {
  const row = el('div', 'fx-row');
  row.dir = 'ltr';
  row.dataset.math = '';
  for (const g of groups) {
    const box = el('div', g.shown === 'covered' ? 'fx-group fx-unknown' : 'fx-group');
    if (g.shown === 'tag') box.append(el('span', 'fx-tag', String(g.count)));
    else {
      const dots = el('div', 'fx-dots');
      for (let i = 0; i < Math.max(1, g.count); i++) {
        const dot = el('span', i < g.count ? 'fx-dot' : 'fx-dot fx-empty');
        if (i < g.count) dot.dataset.role = g.role;
        dots.append(dot);
      }
      box.append(dots);
      if (g.shown === 'covered' && !solved) box.append(cover('?'));
    }
    row.append(box);
  }
  if (!groups.length) row.append(el('div', 'fx-stage'));
  host.replaceChildren(row);
}

/**
 * The fixture's render: the picture (the help picture in symbols look, after view.picture()),
 * a ghost row per display (one of the game's displays; any other throws, architecture 2.1), a
 * ring as the hint (not awaited: it does not lock the cards, design 7.2), and a tour on the
 * unknown that ends in the answer (on a judging round, on the stage, to the true card's sum). It
 * checks that the host is in the page. After the solve, picture() draws the solved picture.
 * @param {HTMLElement} host
 * @param {Round} round
 * @param {RenderContext} ctx
 * @param {string} label
 * @param {string[]} displays the game's
 * @returns {RoundView}
 */
export function render(host, round, { signal, mode, solved }, label, displays) {
  if (!host.isConnected) throw new Error('render: the host is not in the page (architecture 2.4)');
  const groups = round.look === 'symbols' ? round.helpPicture : round.picture;
  if (round.look !== 'symbols' || mode === 'thumb') drawGroups(host, groups, solved);
  const unknown = () => host.querySelector('.fx-unknown');
  let closed = false;
  return {
    // Solved, the label names the unknown's count, as a game's does (2.4; the contract, hunt 2 #13).
    get label() {
      const n = groups?.find((g) => g.role === 'unknown')?.count;
      return (closed || (mode === 'thumb' && solved)) && n !== undefined ? `${label}: ${n}` : label;
    },
    // After the solve (symbols look): the solved picture, without the cover.
    picture: () => drawGroups(host, groups, closed),
    async miss({ value, display, step }) {
      if (!displays.includes(display)) throw new Error(`fixture: no drawing for ${display}`);
      host.querySelector('[data-display]')?.remove();
      const shown = el('div', 'fx-display');
      shown.dataset.display = display;
      // A 0 (a slip under an answer of 1, since the answer's place varies): one empty place, so the display shows.
      const n = Math.min(amount(value), 20);
      for (let i = 0; i < Math.max(1, n); i++) shown.append(el('span', n ? 'fx-ghost' : 'fx-ghost fx-empty'));
      host.append(shown);
      await settle(shown, signal);
      if (step >= 2 && !signal.aborted && !host.querySelector('[data-hint]')) {
        const hint = el('span', 'fx-hint');
        hint.dataset.hint = '';
        (unknown() ?? host.firstElementChild).append(hint);
      }
      if (step < 3 || signal.aborted) return;
      if (!unknown()) {
        // A judging round: the tour counts the true card's sum on the stage (both sides weigh the same).
        const stage = host.querySelector('.fx-stage');
        for (let n = 1; n <= amount(round.answer) && !signal.aborted; n++) {
          const digit = el('span', 'fx-tour', String(n));
          digit.dataset.tour = String(n);
          stage?.append(digit);
          await settle(digit, signal);
        }
        return;
      }
      const lid = unknown().querySelector('.cover');
      lid?.classList.add('is-lifted');
      await settle(lid, signal);
      const slots = [...unknown().querySelectorAll('.fx-dot')];
      for (const dot of slots) dot.classList.add('is-shown');
      for (let n = round.answer === 0 ? 0 : 1; n <= round.answer && !signal.aborted; n++) {
        const digit = el('span', 'fx-tour', String(n));
        digit.dataset.tour = String(n);
        slots[Math.max(0, n - 1)].append(digit);
        await settle(digit, signal);
      }
    },
    async solve() {
      closed = true;
      const lid = host.querySelector('.cover');
      lid?.classList.add('is-lifted');
      await settle(lid, signal);
    },
    async demo(hand) {
      await hand.tap(unknown() ?? host);
    },
  };
}
