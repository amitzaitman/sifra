// The contract loop's wait (architecture 4.8), in the page: loop() in contract.spec.js imports it from
// the test server; tests/drive.test.js runs it on fake animations.

/** A macrotask that the page's fake clock does not hold. */
const tick = () => new Promise((resolve) => {
  const channel = new MessageChannel();
  channel.port1.onmessage = () => {
    channel.port1.close();
    resolve(undefined);
  };
  channel.port2.postMessage(0);
});

/**
 * A story's event (2.4) runs on its own from the mount, a phase at a time: while [data-event] is in the
 * page it is not over, even between two phases when nothing runs.
 */
const event = () => document.querySelector('[data-event]') !== null;

/** Finished promises seen settled. */
const settled = new WeakSet();
/**
 * Whether an animation is not over: running, or finished with its finished promise not yet settled.
 * WebKit runs an animation's clock between frames and applies its end only at the next frame: until
 * then it reads finished while its target keeps its last frame's style and its promise, and what
 * waits on it, wait too (CI runs 16 and 18: at step 2 the balance's leaving display kept its last
 * frame's opacity, 0.0009 in a local run, and its ghosts over the cover, after 250 ms between two of
 * the loop's tasks). finish() applies the end at once.
 * @param {Animation} a
 */
const live = (a) => {
  if (a.playState === 'running') return true;
  if (a.playState !== 'finished') return false;
  const p = a.finished;
  p.then(() => settled.add(p), () => settled.add(p));
  return !settled.has(p);
};

/**
 * Awaits a promise, finishing every animation as it starts, until it has settled, no animation is
 * live (what it started without awaiting included, as the hint) and no event is left. An infinite
 * animation cannot finish: a promise that waits on one never settles, and fails; so does an event
 * that never ends.
 * @param {any} promise
 */
export async function drive(promise) {
  let [done, error] = [false, null];
  Promise.resolve(promise).then(() => { done = true; }, (e) => { [done, error] = [true, e]; });
  for (let k = 0; k < 400; k++) {
    const running = document.getAnimations().filter(live);
    if (done && !running.length && !event()) break;
    for (const a of running) {
      try { a.finish(); } catch { /* infinite */ }
    }
    // What the finished animations release runs in microtasks; a macrotask only when it waits on more.
    for (let j = 0; j < 8; j++) await null;
    if (!done || event() || document.getAnimations().some(live)) await tick();
  }
  if (error) throw error;
  if (!done) throw new Error('it never settled (an animation that cannot finish?)');
  if (event()) throw new Error('its event never ended ([data-event] is still there)');
}
