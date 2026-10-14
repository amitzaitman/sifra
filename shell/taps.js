// The double-tap window (design 6.9, architecture 3.2): a tap that comes within 300 ms of a change
// under the finger (a new screen, or "הַבָּא" in the cards' place) is dropped, so the second tap of a
// double tap never acts on what the first one put there. Times are event timeStamps, on the clock
// the events are stamped with; nothing waits and nothing locks, so the next tap is taken.

export const WINDOW = 300;

/**
 * @param {number} [ms] the window
 * @returns {{ changed(t: number): void, down(t: number): boolean, click(t: number, detail: number): boolean }}
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
    // it, however long the press. A keyboard click (detail 0) has no pointer: its own time decides.
    click(t, detail) {
      const drop = early(t) || (detail > 0 && downEarly);
      downEarly = false;
      return drop;
    },
  };
}
