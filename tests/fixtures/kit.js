// What the two fixture games share: choosing tagged wrong answers, and a plain drawing of groups
// with the shell's cover. Test code: real games keep their own helpers in their own folders.
import { cover } from '../../lib/cover.js';
import { settle } from '../../lib/settle.js';

/**
 * The choices of a round: the answer, then one wrong value per rule in the skill's order (real
 * errors first, slips only on values no real error predicts), each value once; ascending.
 * @param {Round} round
 * @param {number} options
 * @param {Record<string, (round: Round) => any>} rules
 * @param {string[]} order the skill's rule order (skills.md), limited to the game's rules
 * @returns {Choice[]}
 */
export function choose(round, options, rules, order) {
  const taken = [round.answer];
  const wrong = [];
  const predicted = order.filter((id) => !id.startsWith('slip.')).map((id) => rules[id](round));
  for (const id of order) {
    if (wrong.length === options - 1) break;
    const value = rules[id](round);
    const candidates = value !== null && typeof value === 'object' ? value.oneOf : [value];
    const ok = (v) => Number.isInteger(v) && v >= 0 && !taken.includes(v) && (!id.startsWith('slip.') || !predicted.includes(v));
    const pick = candidates.find(ok);
    if (pick === undefined) continue;
    taken.push(pick);
    wrong.push({ value: pick, rule: id });
  }
  return [{ value: round.answer, rule: null }, ...wrong].sort((a, b) => a.value - b.value);
}

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
 * cover over the unknown (none when solved).
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
  host.replaceChildren(row);
}

/**
 * The fixture's render: the picture (the help picture in symbols look, after view.picture()),
 * a ghost row per display, a ring as the hint, and a tour on the unknown that ends in the answer.
 * @param {HTMLElement} host
 * @param {Round} round
 * @param {RenderContext} ctx
 * @param {string} label
 * @returns {RoundView}
 */
export function render(host, round, { signal, mode, solved }, label) {
  const groups = round.look === 'symbols' ? round.helpPicture : round.picture;
  if (round.look !== 'symbols' || mode === 'thumb') drawGroups(host, groups, solved);
  const unknown = () => host.querySelector('.fx-unknown');
  return {
    label,
    picture: () => drawGroups(host, groups, false),
    async miss({ value, display }, step) {
      host.querySelector('[data-display]')?.remove();
      const shown = el('div', 'fx-display');
      shown.dataset.display = display;
      for (let i = 0; i < Math.min(Number(value) || 0, 20); i++) shown.append(el('span', 'fx-ghost'));
      host.append(shown);
      await settle(shown, signal);
      if (step >= 2 && !signal.aborted && !host.querySelector('[data-hint]')) {
        const hint = el('span', 'fx-hint');
        hint.dataset.hint = '';
        unknown().append(hint);
        await settle(hint, signal);
      }
      if (step < 3 || signal.aborted) return;
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
      const lid = host.querySelector('.cover');
      lid?.classList.add('is-lifted');
      await settle(lid, signal);
    },
    async demo(hand) {
      await hand.tap(unknown() ?? host);
    },
  };
}
