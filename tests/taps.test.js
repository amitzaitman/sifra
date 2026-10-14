// shell/taps.js: the double-tap window (design 6.9, architecture 3.2), on event times alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WINDOW, tapWindow } from '../shell/taps.js';

test('the window is 300 ms (the owner\'s decision, 2026-10-14)', () => {
  assert.equal(WINDOW, 300);
});

test('before any change every tap is taken', () => {
  const taps = tapWindow();
  assert.equal(taps.down(0), false);
  assert.equal(taps.click(0, 1), false);
});

test('a tap within 300 ms of a change is dropped, its pointerdown and its click; at 300 ms it is taken', () => {
  const taps = tapWindow();
  taps.changed(1000);
  assert.equal(taps.down(1000), true, 'the second tap of a double tap, at the change');
  assert.equal(taps.click(1080, 1), true);
  assert.equal(taps.down(1299.9), true);
  assert.equal(taps.click(1299.9, 1), true);
  assert.equal(taps.down(1300), false, 'the edge of the window');
  assert.equal(taps.click(1350, 1), false);
});

test('a tap stamped before the change (queued while the screen changed) is dropped', () => {
  const taps = tapWindow();
  taps.changed(1000);
  assert.equal(taps.down(990), true);
  assert.equal(taps.click(995, 1), true);
});

test('the click of a pointer that came down in the window is dropped, however long the press', () => {
  const taps = tapWindow();
  taps.changed(1000);
  assert.equal(taps.down(1250), true);
  assert.equal(taps.click(1600, 1), true, 'a long press that began in the window');
  assert.equal(taps.down(1700), false, 'nothing locks: the next tap is taken');
  assert.equal(taps.click(1760, 1), false);
});

test('a keyboard click (detail 0) has no pointer: its own time decides', () => {
  const taps = tapWindow();
  taps.changed(1000);
  assert.equal(taps.down(1100), true);
  assert.equal(taps.click(1400, 0), false);
  assert.equal(taps.click(1200, 0), true);
});

test('each change starts the window again', () => {
  const taps = tapWindow();
  taps.changed(1000);
  assert.equal(taps.click(1400, 1), false);
  taps.changed(1400);
  assert.equal(taps.click(1500, 1), true);
  assert.equal(taps.click(1700, 1), false);
});
