// shell/store.js (architecture 3.9, 4.3): no throw on a broken storage, migrate, a broken child
// mended, the stored shape pinned to the schema, caps, quota, export.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as parts from './fixtures/parts/game.js';
import * as scale from './fixtures/scale/game.js';
import { moveTo, startLadder, step } from '../shell/ladder.js';
import { nextStep, planSession, reviews, schedule } from '../shell/planner.js';
import { rng } from '../shell/rng.js';
import { CAPS, KEY, SCHEMA, SHAPE, capped, childOf, exportFile, load, migrate, newChild, normaliseChild, save } from '../shell/store.js';
import { SKILLS } from '../data/skills.js';

const newId = () => 'c0000abcd';
const DAY = '2026-10-14';
/** The load's time and local day, as app.js stamps events. */
const WHEN = { t: '2026-10-14T07:00:00.000Z', day: DAY };
const GAMES = [parts, scale];
/** A stored value of schema 1 with one child, c1. */
const storedWith = (child) => ({ schema: 1, current: 'c1', children: { c1: child } });
/** The child c1 after migrate. */
const mended = (child) => migrate(JSON.stringify(storedWith(child)), newId, WHEN).data.children.c1;
/** The planner runs on a child: home's next step, a session's plan and its reviews. */
const plays = (c) => {
  assert.ok(nextStep(c, GAMES, SKILLS));
  assert.equal(planSession(c, GAMES, parts, DAY, SKILLS, rng(1), rng(2)).length, 8);
  assert.doesNotThrow(() => reviews(c, GAMES, DAY, SKILLS));
};

// The stored shape of each schema. Changing a key of a child, a ladder or a skill state needs a new
// SCHEMA and its migrate step: add the new schema's row here, and never edit an old one.
const SHAPES = {
  1: {
    child: ['created', 'sessions', 'games', 'skills', 'attempts', 'events'],
    ladder: ['level', 'fast', 'streak', 'window', 'passed', 'at', 'demoSeen', 'demoDue', 'hold'],
    skill: ['last', 'passedDay', 'box', 'due', 'reviewDays', 'lastReviewFirst'],
  },
};

/** A Storage in memory; setItem can be made to throw. */
function memory(initial = {}, failWith = null) {
  const items = new Map(Object.entries(initial));
  return {
    items,
    writes: 0,
    failWith,
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem(key, value) {
      if (this.failWith) {
        const err = this.failWith;
        this.failWith = null;
        throw err;
      }
      this.writes += 1;
      items.set(key, String(value));
    },
  };
}
const throwing = new Proxy({}, { get() { throw new Error('SecurityError: storage is off'); } });

test('importing and loading with a storage that throws on any access does not throw', async () => {
  await import('../shell/store.js?again');
  const store = load(throwing, newId, WHEN);
  assert.equal(store.data.current, 'c0000abcd');
  assert.deepEqual(childOf(store), newChild(DAY));
  assert.equal(save(store), false);
  assert.equal(load(null, newId, WHEN).data.schema, SCHEMA);
  assert.doesNotThrow(() => exportFile(throwing, new Date(), null, DAY));
});

test('migrate: missing, unparsable or broken gives a new value that keeps what was stored; schema 1 stays', () => {
  const fresh = (events) => ({ schema: 1, current: 'c0000abcd', children: { c0000abcd: { ...newChild(DAY), events } } });
  for (const raw of [null, '']) assert.deepEqual(migrate(raw, newId, WHEN), { data: fresh([]), writable: true }, 'nothing stored, nothing logged');
  const broken = ['{"schema":1,"current":"x","children":{}}', '{"schema":1,"current":"x","children":{"x":5}}',
    '{"schema":1,"current":"x","children":{"x":null}}', '{"schema":1,"current":"0","children":[{}]}', '{"schema":1,"current":"x","children":{"x":[]}}'];
  for (const raw of ['{', '"text"', '[]', '{"schema":0}', ...broken]) {
    // The first save overwrites what was stored: the repair event keeps it whole, for the export.
    const was = raw === '{' ? raw : JSON.parse(raw);
    const { data, writable } = migrate(raw, newId, WHEN);
    assert.equal(writable, true, raw);
    assert.deepEqual(data, fresh([{ t: WHEN.t, day: DAY, type: 'repair', lost: { '*': was } }]), raw);
  }
  const stored = { schema: 1, current: 'c1', children: { c1: { ...newChild('2026-01-01'), sessions: 4 } } };
  assert.deepEqual(migrate(JSON.stringify(stored), newId, WHEN), { data: stored, writable: true });
  // The records the shell writes stay as they are, and nothing is logged.
  const c = { ...newChild('2026-01-01'), sessions: 2, attempts: [{ outcome: 'first' }] };
  c.games.parts = moveTo(step(startLadder(parts.levels), parts.levels, { outcome: 'first', kind: 'new', session: 1 }).state, 'split-5', true);
  c.games.scale = startLadder(scale.levels);
  schedule(c.skills, 'num.parts.split', { day: '2026-01-01', kind: 'new', outcome: 'first', passed: true });
  schedule(c.skills, 'num.parts.split', { day: '2026-01-02', kind: 'review', outcome: 'first', passed: false });
  c.events.push({ type: 'jump', game: 'parts' });
  const full = { schema: 1, current: 'c1', children: { c1: c, c2: newChild('2026-02-01') } };
  assert.deepEqual(migrate(JSON.stringify(full), newId, WHEN), { data: full, writable: true });
});

test('a ladder without passed migrates and nextStep runs (it threw on the stored record)', () => {
  const child = { ...newChild('2026-10-01'), sessions: 2, games: { parts: { level: 'split-10' } } };
  assert.throws(() => nextStep(child, GAMES, SKILLS), /includes/);
  const c = mended(child);
  assert.deepEqual(c.games.parts, { level: 'split-10', fast: null, streak: 0, window: [], passed: [], at: {}, demoSeen: [], demoDue: null, hold: null });
  const next = nextStep(c, GAMES, SKILLS);
  assert.deepEqual([next.game.meta.id, next.index], ['parts', 1]);
  plays(c);
  assert.deepEqual(c.events, [], 'a missing value takes its default: nothing was lost, nothing is logged');
});

test('a child with only `created` migrates', () => {
  const c = mended({ created: '2026-01-01' });
  assert.deepEqual(c, newChild('2026-01-01'));
  plays(c);
  assert.deepEqual(mended({}), newChild(DAY), 'no created: today');
});

test('a wrong-typed value takes its default; a ladder whose level is not a string, and a skill state that is not an object, are dropped; one repair event keeps each by its path', () => {
  const c = mended({
    created: '2026-10-01', sessions: '3', attempts: {}, events: 'x', extra: 1,
    games: {
      parts: { level: 'split-10', fast: 'split-5', streak: -1, window: null, passed: 'split-5', at: [], demoSeen: ['split-5'], demoDue: 3, hold: 'split-5', more: true },
      scale: { level: 2, passed: ['same'] },
      gone: 'x',
    },
    skills: {
      'num.parts.split': { last: '2026-10-13', passedDay: '2026-10-12', box: 'x', due: '2026-10-14', reviewDays: '2026-10-13', lastReviewFirst: 'yes' },
      'eq.sign.same-as': 7,
    },
  });
  assert.deepEqual(c.games, {
    parts: { level: 'split-10', fast: 'split-5', streak: 0, window: [], passed: [], at: {}, demoSeen: ['split-5'], demoDue: null, hold: 'split-5', more: true },
  });
  assert.deepEqual(c.skills, {
    'num.parts.split': { last: '2026-10-13', passedDay: '2026-10-12', box: 0, due: '2026-10-14', reviewDays: [], lastReviewFirst: null },
  });
  assert.deepEqual([c.created, c.sessions, c.attempts, c.extra], ['2026-10-01', 0, [], 1], 'keys outside the shape stay');
  assert.deepEqual(c.events, [{
    t: WHEN.t, day: DAY, type: 'repair', lost: {
      sessions: '3', attempts: {}, events: 'x',
      'games/parts/streak': -1, 'games/parts/window': null, 'games/parts/passed': 'split-5', 'games/parts/at': [], 'games/parts/demoDue': 3,
      'games/scale': { level: 2, passed: ['same'] }, 'games/gone': 'x',
      'skills/num.parts.split/box': 'x', 'skills/num.parts.split/reviewDays': '2026-10-13', 'skills/num.parts.split/lastReviewFirst': 'yes',
      'skills/eq.sign.same-as': 7,
    },
  }]);
  plays(c);
  // The repair event joins the events under their cap.
  const many = Array.from({ length: CAPS.events }, (_, i) => ({ i }));
  const events = mended({ ...newChild('2026-10-01'), events: many, skills: { x: null } }).events;
  assert.deepEqual([events.length, events[0].i, events.at(-1).type], [CAPS.events, 1, 'repair']);
});

test('every child is mended, not only the current one; normaliseChild does not change what it is given', () => {
  const other = { created: '2026-02-01', games: { parts: { level: 'split-5' } } };
  const { data } = migrate(JSON.stringify({ schema: 1, current: 'c1', children: { c1: newChild('2026-01-01'), c2: other, c3: 'x' } }), newId, WHEN);
  assert.deepEqual(data.children.c2.games.parts.passed, []);
  assert.equal(data.children.c3, 'x', 'a value that is not a child is kept as it is');
  const given = { created: '2026-02-01', games: { parts: { level: 'split-5', passed: 'x' } }, skills: { x: 1 }, events: [{ type: 'jump' }] };
  const copy = structuredClone(given);
  normaliseChild(given, WHEN);
  assert.deepEqual(given, copy);
});

test('the keys of newChild, startLadder and a new skill state equal SHAPE, and SHAPE is pinned to the schema', () => {
  const keys = (o) => Object.keys(o).sort();
  const sorted = (shape) => Object.fromEntries(Object.entries(shape).map(([k, v]) => [k, [...v].sort()]));
  assert.deepEqual(sorted(SHAPE), sorted(SHAPES[SCHEMA]), 'a changed shape needs a new SCHEMA, its migrate step and its row in SHAPES');
  assert.deepEqual(keys(newChild(DAY)), [...SHAPE.child].sort());
  for (const ladder of [startLadder(parts.levels), moveTo(startLadder(parts.levels), 'ten', true),
    step(startLadder(parts.levels), parts.levels, { outcome: 'first', kind: 'new', session: 1 }).state]) {
    assert.deepEqual(keys(ladder), [...SHAPE.ladder].sort());
  }
  const states = {};
  schedule(states, 'x', { day: DAY, kind: 'new', outcome: 'first', passed: true });
  schedule(states, 'y', { day: DAY, kind: 'review', outcome: 'help', passed: false });
  assert.deepEqual([keys(states.x), keys(states.y)], [[...SHAPE.skill].sort(), [...SHAPE.skill].sort()]);
  // migrate fills exactly these keys.
  const c = mended({ games: { parts: { level: 'split-5' } }, skills: { x: {} } });
  assert.deepEqual([keys(c), keys(c.games.parts), keys(c.skills.x)], [SHAPE.child, SHAPE.ladder, SHAPE.skill].map((k) => [...k].sort()));
});

test('migrate: a newer schema plays from memory and is never written', () => {
  const raw = JSON.stringify({ schema: SCHEMA + 1, current: 'c1', children: { c1: newChild('2026-01-01') } });
  const storage = memory({ [KEY]: raw });
  const store = load(storage, newId, WHEN);
  assert.equal(store.writable, false);
  assert.equal(store.data.current, 'c0000abcd');
  assert.equal(save(store), false);
  assert.equal(storage.getItem(KEY), raw);
  // A newer schema of another shape is not "broken": still never written.
  const other = JSON.stringify({ schema: SCHEMA + 1, current: 'p1', profiles: { p1: {} } });
  const storage2 = memory({ [KEY]: other });
  const store2 = load(storage2, newId, WHEN);
  assert.equal(store2.writable, false);
  assert.equal(save(store2), false);
  assert.equal(storage2.getItem(KEY), other);
  assert.equal(migrate('{"schema":2,"current":"x","children":{}}', newId, WHEN).writable, false);
});

test('save and load round-trip under one key', () => {
  const storage = memory();
  const store = load(storage, newId, WHEN);
  childOf(store).sessions = 3;
  assert.equal(save(store), true);
  assert.deepEqual([...storage.items.keys()], [KEY]);
  assert.equal(childOf(load(storage, () => 'other', WHEN)).sessions, 3);
});

test('caps: 4000 attempts and 500 events, oldest first out', () => {
  assert.deepEqual(CAPS, { attempts: 4000, events: 500 });
  const list = [];
  for (let i = 0; i < 4003; i++) capped(list, i, CAPS.attempts);
  assert.equal(list.length, 4000);
  assert.equal(list[0], 3);
  const events = [];
  for (let i = 0; i < 501; i++) capped(events, i, CAPS.events);
  assert.deepEqual([events.length, events[0]], [500, 1]);
});

test('a quota error drops the oldest half of the attempts and retries once', () => {
  const quota = Object.assign(new Error('full'), { name: 'QuotaExceededError' });
  const storage = memory({}, quota);
  const store = load(storage, newId, WHEN);
  childOf(store).attempts.push(...Array.from({ length: 10 }, (_, i) => ({ i })));
  assert.equal(save(store), true);
  assert.deepEqual(childOf(store).attempts.map((a) => a.i), [5, 6, 7, 8, 9]);
  assert.equal(storage.writes, 1);
  // Two quota errors in a row: give up, without throwing.
  const twice = memory({}, quota);
  const store2 = load(twice, newId, WHEN);
  twice.setItem = () => { throw quota; };
  assert.equal(save(store2), false);
  // Any other error: no retry, nothing dropped.
  const other = memory({}, new Error('broken'));
  const store3 = load(other, newId, WHEN);
  childOf(store3).attempts.push({ i: 0 }, { i: 1 });
  assert.equal(save(store3), false);
  assert.equal(childOf(store3).attempts.length, 2);
});

test('export: the stored value as is, with key, schema, time and persisted', () => {
  const stored = { schema: 1, current: 'c1234abcd', children: { c1234abcd: newChild('2026-10-01') } };
  // 00:30 in Israel is still the day before in UTC: the name takes the local day it is given.
  const file = exportFile(memory({ [KEY]: JSON.stringify(stored) }), new Date('2026-10-13T21:30:00Z'), true, '2026-10-14');
  assert.equal(file.name, 'sifra-c1234abcd-2026-10-14.json');
  assert.deepEqual(JSON.parse(file.text), { key: 'sifra', schema: 1, exported: '2026-10-13T21:30:00.000Z', persisted: true, data: stored });
  assert.equal(JSON.parse(exportFile(memory({ [KEY]: '{oops' }), new Date(), null, DAY).text).data, '{oops');
  assert.equal(exportFile(memory(), new Date('2026-10-14T08:00:00Z'), null, DAY).name, 'sifra-none-2026-10-14.json');
});
