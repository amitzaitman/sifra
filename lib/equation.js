// The equation row (design 6.4, R7): tokens left to right; each '?' is a cover over its answer.

const SOFT = new Set(['+', '−']);

/**
 * @param {string} className
 * @param {string} [text]
 * @returns {HTMLSpanElement}
 */
function span(className, text) {
  const el = document.createElement('span');
  el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

/**
 * Draws the equation into host. The answer is drawn from the start in .eq-answer, hidden until
 * the screen has data-solved; the k-th '?' shows the k-th number of an array answer.
 * @param {HTMLElement} host
 * @param {Equation | null} equation
 * @param {unknown} answer
 * @param {(mark?: string) => HTMLElement} makeCover lib/cover.js (lib modules import nothing)
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
      const slot = span('eq-slot');
      const lid = makeCover('?');
      slot.append(span('eq-answer', String(answers[covers.length])), lid);
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
