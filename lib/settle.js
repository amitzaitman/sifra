// Waiting for motion without timers (R5, R10): every wait goes through settle.

/** @returns {boolean} */
const reduced = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/**
 * Resolves when every animation in the subtree of el has finished or been cancelled; at once
 * when there is none or reduced motion is on; and when signal aborts. Call it right after the
 * change that starts the animation.
 * @param {Element | null | undefined} el
 * @param {AbortSignal} [signal]
 * @returns {Promise<void>}
 */
export function settle(el, signal) {
  if (!el || signal?.aborted || reduced()) return Promise.resolve();
  const running = el.getAnimations({ subtree: true });
  if (!running.length) return Promise.resolve();
  return new Promise((resolve) => {
    signal?.addEventListener('abort', () => resolve(), { once: true });
    Promise.allSettled(running.map((a) => a.finished)).then(() => resolve());
  });
}
