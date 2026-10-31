// The equation row (design 6.4, R7): tokens left to right; each '?' is a cover over its answer.

const SOFT = new Set(['+', '−']);

/** @type {(className: string, text?: string) => HTMLSpanElement} */
const span = (className, text) => Object.assign(document.createElement('span'), { className }, text === undefined ? {} : { textContent: text });

/**
 * Draws the equation into host. The answer is drawn from the start in .eq-answer, hidden until
 * the screen has data-solved (and from screen readers until solved: see solveEquation); the
 * k-th '?' shows the k-th number of an array answer. The row is one atomic polite live region per
 * round: a redraw (setEquation) refills the row already there, as the solve does, so a reader says
 * the whole new row; a live region put in already filled is not reliably read (design 6.4).
 * @param {HTMLElement} host
 * @param {Equation | null} equation
 * @param {unknown} answer
 * @param {(mark?: string) => HTMLElement} makeCover the cover maker, lib/cover.js
 * @returns {{ row: HTMLElement, covers: HTMLElement[] }}
 */
export function drawEquation(host, equation, answer, makeCover) {
  const old = host.querySelector(':scope > p.eq');
  const row = old instanceof HTMLParagraphElement ? old : document.createElement('p');
  row.className = 'eq';
  row.dir = 'ltr';
  row.dataset.math = '';
  row.removeAttribute('style');
  row.removeAttribute('aria-busy');
  row.setAttribute('aria-live', 'polite');
  row.setAttribute('aria-atomic', 'true');
  /** @type {Node[]} */
  const nodes = [];
  const answers = Array.isArray(answer) ? answer : [answer];
  /** @type {HTMLElement[]} */
  const covers = [];
  /** @param {Token[]} tokens */
  const side = (tokens) => {
    for (const token of tokens) {
      if (token !== '?') {
        nodes.push(span(SOFT.has(String(token)) ? 'eq-op' : 'eq-term', String(token)));
        continue;
      }
      const [slot, lid] = [span('eq-slot'), makeCover('?')];
      const value = span('eq-answer', String(answers[covers.length]));
      value.setAttribute('aria-hidden', 'true');
      slot.append(value, lid);
      covers.push(lid);
      nodes.push(slot);
    }
  };
  if (equation) {
    side(equation.left);
    nodes.push(span('eq-term', '='));
    side(equation.right);
  }
  row.replaceChildren(...nodes);
  if (row !== old) host.replaceChildren(row);
  return { row, covers };
}

/**
 * Solves the row: the covers lift and leave the accessibility tree, and each answer is put back
 * as a new node; the row is atomic, so the polite live region says the whole solved equation (design 6.4).
 * @param {{ row: HTMLElement, covers: HTMLElement[] }} eq
 */
export function solveEquation({ row, covers }) {
  for (const lid of covers) {
    lid.classList.add('is-lifted');
    lid.setAttribute('aria-hidden', 'true');
  }
  for (const answer of row.querySelectorAll('.eq-answer')) answer.replaceWith(span('eq-answer', answer.textContent));
}

/**
 * Builds the row with a story's event (architecture 2.4): only the listed tokens show, by index in
 * [...left, '=', ...right]; every other one keeps its place, hidden (.is-unbuilt), so the row,
 * measured once, never reflows, and the row is aria-busy while one is hidden, so the live region
 * never reads half an exercise. null shows every token. An index that is no token throws.
 * @param {HTMLElement} row
 * @param {number[] | null} indices
 */
export function buildEquation(row, indices) {
  const tokens = [...row.children];
  const bad = (indices ?? []).filter((i) => !(Number.isInteger(i) && i >= 0 && i < tokens.length));
  if (bad.length) throw new RangeError(`build: ${bad.join(', ')} is no token of the row (it has ${tokens.length})`);
  const shown = indices ? new Set(indices) : null;
  tokens.forEach((token, i) => token.classList.toggle('is-unbuilt', shown !== null && !shown.has(i)));
  if (shown && tokens.some((_, i) => !shown.has(i))) row.setAttribute('aria-busy', 'true');
  else row.removeAttribute('aria-busy');
}

/**
 * Shrinks a row wider than its box by 4px steps down to 28px, then lets it wrap (design 6.4).
 * @param {HTMLElement} row
 */
export function fitEquation(row) {
  row.style.fontSize = '';
  row.classList.remove('is-wrapped');
  let size = parseFloat(getComputedStyle(row).fontSize);
  while (row.scrollWidth > row.clientWidth && size > 28) {
    size = Math.max(28, size - 4);
    row.style.fontSize = `${size}px`;
  }
  row.classList.toggle('is-wrapped', row.scrollWidth > row.clientWidth);
}
