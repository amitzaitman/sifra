// The equation row (design 6.4, R7): tokens left to right; each '?' is a cover over its answer.

const SOFT = new Set(['+', '−']);

/** @type {(className: string, text?: string) => HTMLSpanElement} */
const span = (className, text) => Object.assign(document.createElement('span'), { className }, text === undefined ? {} : { textContent: text });

/**
 * Draws the equation into host. The answer is drawn from the start in .eq-answer, hidden until
 * the screen has data-solved (and from screen readers until solved: see solveEquation); the
 * k-th '?' shows the k-th number of an array answer.
 * @param {HTMLElement} host
 * @param {Equation | null} equation
 * @param {unknown} answer
 * @param {(mark?: string) => HTMLElement} makeCover the cover maker, lib/cover.js
 * @returns {{ row: HTMLElement, covers: HTMLElement[] }}
 */
export function drawEquation(host, equation, answer, makeCover) {
  const row = document.createElement('p');
  row.className = 'eq';
  row.dir = 'ltr';
  row.dataset.math = '';
  row.setAttribute('aria-live', 'polite');
  const answers = Array.isArray(answer) ? answer : [answer];
  /** @type {HTMLElement[]} */
  const covers = [];
  /** @param {Token[]} tokens */
  const side = (tokens) => {
    for (const token of tokens) {
      if (token !== '?') {
        row.append(span(SOFT.has(String(token)) ? 'eq-op' : 'eq-term', String(token)));
        continue;
      }
      const [slot, lid] = [span('eq-slot'), makeCover('?')];
      const value = span('eq-answer', String(answers[covers.length]));
      value.setAttribute('aria-hidden', 'true');
      slot.append(value, lid);
      covers.push(lid);
      row.append(slot);
    }
  };
  if (equation) {
    side(equation.left);
    row.append(span('eq-term', '='));
    side(equation.right);
  }
  host.replaceChildren(row);
  return { row, covers };
}

/**
 * Solves the row: the covers lift and leave the accessibility tree, and each answer is put back
 * as a new node, so the polite live region says the solved equation (design 6.4).
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
