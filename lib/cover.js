// The one cover of the unknown (R6, design 6.6). Lift it by adding is-lifted, then settle.

/**
 * A cover that fills its parent's box (the parent is positioned). The mark is drawn by CSS,
 * so the cover adds no text to an equation. data-tap names it in the attempt log's off-target
 * taps (architecture 3.2), in the picture and in the exercise.
 * @param {string} [mark] '?' for the unknown, a digit for a hidden known group, '' for none
 * @returns {HTMLSpanElement}
 */
export function cover(mark = '?') {
  const el = document.createElement('span');
  el.className = 'cover';
  el.dataset.mark = mark;
  el.dataset.tap = 'cover';
  return el;
}
