// The double-tap window (design 6.9, architecture 3.2): a tap that comes within 300 ms of a change
// under the finger (a new screen, or "הַבָּא" in the cards' place) is dropped, so the second tap of a
// double tap never acts on what the first one put there. Times are event timeStamps, on the clock
// the events are stamped with; nothing waits and nothing locks, so the next tap is taken.
// Then the kind of what an off-target tap hit, for the attempt log (below).

export const WINDOW = 300;

/**
 * Whether a click came from a pointer, not the keyboard. Chrome's click is a PointerEvent: its
 * pointerType says so ('' from the keyboard), and its detail may be 0 when the shell dropped the
 * pointerdown. Safari 16.4's click is a MouseEvent: detail 0 means the keyboard.
 * @param {{ pointerType?: string, detail: number }} e
 */
export const byPointer = (e) => Boolean(e.pointerType) || e.detail > 0;

/**
 * @param {number} [ms] the window
 * @returns {{ changed(t: number): void, down(t: number): boolean, click(t: number, pointer: boolean): boolean }}
 *   changed records a change; down and click tell whether to drop a pointerdown or a click
 */
export function tapWindow(ms = WINDOW) {
  let at = -Infinity;
  let downEarly = false;
  // A tap stamped before the change (queued while the screen changed) is early too.
  const early = (t) => t - at < ms;
  return {
    changed(t) {
      at = t;
    },
    down(t) {
      downEarly = early(t);
      return downEarly;
    },
    // A tap arrives with its pointerdown: the click of a pointer that came down early goes with
    // it, however long the press. A keyboard click has no pointer: its own time decides.
    click(t, pointer) {
      const drop = early(t) || (pointer && downEarly);
      downEarly = false;
      return drop;
    },
  };
}

// What an off-target tap hit (architecture 3.2, pedagogy 5.11): the drawing marks what a child may
// take for a target with one data-tap attribute (lib/cover.js its covers, each game its chips,
// lines and counted things); a tap on no mark is the picture's panel, or else other.

/** The kinds an attempt counts its off-target taps by (tapsOn), and a demo's taps (demoTaps). */
export const TAP_KINDS = ['cover', 'chip', 'line', 'object', 'panel', 'other'];
/** The kinds a data-tap attribute names. */
export const MARKS = ['cover', 'chip', 'line', 'object'];

/**
 * The kind of an element a tap hit: its nearest data-tap, else panel inside the picture's panel, else other.
 * @param {Element | null} el
 * @returns {string} one of TAP_KINDS
 */
export function tapKind(el) {
  const mark = el?.closest('[data-tap]')?.getAttribute('data-tap');
  if (mark && MARKS.includes(mark)) return mark;
  return el?.closest('[data-area="picture"]') ? 'panel' : 'other';
}

/**
 * The kind of what a tap hit, from the elements at its point, topmost first (elementsFromPoint while
 * app.css lets every mark take the hit, [data-probe]): the first one the child can see, with no
 * ancestor at opacity 0 (a hidden outline, a lifted cover, an unknown not yet shown).
 * @param {Element[]} hits
 * @param {(el: Element) => string} opacity an element's computed opacity
 * @returns {string} one of TAP_KINDS
 */
export function tapAt(hits, opacity) {
  /** @type {(el: Element) => boolean} */
  const seen = (el) => {
    for (let n = /** @type {Element | null} */ (el); n; n = n.parentElement) if (Number(opacity(n)) === 0) return false;
    return true;
  };
  return tapKind(hits.find(seen) ?? null);
}
