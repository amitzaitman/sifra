// The one cover of the unknown (R6, design 6.6). Lift it by adding is-lifted, then settle.

/**
 * A cover that fills its parent's box (the parent is positioned). The mark is drawn by CSS,
 * so the cover adds no text to an equation.
 * @param {string} [mark] '?' for the unknown, a digit for a hidden known group, '' for none
 * @returns {HTMLSpanElement}
 */
export function cover(mark = '?') {
  const el = document.createElement('span');
  el.className = 'cover';
  el.dataset.mark = mark;
  return el;
}
