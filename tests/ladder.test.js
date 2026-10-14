// lib/ladder.js: each rule of architecture 3.4 alone (4.3), pedagogy 5.3-5.4.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moveTo, needsDemo, sawDemo, startLadder, step } from '../lib/ladder.js';

const levels = ['a', 'b', 'c', 'd', 'e'].map((id, i) => ({ id, skill: 'num.parts.split', demo: i % 2 === 0 }));
/** A ladder out of its fast climb, at a level. */
const normal = (id) => ({ ...startLadder(levels, id), fast: null });
/** Plays outcomes in order; kind 'new' unless given as 'outcome/kind'. */
function play(state, outcomes, session = 1) {
  let s = state;
  for (const o of outcomes) {
    const [outcome, kind = 'new'] = o.split('/');
    s = step(s, levels, { outcome, kind, session }).state;
  }
  return s;
}

test('up after 4 first tries in a row: the level is passed', () => {
  const s = play(normal('b'), ['first', 'first', 'first']);
  assert.equal(s.level, 'b');
  const up = step(s, levels, { outcome: 'first', kind: 'new', session: 1 });
  assert.equal(up.state.level, 'c');
  assert.equal(up.passed, 'b');
  assert.deepEqual(up.state.passed, ['b']);
  assert.equal(up.state.streak, 0);
});

test('a miss breaks the run of first tries', () => {
  assert.equal(play(normal('b'), ['first', 'first', 'first', 'help', 'first', 'first', 'first']).level, 'b');
});

test('first, help, first, help goes down one; level 1 stays', () => {
  assert.equal(play(normal('c'), ['first', 'help', 'first']).level, 'c');
  const down = play(normal('c'), ['first', 'help', 'first', 'help']);
  assert.equal(down.level, 'b');
  assert.deepEqual(down.window, []);
  const bottom = play(normal('a'), ['help', 'shown']);
  assert.equal(bottom.level, 'a');
  assert.deepEqual(bottom.window, []);
});

test('shown counts as a miss in the down window', () => {
  assert.equal(play(normal('c'), ['shown', 'help']).level, 'b');
});

test('the window empties on every level change', () => {
  const s = play(normal('b'), ['first', 'help', 'first', 'first', 'first']);
  assert.equal(s.level, 'b', 'the help broke the run');
  const up = play(normal('b'), ['first', 'first', 'first', 'first']);
  assert.deepEqual(up.window, []);
  // One help at the new level does not go down: the old help is gone.
  assert.equal(play(normal('b'), ['help', 'first', 'first', 'first', 'first', 'first', 'help']).level, 'c');
});

test('mixed rounds count up, never down; reviews change nothing', () => {
  assert.equal(play(normal('b'), ['first/mixed', 'first/mixed', 'first/mixed', 'first/mixed']).level, 'c');
  const s = play(normal('b'), ['help/mixed', 'help/mixed', 'shown/mixed']);
  assert.equal(s.level, 'b');
  assert.deepEqual(s.window, []);
  const before = normal('c');
  for (const outcome of ['first', 'help', 'shown']) {
    const r = step(before, levels, { outcome, kind: 'review', session: 1 });
    assert.equal(r.state, before);
    assert.equal(r.passed, null);
  }
});

test('the last level stays', () => {
  const s = play(normal('e'), ['first', 'first', 'first', 'first']);
  assert.equal(s.level, 'e');
  assert.ok(s.passed.includes('e'));
});

test('fast climb: up on each first try, passed and seen', () => {
  const s = play(startLadder(levels), ['first', 'first']);
  assert.equal(s.level, 'c');
  assert.deepEqual(s.passed, ['a', 'b']);
  assert.deepEqual(s.demoSeen, ['a', 'b']);
  assert.equal(s.fast, 'a');
});

test('fast climb: the first miss goes back one level and unmarks it', () => {
  const s = play(startLadder(levels), ['first', 'first', 'help']);
  assert.equal(s.fast, null);
  assert.equal(s.level, 'b');
  assert.deepEqual(s.passed, ['a']);
  // From there the normal rule: four in a row passes b again.
  assert.equal(play(s, ['first', 'first', 'first', 'first']).level, 'c');
});

test('fast climb: a miss in its first round stays', () => {
  const s = play(startLadder(levels, 'c'), ['help']);
  assert.equal(s.level, 'c');
  assert.equal(s.fast, null);
  assert.deepEqual(s.passed, []);
});

test('fast climb to the last level stays there', () => {
  const s = play(startLadder(levels, 'd'), ['first', 'first', 'first']);
  assert.equal(s.level, 'e');
  assert.deepEqual(s.passed, ['d', 'e']);
});

test('fast climb: a miss at the last level, once passed there, stays and keeps every level passed', () => {
  const s = play(startLadder(levels, 'd'), ['first', 'first', 'help']);
  assert.equal(s.level, 'e');
  assert.equal(s.fast, null);
  assert.deepEqual(s.passed, ['d', 'e']);
  // Reached by the promotion but not yet passed: back one, as on any level.
  const back = play(startLadder(levels, 'd'), ['first', 'help']);
  assert.deepEqual([back.level, back.passed], ['d', []]);
});

test('fast climb: a miss on a mixed round ends the climb without going back (5.6)', () => {
  const s = play(startLadder(levels), ['first', 'help/mixed']);
  assert.equal(s.level, 'b');
  assert.equal(s.fast, null);
  assert.deepEqual(s.passed, ['a']);
});

test('demo: at the start level, not on a fast promotion, again after the climb ends', () => {
  const start = startLadder(levels);
  assert.equal(needsDemo(start, levels[0]), true, 'the start level has a demo and nothing is known');
  const seen = sawDemo(start, 'a');
  assert.equal(needsDemo(seen, levels[0]), false);
  const climbed = play(seen, ['first', 'first']);
  assert.equal(climbed.level, 'c');
  assert.equal(needsDemo(climbed, levels[2]), false, 'reached by a fast promotion');
  const back = play(climbed, ['help']);
  assert.equal(back.level, 'b');
  const again = play(back, ['first', 'first', 'first', 'first']);
  assert.equal(again.level, 'c');
  assert.equal(needsDemo(again, levels[2]), true, 'its demo runs when the child gets there again');
  assert.equal(needsDemo(again, levels[1]), false, 'b has no demo');
});

test('a stuck return runs the target demo once more, at any level, and holds until the target is passed', () => {
  const s = moveTo(normal('c'), 'b', true);
  assert.equal(s.level, 'b');
  assert.equal(s.hold, 'b');
  assert.equal(needsDemo(s, levels[1]), true);
  assert.equal(needsDemo(sawDemo(s, 'b'), levels[1]), false);
  assert.equal(moveTo(s, 'c').hold, 'b', 'a jump keeps the hold');
  const down = play(s, ['help', 'shown']);
  assert.deepEqual([down.level, down.hold], ['a', 'b'], 'going down keeps the hold');
  const passed = play(s, ['first', 'first', 'first', 'first']);
  assert.deepEqual([passed.level, passed.hold], ['c', null], 'passing the target ends it');
  assert.equal(startLadder(levels).hold, null);
});

test('stuck at 10 rounds, 2 sessions, under half first tries', () => {
  // The window is emptied before each round, so the down rule does not move the child.
  let s = normal('c');
  const out = [];
  for (let i = 0; i < 9; i++) {
    const outcome = i % 3 === 0 ? 'first' : 'help';
    const r = step({ ...s, window: [] }, levels, { outcome, kind: 'new', session: i < 5 ? 1 : 2 });
    out.push(r.stuck);
    s = { ...r.state, level: 'c' };
  }
  assert.ok(out.every((x) => !x), 'not before 10 rounds');
  const r = step({ ...s, window: [] }, levels, { outcome: 'help', kind: 'new', session: 2 });
  assert.equal(r.stuck, true);
  assert.deepEqual(r.state.at.c, { n: 0, first: 0, sessions: 0, lastSession: null }, 'the counters reset');
});

test('not stuck in one session, or with half first tries', () => {
  let s = normal('c');
  let any = false;
  for (let i = 0; i < 12; i++) {
    const r = step({ ...s, window: [] }, levels, { outcome: 'help', kind: 'new', session: 1 });
    any ||= r.stuck;
    s = { ...r.state, level: 'c' };
  }
  assert.equal(any, false, 'one session');
  s = normal('c');
  any = false;
  for (let i = 0; i < 12; i++) {
    const r = step({ ...s, window: [] }, levels, { outcome: i % 2 ? 'help' : 'first', kind: 'new', session: i < 6 ? 1 : 2 });
    any ||= r.stuck;
    s = { ...r.state, level: 'c', streak: 0 };
  }
  assert.equal(any, false, 'half first tries');
});
