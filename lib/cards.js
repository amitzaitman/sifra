// Answer cards (design 6.5, after AlefBet's answer-choices.js): a row read left to right,
// a number with dots in rows of five, retired cards that keep their slot.

/**
 * The plain face and label of a value: the number; pair cards: the numbers with a bar between;
 * an equation card: its tokens, read left to right (a game's face may set its own aria-label).
 * @param {any} value
 * @returns {string}
 */
const plain = (value) =>
  Array.isArray(value) ? value.join(' | ') : Array.isArray(value?.left) ? [...value.left, '=', ...value.right].join(' ') : String(value);

/**
 * @param {number} n
 * @returns {HTMLElement} n dots, rows of five
 */
function dotsOf(n) {
  const dots = document.createElement('span');
  dots.className = 'card-dots';
  dots.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < n; i++) dots.append(document.createElement('i'));
  return dots;
}

/**
 * Draws the cards in array order into host.
 * @param {HTMLElement} host
 * @param {Choice[]} choices
 * @param {{ dots: boolean, face?: (el: HTMLElement, value: unknown) => boolean }} options
 * @param {AbortSignal} signal
 */
export function drawCards(host, choices, { dots, face }, signal) {
  const row = document.createElement('div');
  row.className = 'cards';
  row.dataset.choices = '';
  row.dataset.math = '';
  row.dir = 'ltr';
  row.style.setProperty('--n', String(choices.length));
  const buttons = choices.map((choice, i) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'card btn';
    button.dataset.index = String(i);
    const text = plain(choice.value);
    button.setAttribute('aria-label', text);
    if (!face?.(button, choice.value)) {
      const number = document.createElement('span');
      number.className = 'card-number';
      number.dataset.len = String(Math.min(4, text.length));
      number.textContent = text;
      button.append(number);
      if (dots) button.append(dotsOf(Number(choice.value)));
    }
    // iOS shows :active late; the press shows within 100ms through a class (design 6.5).
    button.addEventListener('pointerdown', () => button.classList.add('is-pressed'), { signal });
    for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
      button.addEventListener(type, () => button.classList.remove('is-pressed'), { signal });
    }
    return button;
  });
  row.append(...buttons);
  host.replaceChildren(row);
  /** @param {HTMLButtonElement} b */
  const live = (b) => !b.classList.contains('is-retired');
  return {
    row,
    buttons,
    /**
     * Retires a card: its face goes, its slot stays, focus moves to the next live card first.
     * @param {number} i
     */
    retire(i) {
      const button = buttons[i];
      if (!live(button)) return;
      if (document.activeElement === button) {
        const next = buttons.find((b, j) => j > i && live(b)) ?? buttons.find((b) => b !== button && live(b));
        next?.focus({ preventScroll: true });
      }
      button.classList.remove('is-pressed');
      button.classList.add('is-retired');
      button.inert = true;
    },
    /** @param {number} i the card tapped right */
    correct: (i) => buttons[i].classList.add('is-correct'),
    /** @param {number} i the answer, ringed after the tour */
    shown: (i) => buttons[i].classList.add('is-shown'),
  };
}
