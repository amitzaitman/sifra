// shell/taps.js: the double-tap window (design 6.9, architecture 3.2), on event times alone; and the
// kind of what an off-target tap hit (architecture 3.2, pedagogy 5.11), on elements made up here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MARKS, TAP_KINDS, WINDOW, byPointer, tapAt, tapKind, tapWindow } from '../shell/taps.js';

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

/**
 * A made-up element: attributes, a parent, an opacity, and closest() for the two selectors tapKind asks,
 * `[name]` and `[name="value"]`.
 * @param {Record<string, string>} attrs
 * @param {any} [parent]
 * @param {string} [opacity]
 */
function node(attrs = {}, parent = null, opacity = '1') {
  const self = {
    attrs, parentElement: parent, opacity,
    getAttribute: (k) => attrs[k] ?? null,
    closest(sel) {
      const [, k, v] = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(sel) ?? [];
      if (!k) throw new Error(`unknown selector ${sel}`);
      for (let n = self; n; n = n.parentElement) if (k in n.attrs && (v === undefined || n.attrs[k] === v)) return n;
      return null;
    },
  };
  return self;
}

test('the kinds of an off-target tap: the four marks the drawing names, the panel, and anything else', () => {
  assert.deepEqual(TAP_KINDS, ['cover', 'chip', 'line', 'object', 'panel', 'other']);
  assert.deepEqual(MARKS, TAP_KINDS.slice(0, 4));
});

test('tapKind: the nearest data-tap names it; on no mark, panel inside the picture\'s panel, else other', () => {
  const main = node({ 'data-screen': 'round' });
  const panel = node({ 'data-area': 'picture' }, main);
  const draw = node({ class: 'st-draw' }, panel);
  const layer = node({ 'data-layer': 'covers' }, draw);
  const lid = node({ class: 'st-lid' }, layer);
  const cover = node({ 'data-tap': 'cover' }, lid);
  const chip = node({ 'data-tap': 'chip' }, draw);
  const digit = node({ class: 'bl-n' }, chip);
  const ball = node({ 'data-tap': 'object', 'data-role': 'part' }, draw);
  const dot = node({ class: 'st-touch' }, ball);
  const svg = node({ 'data-tap': 'line' }, draw);
  const path = node({}, svg);
  const equation = node({ 'data-area': 'equation' }, main);
  const eqCover = node({ 'data-tap': 'cover' }, node({ class: 'eq-slot' }, equation));
  assert.equal(tapKind(cover), 'cover');
  assert.equal(tapKind(digit), 'chip', 'a chip\'s own digit');
  assert.equal(tapKind(dot), 'object', 'the ink dot on a counted thing');
  assert.equal(tapKind(path), 'line', 'an SVG line\'s path');
  assert.equal(tapKind(eqCover), 'cover', 'the exercise\'s cover is a cover too; the area says where');
  assert.equal(tapKind(lid), 'panel', 'a cover\'s box around it is not the cover');
  assert.equal(tapKind(draw), 'panel');
  assert.equal(tapKind(panel), 'panel');
  assert.equal(tapKind(equation), 'other');
  assert.equal(tapKind(main), 'other');
  assert.equal(tapKind(null), 'other', 'nothing at the point');
  // A name that is not a mark is no mark.
  assert.equal(tapKind(node({ 'data-tap': 'chips' }, panel)), 'panel');
  assert.equal(tapKind(node({ 'data-tap': 'panel' }, main)), 'other', 'panel and other are the shell\'s, not a mark');
});

test('tapAt: the topmost element the child can see names it; one at opacity 0, or under an ancestor at 0, is passed over', () => {
  const panel = node({ 'data-area': 'picture' });
  const tray = node({ class: 'tf-tray' }, panel);
  const disc = node({ 'data-tap': 'object' }, panel);
  const hidden = node({ 'data-tap': 'line' }, panel, '0');
  const lifted = node({ 'data-tap': 'cover' }, node({ class: 'tf-lid' }, panel), '0');
  const fading = node({ 'data-tap': 'chip' }, node({ class: 'layer' }, panel, '0'));
  const opacity = (el) => el.opacity;
  assert.equal(tapAt([hidden, disc, tray, panel], opacity), 'object', 'the whole\'s outline before the tour shows it');
  assert.equal(tapAt([lifted, tray, panel], opacity), 'panel', 'a lifted cover');
  assert.equal(tapAt([fading, disc, panel], opacity), 'object', 'a chip in a layer that has faded out');
  assert.equal(tapAt([node({ 'data-tap': 'chip' }, panel, '0.3'), disc], opacity), 'chip', 'fading in is seen');
  assert.equal(tapAt([], opacity), 'other');
  assert.equal(tapAt([hidden], opacity), 'other', 'nothing seen at the point');
});
