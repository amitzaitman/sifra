// e2e/drive.js, the contract loop's wait (architecture 4.8), on fake animations: an animation is over
// when its finished promise has settled, so what waits on it has run before the loop checks the page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drive } from '../e2e/drive.js';

/** The fake page's animations; getAnimations() lists those still relevant. */
let animations = [];
let reads = 0;
globalThis.document = /** @type {any} */ ({
  getAnimations: () => {
    reads += 1;
    return animations.filter((a) => a.listed);
  },
  querySelector: () => null,
});

/**
 * A fake animation. finish() resolves its finished promise; one without a fill then leaves the list.
 * @param {'running' | 'finished'} playState
 * @param {{ fill?: 'none' | 'forwards' }} [o]
 */
function fake(playState, { fill = 'none' } = {}) {
  let resolve = (_) => {};
  const a = {
    playState,
    listed: true,
    finished: new Promise((r) => { resolve = r; }),
    finish() {
      a.playState = 'finished';
      resolve(a);
      if (fill === 'none') a.listed = false;
    },
  };
  return a;
}

test('a running animation is finished, and what waits on it has run when drive returns', async () => {
  const a = fake('running');
  let removed = false;
  a.finished.then(() => { removed = true; });
  animations = [a];
  await drive(Promise.resolve());
  assert.equal(a.playState, 'finished');
  assert.ok(removed);
});

test('an animation that reads finished before its end is applied is finished too (WebKit between two frames)', async () => {
  // WebKit runs an animation's clock between frames and applies its end at the next one: until then
  // it reads finished, its target keeps its last frame's style and its promise waits. CI runs 16 and
  // 18: the balance's leaving display kept its last frame's opacity and its ghosts over the cover.
  const leaving = fake('finished');
  let removed = false;
  leaving.finished.then(() => { removed = true; });
  animations = [leaving];
  await drive(Promise.resolve());
  assert.ok(removed, 'the leaving layer is removed before drive returns');
});

test('a finished animation whose promise has settled (a fill that holds its end) does not hold drive up', async () => {
  const held = fake('finished', { fill: 'forwards' });
  held.finish();
  animations = [held];
  reads = 0;
  await drive(Promise.resolve());
  assert.ok(reads < 10, `${reads} reads of getAnimations()`);
});

test('a promise that never settles fails', async () => {
  animations = [];
  await assert.rejects(drive(new Promise(() => {})), /never settled/);
});
