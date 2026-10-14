// shell/taps.js: the double-tap window (design 6.9, architecture 3.2), on event times alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WINDOW, byPointer, tapWindow } from '../shell/taps.js';

test('the window is 300 ms (the owner\'s decision, 2026-10-14)', () => {
  assert.equal(WINDOW, 300);
});

test('before any change every tap is taken', () => {
  const taps = tapWindow();
  assert.equal(taps.down(0), false);
  assert.equal(taps.click(0, true), false);
});

test('a tap within 300 ms of a change is dropped, its pointerdown and its click; at 300 ms it is taken', () => {
  const taps = tapWindow();
  taps.changed(1000);
  assert.equal(taps.down(1000), true, 'the second tap of a double tap, at the change');
  assert.equal(taps.click(1080, true), true);
  assert.equal(taps.down(1299.9), true);
  assert.equal(taps.click(1299.9, true), true);
  assert.equal(taps.down(1300), false, 'the edge of the window');
  assert.equal(taps.click(1350, true), false);
});

test('a tap stamped before the change (queued while the screen changed) is dropped', () => {
  const taps = tapWindow();
  taps.changed(1000);
  assert.equal(taps.down(990), true);
  assert.equal(taps.click(995, true), true);
});

test('the click of a pointer that came down in the window is dropped, however long the press', () => {
  const taps = tapWindow();
  taps.changed(1000);
  assert.equal(taps.down(1250), true);
  assert.equal(taps.click(1600, true), true, 'a long press that began in the window');
  assert.equal(taps.down(1700), false, 'nothing locks: the next tap is taken');
  assert.equal(taps.click(1760, true), false);
});

test('a keyboard click has no pointer: its own time decides', () => {
  const taps = tapWindow();
  taps.changed(1000);
  assert.equal(taps.down(1100), true);
  assert.equal(taps.click(1400, false), false);
  assert.equal(taps.click(1200, false), true);
});

test('a pointer\'s click with detail 0 is still a pointer\'s: dropped with its pointerdown, however late', () => {
  // Chrome: after a mouse click, a touch click whose pointerdown was dropped comes with detail 0.
  const click = { pointerType: 'touch', detail: 0 };
  assert.equal(byPointer(click), true);
  const taps = tapWindow();
  taps.changed(1000);
  assert.equal(taps.down(1035), true);
  assert.equal(taps.click(1400, byPointer(click)), true, 'a press held past the window');
});

test('a pointer\'s click by pointerType where the click is a PointerEvent, else by detail', () => {
  assert.equal(byPointer({ pointerType: 'mouse', detail: 1 }), true);
  assert.equal(byPointer({ pointerType: 'touch', detail: 1 }), true);
  assert.equal(byPointer({ pointerType: '', detail: 0 }), false, 'Chrome: Enter, Space or element.click()');
  // Safari 16.4: the click is a MouseEvent, with no pointerType.
  assert.equal(byPointer({ detail: 1 }), true);
  assert.equal(byPointer({ detail: 0 }), false, 'Safari 16.4: the keyboard');
});

test('each change starts the window again', () => {
  const taps = tapWindow();
  taps.changed(1000);
  assert.equal(taps.click(1400, true), false);
  taps.changed(1400);
  assert.equal(taps.click(1500, true), true);
  assert.equal(taps.click(1700, true), false);
});
