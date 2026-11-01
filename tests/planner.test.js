// shell/planner.js: the dev-spec R3/R11 [unit] list (architecture 4.3), with the fixtures standing
// for ten-frame (parts) and balance (scale), the learning order, and the pedagogy 5.12 walk.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as parts from './fixtures/parts/game.js';
import * as scale from './fixtures/scale/game.js';
import { moveTo, startLadder, step } from '../shell/ladder.js';
import {
  TRIES, addDays, apartSeed, dayOf, daysBetween, demoSeedFor, exerciseOf, homeOrder, mastered, nextStep, pickMix, planSession, plainDemo, prereqs,
  reviews, same, schedule, skillPassed, stuckTarget,
} from '../shell/planner.js';
import { demoSeed, rng } from '../shell/rng.js';
import { newChild } from '../shell/store.js';
import { SKILLS } from '../data/skills.js';
import { learningOrder } from '../scripts/gen-data.js';
import { SKILLS as SKILLS_MD, parseSkills, parseStrands, read } from '../scripts/docs-parse.js';

const GAMES = [parts, scale];
const TODAY = '2026-10-14';
const YESTERDAY = '2026-10-13';
const ladder = (game, level, passed = []) => ({ ...startLadder(game.levels, level), fast: null, passed });
const skill = (over = {}) => ({ last: null, passedDay: null, box: 0, due: null, reviewDays: [], lastReviewFirst: null, ...over });
const child = (games = {}, skills = {}) => ({ ...newChild('2026-10-01'), games, skills });
const plan = (c, game = scale) => planSession(c, GAMES, game, TODAY, SKILLS, rng(1), rng(2));
/** A child who passed num.parts.split's first two levels yesterday. */
const splitYesterday = (over = {}) => child(
  { parts: ladder(parts, 'split-sym', ['split-5', 'split-10']) },
  { 'num.parts.split': skill({ last: YESTERDAY, passedDay: YESTERDAY, due: TODAY, ...over }) },
);

test('days: local day, adding days, days between', () => {
  assert.equal(dayOf(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(daysBetween('2026-10-13', '2026-10-27'), 14);
});

test('home order: by the SKILLS position of the first level skill', () => {
  assert.deepEqual(homeOrder([scale, parts], SKILLS).map((g) => g.meta.id), ['parts', 'scale']);
});

test('review: history from yesterday opens with a review at the last passed level, from another game', () => {
  const rounds = plan(splitYesterday());
  assert.equal(rounds.length, 8);
  assert.deepEqual(rounds[0], { game: 'parts', index: 1, seed: rounds[0].seed, kind: 'review' });
  assert.ok(rounds.slice(1).every((r) => r.game === 'scale' && r.kind === 'new' && r.index === -1));
  assert.equal(new Set(rounds.map((r) => r.seed)).size, 8);
});

test('review: two rounds when two skills are due, by due date then SKILLS order', () => {
  const c = splitYesterday();
  c.games.scale = ladder(scale, 'right', ['same']);
  c.skills['eq.sign.same-as'] = skill({ last: '2026-10-10', passedDay: '2026-10-10', due: TODAY });
  const rounds = plan(c, parts);
  assert.deepEqual(rounds.slice(0, 3).map((r) => [r.game, r.index, r.kind]), [['parts', 1, 'review'], ['scale', 0, 'review'], ['parts', -1, 'new']]);
  c.skills['eq.sign.same-as'].due = '2026-10-12';
  assert.deepEqual(plan(c, parts).slice(0, 2).map((r) => r.game), ['scale', 'parts']);
});

test('review: one when only one is due; nothing due takes the nearest due date', () => {
  const c = splitYesterday();
  c.games.scale = ladder(scale, 'right', ['same']);
  c.skills['eq.sign.same-as'] = skill({ last: YESTERDAY, passedDay: '2026-10-10', due: '2026-10-20' });
  assert.deepEqual(plan(c).filter((r) => r.kind === 'review').map((r) => r.game), ['parts']);
  c.skills['num.parts.split'].due = '2026-10-17';
  assert.deepEqual(plan(c).filter((r) => r.kind === 'review').map((r) => r.game), ['parts'], 'nearest due');
});

test('review: no history, or played today: no review', () => {
  assert.equal(plan(child()).filter((r) => r.kind === 'review').length, 0);
  assert.equal(plan(splitYesterday({ last: TODAY })).filter((r) => r.kind === 'review').length, 0);
});

test('review pool: any skill the child passed a level of, in any game; no grade band (R11)', () => {
  // A game far along the map: its skill is reviewed like any other, from a session in another game.
  const rows = { id: 'rows', skill: 'muldiv.meaning.array', demo: false, options: 4, model: 'array', look: 'dots', terms: true };
  const later = { meta: { id: 'later', title: 'שׁוּרוֹת', version: 1, css: '' }, levels: [rows, { ...rows, id: 'rows-sym', look: 'symbols' }] };
  const games = [parts, scale, later];
  const c = child({ later: ladder(later, 'rows-sym', ['rows']) }, { 'muldiv.meaning.array': skill({ last: YESTERDAY, passedDay: YESTERDAY, due: TODAY }) });
  const rounds = planSession(c, games, parts, TODAY, SKILLS, rng(1), rng(2));
  assert.deepEqual([rounds[0].game, rounds[0].index, rounds[0].kind], ['later', 0, 'review']);
  assert.ok(rounds.slice(1).every((r) => r.game === 'parts' && r.kind === 'new'));
  // Two due, from two games: by due date, then the learning order.
  c.games.parts = ladder(parts, 'split-sym', ['split-5', 'split-10']);
  c.skills['num.parts.split'] = skill({ last: YESTERDAY, passedDay: YESTERDAY, due: TODAY });
  assert.deepEqual(reviews(c, games, TODAY, SKILLS).map((r) => [r.game.meta.id, r.index]), [['parts', 1], ['later', 0]]);
  c.skills['muldiv.meaning.array'].due = YESTERDAY;
  assert.deepEqual(reviews(c, games, TODAY, SKILLS).map((r) => r.game.meta.id), ['later', 'parts']);
  // A scheduled skill with no passed level in any registered game is not in the pool.
  assert.deepEqual(reviews(c, [parts, scale], TODAY, SKILLS).map((r) => r.game.meta.id), ['parts']);
});

test('review: after a failed last review, one level lower with the same skill, model and look', () => {
  assert.equal(plan(splitYesterday({ lastReviewFirst: false }))[0].index, 0);
  const c = child({ parts: ladder(parts, 'ten', ['split-5', 'split-10', 'split-sym']) }, { 'num.parts.split': skill({ last: YESTERDAY, passedDay: '2026-10-01', due: TODAY, lastReviewFirst: false }) });
  assert.equal(plan(c)[0].index, 2, 'split-10 has another look than split-sym');
});

test('review: a failed review does not change the level', () => {
  const before = ladder(scale, 'left', ['same', 'right']);
  assert.equal(step(before, scale.levels, { outcome: 'shown', kind: 'review', session: 3 }).state, before);
});

test('schedule: from the first passed level; the box climbs on first tries and drops on misses', () => {
  const states = {};
  schedule(states, 'num.parts.split', { day: '2026-10-01', kind: 'new', outcome: 'first', passed: false });
  assert.equal(states['num.parts.split'].due, null);
  schedule(states, 'num.parts.split', { day: '2026-10-01', kind: 'new', outcome: 'first', passed: true });
  assert.deepEqual(states['num.parts.split'], skill({ last: '2026-10-01', passedDay: '2026-10-01', due: '2026-10-02' }));
  const review = (day, outcome) => schedule(states, 'num.parts.split', { day, kind: 'review', outcome, passed: false });
  review('2026-10-02', 'first');
  assert.equal(states['num.parts.split'].due, '2026-10-05');
  review('2026-10-05', 'first');
  assert.equal(states['num.parts.split'].due, '2026-10-12');
  review('2026-10-12', 'first');
  review('2026-10-26', 'first');
  assert.equal(states['num.parts.split'].box, 3);
  assert.equal(states['num.parts.split'].due, '2026-11-09');
  review('2026-11-09', 'help');
  assert.deepEqual([states['num.parts.split'].box, states['num.parts.split'].due, states['num.parts.split'].lastReviewFirst], [0, '2026-11-10', false]);
  assert.deepEqual(states['num.parts.split'].reviewDays, ['2026-10-02', '2026-10-05', '2026-10-12', '2026-10-26']);
});

test('mastered: passed, then first-try reviews on two different days', () => {
  const c = child({ parts: ladder(parts, 'ten', ['split-5', 'split-10', 'split-sym']) }, { 'num.parts.split': skill({ reviewDays: ['2026-10-02'] }) });
  assert.equal(skillPassed(c, GAMES, 'num.parts.split'), true);
  assert.equal(mastered(c, GAMES, 'num.parts.split'), false);
  c.skills['num.parts.split'].reviewDays.push('2026-10-05');
  assert.equal(mastered(c, GAMES, 'num.parts.split'), true);
  c.games.parts.passed = ['split-5', 'split-10'];
  assert.equal(mastered(c, GAMES, 'num.parts.split'), false, 'its last level is not passed');
});

test('mixed level: both structures appear, and about 40% of consecutive rounds switch', () => {
  const level = { structure: ['change-add', 'change-take'] };
  let [pairs, switches] = [0, 0];
  const seen = new Set();
  for (let session = 1; session <= 2000; session++) {
    const mix = rng(session * 2654435761 >>> 0);
    let prev = null;
    for (let round = 0; round < 8; round++) {
      const { structure } = pickMix(level, prev, mix);
      seen.add(structure);
      if (prev !== null) [pairs, switches] = [pairs + 1, switches + (structure !== prev ? 1 : 0)];
      prev = structure;
    }
  }
  assert.deepEqual([...seen].sort(), ['change-add', 'change-take']);
  assert.ok(Math.abs(switches / pairs - 0.4) <= 0.05, `switch rate ${switches / pairs}`);
  assert.deepEqual(pickMix({ ask: ['more', 'total', 'which'] }, 'gone', rng(1)).ask !== undefined, true);
  assert.deepEqual(pickMix(parts.levels[0], null, rng(1)), {});
});

test('prerequisites: base, then the conditions the level meets', () => {
  assert.deepEqual(prereqs(SKILLS, 'num.compare.numbers', { max: 10 }), ['num.compare.sets', 'count.sequence.next']);
  assert.deepEqual(prereqs(SKILLS, 'num.compare.numbers', { max: 100 }), ['num.compare.sets', 'count.sequence.next', 'pv.numeral.read']);
  assert.ok(prereqs(SKILLS, 'eq.props.commutative', { op: 'mul' }).includes('muldiv.meaning.array'));
  assert.ok(prereqs(SKILLS, 'eq.props.commutative', { op: ['add', 'mul'] }).includes('muldiv.meaning.array'));
  assert.ok(!prereqs(SKILLS, 'eq.props.commutative', { op: 'add' }).includes('muldiv.meaning.array'));
});

/** A skills.md row as data/skills.js has it. */
const row = (id, base = [], when = []) => ({ id, requires: { base, when }, rules: [] });
/** A plain game: an id and levels of the given skills (nextStep needs no makeRound). */
const plain = (id, ...levels) => ({ meta: { id, title: id, version: 1, css: '' }, levels: levels.map(([lid, skill, max = 10]) => ({ id: lid, skill, max })) });
/** The next step as [game id, level index]. */
const stepOf = (c, games, skills) => {
  const next = nextStep(c, games, skills);
  return [next.game.meta.id, next.index];
};

test('learning order: depth of base prerequisites, then row order; cycles throw', () => {
  const rows = [row('t.c.c', ['t.b.b']), row('t.a.a'), row('t.b.b', ['t.a.a']), row('t.d.d'), row('t.e.e', ['t.a.a', 't.c.c']), row('t.f.f', ['t.a.a'])];
  assert.deepEqual(learningOrder(rows).map((r) => r.id), ['t.a.a', 't.d.d', 't.b.b', 't.f.f', 't.c.c', 't.e.e']);
  assert.deepEqual(learningOrder([row('t.b.b', ['t.x.x']), row('t.a.a')]).map((r) => r.id), ['t.b.b', 't.a.a'], 'unknown ids: depth 0');
  assert.throws(() => learningOrder([row('t.a.a', ['t.b.b']), row('t.b.b', ['t.a.a'])]), /cycle/);
});

test('learning order in data/skills.js: every skill after its base prerequisites, ties by depth then skills.md rows', () => {
  const text = read(SKILLS_MD);
  const rows = [...parseSkills(text, parseStrands(text)).skills.keys()];
  assert.deepEqual([...SKILLS.map((s) => s.id)].sort(), [...rows].sort(), 'every skills.md row, once');
  const at = new Map(SKILLS.map((s, i) => [s.id, i]));
  const depth = new Map();
  for (const s of SKILLS) {
    for (const p of s.requires.base) assert.ok(at.get(p) < at.get(s.id), `${s.id} comes before its prerequisite ${p}`);
    depth.set(s.id, Math.max(0, ...s.requires.base.map((p) => depth.get(p) + 1)));
  }
  const key = (s) => [depth.get(s.id), rows.indexOf(s.id)];
  SKILLS.slice(1).forEach((s, i) => {
    const [[d0, r0], [d1, r1]] = [key(SKILLS[i]), key(s)];
    assert.ok(d0 < d1 || (d0 === d1 && r0 < r1), `${SKILLS[i].id} then ${s.id}: not by depth, then row`);
  });
});

test('next step: skills no game offers are skipped, and count as open when they are prerequisites', () => {
  const skills = [row('t.a.a'), row('t.b.b', ['t.a.a']), row('t.c.c', ['t.b.b']), row('t.d.d', ['t.c.c'])];
  const first = plain('first', ['b1', 't.b.b'], ['b2', 't.b.b']);
  const second = plain('second', ['d1', 't.d.d']);
  const games = [second, first];
  assert.deepEqual(stepOf(child(), games, skills), ['first', 0], 't.a.a is offered by no game: skipped, and t.b.b is open');
  const c = child({ first: ladder(first, 'b2', ['b1']) });
  assert.deepEqual(stepOf(c, games, skills), ['first', 1], 'a skill is passed at its last level');
  c.games.first.passed.push('b2');
  assert.deepEqual(stepOf(c, games, skills), ['second', 0], 't.c.c is offered by no game: t.d.d is open after t.b.b');
});

test('next step: a skill waits for its offered prerequisites, conditional ones by the level it would open', () => {
  const skills = [row('t.a.a', [], [{ if: { max: '>10' }, add: ['t.b.b'] }]), row('t.b.b'), row('t.c.c', ['t.a.a'])];
  const big = plain('big', ['a20', 't.a.a', 20]);
  const small = plain('small', ['a10', 't.a.a', 10]);
  const other = plain('other', ['b1', 't.b.b'], ['c1', 't.c.c']);
  assert.deepEqual(stepOf(child(), [big, other], skills), ['other', 0], 't.a.a at max 20 needs t.b.b first');
  assert.deepEqual(stepOf(child(), [small, other], skills), ['small', 0], 't.a.a at max 10 does not');
  const passedB = child({ other: ladder(other, 'c1', ['b1']) });
  assert.deepEqual(stepOf(passedB, [big, other], skills), ['big', 0], 't.b.b passed: t.a.a opens before t.c.c');
});

test('next step: an empty store starts the first game at level 1; a passed skill opens the next', () => {
  const first = nextStep(child(), GAMES, SKILLS);
  assert.deepEqual([first.game.meta.id, first.index], ['parts', 0]);
  const split = child({ parts: ladder(parts, 'split-sym', ['split-5', 'split-10', 'split-sym']) });
  const next = nextStep(split, GAMES, SKILLS);
  assert.deepEqual([next.game.meta.id, next.index], ['parts', 3], 'the lowest unpassed make-ten level');
  split.games.parts.passed.push('ten');
  const third = nextStep(split, GAMES, SKILLS);
  assert.deepEqual([third.game.meta.id, third.index], ['scale', 0]);
  const done = child({ parts: ladder(parts, 'ten', parts.levels.map((l) => l.id)), scale: ladder(scale, 'left', scale.levels.map((l) => l.id)) });
  const rest = nextStep(done, GAMES, SKILLS);
  assert.deepEqual([rest.game.meta.id, rest.index], ['parts', 3], 'all passed: the first game at its level');
  assert.equal(nextStep(child(), [], SKILLS), null);
});

test('stuck: a prerequisite no game offers returns to the previous level and is logged', () => {
  const c = child({ parts: ladder(parts, 'split-10', ['split-5']) });
  const to = stuckTarget(c, GAMES, parts, 1, SKILLS);
  assert.deepEqual([to.game.meta.id, to.index, to.missing], ['parts', 0, ['count.set.how-many']]);
  const firstLevel = stuckTarget(c, GAMES, parts, 0, SKILLS);
  assert.deepEqual([firstLevel.game.meta.id, firstLevel.index], ['parts', 0], 'the game\'s first level stays');
});

test('stuck: a prerequisite another game offers wins over the previous level', () => {
  // Stuck in eq.sign.missing with eq.sign.same-as mastered: go to num.parts.split in ten-frame (parts).
  const c = child(
    { scale: ladder(scale, 'right', ['same']) },
    { 'eq.sign.same-as': skill({ passedDay: '2026-10-01', reviewDays: ['2026-10-02', '2026-10-05'] }) },
  );
  const to = stuckTarget(c, GAMES, scale, 1, SKILLS);
  assert.deepEqual([to.game.meta.id, to.index, to.missing], ['parts', 0, []]);
  c.games.parts = ladder(parts, 'ten', ['split-5', 'split-10']);
  assert.equal(stuckTarget(c, GAMES, scale, 1, SKILLS).index, 1, 'its highest passed level there');
  c.skills['eq.sign.same-as'].reviewDays = [];
  const same = stuckTarget(c, GAMES, scale, 1, SKILLS);
  assert.deepEqual([same.game.meta.id, same.index], ['scale', 0], 'same-as not mastered: it comes first');
});

test('stuck: at a level with down: false, nowhere to go is stay, not the other skill\'s level below (decisions.md 2026-10-31)', async () => {
  const games = Object.values(await import('../games/registry.js'));
  const [frame, balance, stories] = ['ten-frame', 'balance', 'stories'].map((id) => games.find((g) => g.meta.id === id));
  const where = (c, game, id) => {
    const to = stuckTarget(c, games, game, game.levels.findIndex((l) => l.id === id), SKILLS);
    return [to.game.meta.id, to.game.levels[to.index].id, to.missing];
  };
  // No game offers either prerequisite of the teen bundle: stay (the demo again), both logged; not make-ten in symbols.
  assert.deepEqual(where(child(), frame, 'teen-bundle'), ['ten-frame', 'teen-bundle', ['num.subitize.patterns', 'count.sequence.next']]);
  // The stories' take to 5: not 4 + ? = 10 (the playtest's case).
  assert.deepEqual(where(child(), stories, 'take-5'), ['stories', 'take-5', ['count.set.how-many']]);
  // Balance 10 and 11: a prerequisite not mastered wins; all mastered, stay, not the turn or true-false.
  const c = child({ balance: ladder(balance, 'relational', balance.levels.map((l) => l.id)) });
  assert.deepEqual(where(c, balance, 'true-false'), ['balance', 'missing-symbols-20', []]);
  for (const id of ['eq.sign.missing', 'eq.sign.both-sides']) c.skills[id] = skill({ passedDay: '2026-10-01', reviewDays: ['2026-10-02', '2026-10-05'] });
  assert.deepEqual(where(c, balance, 'true-false'), ['balance', 'true-false', []]);
  assert.deepEqual(where(c, balance, 'relational'), ['balance', 'relational', []]);
  // A level that steps down still returns to the level below (the turn: its when makes both-sides a prerequisite).
  c.games['ten-frame'] = ladder(frame, 'bridge-symbols', frame.levels.map((l) => l.id));
  c.skills['num.parts.split'] = skill({ passedDay: '2026-10-01', reviewDays: ['2026-10-02', '2026-10-05'] });
  assert.deepEqual(where(c, balance, 'turn'), ['balance', 'both-sides-symbols', []]);
});

test('stuck: the next step holds the target until the child passes it (5.4)', () => {
  // Stuck at make-ten with num.parts.split passed but not mastered: back to split-sym.
  const split = ['split-5', 'split-10', 'split-sym'];
  const c = child({ parts: ladder(parts, 'ten', split), scale: ladder(scale, 'left', ['same', 'right']) });
  const to = stuckTarget(c, GAMES, parts, 3, SKILLS);
  assert.deepEqual([to.game.meta.id, to.index], ['parts', 2]);
  c.games.parts = moveTo(c.games.parts, 'split-sym', true);
  const held = nextStep(c, GAMES, SKILLS);
  assert.deepEqual([held.game.meta.id, held.index], ['parts', 2], 'not back to make-ten, and not to scale');
  // Down from the target: the step follows the ladder there, with no jump.
  c.games.parts = step(step(c.games.parts, parts.levels, { outcome: 'help', kind: 'new', session: 5 }).state, parts.levels, { outcome: 'help', kind: 'new', session: 5 }).state;
  assert.equal(c.games.parts.level, 'split-10');
  assert.equal(nextStep(c, GAMES, SKILLS).index, 1);
  // Passed again: the hold ends and the walk goes on.
  c.games.parts = { ...c.games.parts, level: 'split-sym', window: [] };
  for (let n = 0; n < 4; n++) c.games.parts = step(c.games.parts, parts.levels, { outcome: 'first', kind: 'new', session: 6 }).state;
  assert.equal(c.games.parts.hold, null);
  const after = nextStep(c, GAMES, SKILLS);
  assert.deepEqual([after.game.meta.id, after.index], ['parts', 3]);
});

test('5.12 walk: an always-right child follows the next step through every offered skill, in order', () => {
  const c = child();
  const offered = SKILLS.map((s) => s.id).filter((id) => GAMES.some((g) => g.levels.some((l) => l.skill === id)));
  const opened = [];
  for (let n = 0; n < 100 && !offered.every((id) => skillPassed(c, GAMES, id)); n++) {
    const { game, index } = nextStep(c, GAMES, SKILLS);
    const [id, level] = [game.meta.id, game.levels[index]];
    if (!opened.includes(level.skill)) {
      for (const p of prereqs(SKILLS, level.skill, level).filter((p) => offered.includes(p))) {
        assert.ok(skillPassed(c, GAMES, p), `${level.skill} opened before its prerequisite ${p}`);
      }
      opened.push(level.skill);
    }
    const now = c.games[id];
    c.games[id] = !now ? startLadder(game.levels, level.id) : now.level === level.id ? now : moveTo(now, level.id);
    const r = step(c.games[id], game.levels, { outcome: 'first', kind: 'new', session: n });
    c.games[id] = r.state;
    schedule(c.skills, level.skill, { day: TODAY, kind: 'new', outcome: 'first', passed: r.passed !== null });
  }
  assert.deepEqual(opened, offered);
  assert.ok(offered.every((id) => skillPassed(c, GAMES, id)));
  assert.equal(reviews(c, GAMES, TODAY, SKILLS).length, 0, 'everything was played today');
  assert.equal(reviews(c, GAMES, addDays(TODAY, 1), SKILLS).length, 2, 'tomorrow: two due');
});

test('5.12 walk over games/registry.js: an always-right child opens each game\'s levels in list order (pedagogy 6.2, 6.3)', async () => {
  const games = homeOrder(Object.values(await import('../games/registry.js')), SKILLS);
  const c = child();
  const offered = SKILLS.map((s) => s.id).filter((id) => games.some((g) => g.levels.some((l) => l.skill === id)));
  /** @type {Record<string, number[]>} each game's levels, numbered from 1, in the order they were first played */
  const played = Object.fromEntries(games.map((g) => [g.meta.id, []]));
  for (let n = 0; n < 200 && !offered.every((id) => skillPassed(c, games, id)); n++) {
    const { game, index } = nextStep(c, games, SKILLS);
    const [id, level] = [game.meta.id, game.levels[index]];
    for (const p of prereqs(SKILLS, level.skill, level).filter((p) => offered.includes(p))) {
      assert.ok(skillPassed(c, games, p), `${id} level ${index + 1} (${level.id}) opened before its prerequisite ${p}`);
    }
    if (!played[id].includes(index + 1)) played[id].push(index + 1);
    const now = c.games[id];
    c.games[id] = !now ? startLadder(game.levels, level.id) : now.level === level.id ? now : moveTo(now, level.id);
    const r = step(c.games[id], game.levels, { outcome: 'first', kind: 'new', session: n });
    c.games[id] = r.state;
    schedule(c.skills, level.skill, { day: TODAY, kind: 'new', outcome: 'first', passed: r.passed !== null });
  }
  assert.ok(offered.every((id) => skillPassed(c, games, id)));
  for (const g of games) assert.deepEqual(played[g.meta.id], g.levels.map((_, i) => i + 1), g.meta.id);
});

test('exerciseOf: what the child sees, so a reversed row or another verb is the same exercise (architecture 3.3, 3.8)', async () => {
  const { levels, makeRound } = await import('../games/stories/game.js');
  const take = levels.find((l) => l.id === 'take-10');
  const rounds = Array.from({ length: 1000 }, (_, i) => makeRound(take, rng(i + 1)));
  const of = (s, k, f) => rounds.find((r) => r.story.s === s && r.story.k === k && f(r));
  const [a, b] = [of(9, 3, (r) => r.eqform === 'standard'), of(9, 3, (r) => r.eqform === 'reversed')];
  assert.ok(a && b);
  assert.equal(exerciseOf('stories', a), exerciseOf('stories', b));
  const [fly, pop] = [of(8, 2, (r) => r.story.verb === 'fly'), of(8, 2, (r) => r.story.verb === 'pop')];
  assert.equal(exerciseOf('stories', fly), exerciseOf('stories', pop));
  assert.notEqual(exerciseOf('stories', a), exerciseOf('stories', fly));
  assert.notEqual(exerciseOf('stories', a), exerciseOf('ten-frame', a));
  // The order of the exercise is the story's: 3 + 2 is not 2 + 3.
  const add = levels.find((l) => l.id === 'add-5');
  const adds = Array.from({ length: 400 }, (_, i) => makeRound(add, rng(i + 1)));
  const [x, y] = [adds.find((r) => r.story.s === 3 && r.story.k === 2), adds.find((r) => r.story.s === 2 && r.story.k === 3)];
  assert.notEqual(exerciseOf('stories', x), exerciseOf('stories', y));
  // Without an exercise, the picture tells rounds apart.
  assert.notEqual(exerciseOf('g', { ...a, equation: null, picture: [1] }), exerciseOf('g', { ...a, equation: null, picture: [2] }));
});

/** A round with only what the demo's choice reads: its row and its answer. */
const exercise = (left, right, answer) => /** @type {Round} */ ({ equation: { left, right }, answer, picture: [] });

test('plainDemo: no 0 in the answer and no answer the row shows (R9, architecture 3.8)', () => {
  assert.equal(plainDemo(exercise([3, '+', '?'], [5], 2)), true);
  assert.equal(plainDemo(exercise([10, '+', '?'], [10], 0)), false, 'an edge round: 10 + ? = 10');
  assert.equal(plainDemo(exercise([2, '+', '?'], [4], 2)), false, 'a double: the answer reads as the given part');
  assert.equal(plainDemo(exercise(['?'], [4, '−', 2], 2)), false, 'the answer is a number of the row, on either side');
  assert.equal(plainDemo(exercise(['?', '+', '?'], [5], [2, 3])), true);
  assert.equal(plainDemo(exercise(['?', '+', '?'], [5], [0, 5])), false, 'a pair with 0');
  assert.equal(plainDemo(exercise(['?', '+', '?'], [6], [3, 3])), true, 'a double pair: no number of it is shown');
  assert.equal(plainDemo({ ...exercise([], [], 8), equation: null }), true, 'no row: only 0 is out');
  assert.equal(plainDemo({ ...exercise([], [], 0), equation: null }), false);
  assert.equal(plainDemo({ ...exercise([], [], { left: [5], right: [5] }), equation: null }), true, 'a judging card is no number');
});

test('demoSeedFor: other numbers than the round, plain if any within TRIES, else other numbers (architecture 3.8)', () => {
  const seed = 7;
  const first = demoSeed(seed);
  /** Deals rounds[s - first] from the demo seed on, the real round at the seed itself. */
  const dealer = (real, rounds) => (s) => (s === seed ? real : rounds[s - first] ?? rounds.at(-1));
  const real = exercise([3, '+', '?'], [5], 2);
  // The same answer, then the same row with another answer (a pair), then an edge round, then a plain one.
  const pairs = exercise(['?', '+', '?'], [5], [1, 4]);
  assert.equal(demoSeedFor(dealer(pairs, [exercise(['?', '+', '?'], [5], [2, 3]), exercise(['?', '+', '?'], [6], [2, 4])]), seed), first + 1);
  const rounds = [exercise([2, '+', '?'], [4], 2), exercise([1, '+', '?'], [3], 2), exercise([5, '+', '?'], [5], 0), exercise([4, '+', '?'], [7], 3)];
  assert.equal(demoSeedFor(dealer(real, rounds), seed), first + 3);
  // Only edge rounds with other numbers: the first of them.
  assert.equal(demoSeedFor(dealer(real, [real, exercise([5, '+', '?'], [5], 0), exercise([6, '+', '?'], [6], 0)]), seed), first + 1);
  // Nothing but the round itself: the first demo seed, and TRIES rounds looked at.
  let dealt = 0;
  assert.equal(demoSeedFor((s) => { dealt += 1; return s === seed ? real : exercise([3, '+', '?'], [5], 2); }, seed), first);
  assert.equal(dealt, 1 + TRIES);
  // An answer card is compared as data, whatever its key order.
  assert.equal(same({ left: [5], right: [1, '+', 4] }, { right: [1, '+', 4], left: [5] }), true);
  assert.equal(same([1, 4], [4, 1]), false);
});

test('demoSeedFor: an exercise the session dealt is skipped; when every one was, a plain one dealt longest ago (architecture 3.3, 3.8, hunt 2 #2)', () => {
  const seed = 7;
  const first = demoSeed(seed);
  const dealer = (real, rounds) => (s) => (s === seed ? real : rounds[s - first] ?? rounds.at(-1));
  const real = exercise([3, '+', '?'], [5], 2);
  const [a, b, c] = [exercise([1, '+', '?'], [5], 4), exercise([2, '+', '?'], [3], 1), exercise([4, '+', '?'], [7], 3)];
  /** @type {(stamps: Map<Round, number>) => (round: Round) => number | undefined} when the session dealt a round */
  const by = (stamps) => (round) => stamps.get(round);
  // The first plain round the session has not dealt.
  assert.equal(demoSeedFor(dealer(real, [a, b, c]), seed, by(new Map([[a, 1], [b, 2]]))), first + 2);
  // Not dealt comes before plain: an edge round not dealt, over plain ones dealt.
  const edge = exercise([5, '+', '?'], [5], 0);
  assert.equal(demoSeedFor(dealer(real, [a, edge, b]), seed, by(new Map([[a, 1], [b, 2]]))), first + 1);
  // Every one dealt: the one dealt longest ago, never the last; a plain one before an edge round dealt earlier.
  assert.equal(demoSeedFor(dealer(real, [a, b, c]), seed, by(new Map([[a, 3], [b, 1], [c, 2]]))), first + 1);
  assert.equal(demoSeedFor(dealer(real, [edge, b, c]), seed, by(new Map([[edge, 1], [b, 3], [c, 2]]))), first + 2);
  // Without a session (#/dev), as before: the first plain round.
  assert.equal(demoSeedFor(dealer(real, [a, b, c]), seed), first);
});

test('apartSeed: the first try not dealt; when every try was, the one dealt longest ago, so never the last (architecture 3.3, hunt 2 #11)', () => {
  // Rounds of a pool of n exercises: the seed's exercise is seed mod n.
  const pool = (n) => (/** @type {number} */ s) => `e${s % n}`;
  const seen = new Map([['e0', 1], ['e1', 2]]);
  assert.equal(apartSeed(pool(9), 0, seen), 2, 'the first not dealt');
  assert.equal(apartSeed(pool(9), 4, seen), 4, 'the planned seed when its exercise is new');
  // Every try dealt: the oldest of the tries, whatever the planned seed.
  const all = new Map([['e0', 3], ['e1', 1], ['e2', 2]]);
  assert.equal(pool(3)(apartSeed(pool(3), 0, all)), 'e1');
  assert.equal(pool(3)(apartSeed(pool(3), 2, all)), 'e1');
  // The tries stop at TRIES: an exercise past them is not reached.
  let made = 0;
  assert.equal(apartSeed((s) => { made += 1; return s < 1000 ? 'old' : 'new'; }, 0, new Map([['old', 1]])), 0);
  assert.equal(made, TRIES);
  // A session dealing a pool of 3 over 8 rounds never deals the last exercise again; a pool of 9 deals no repeat.
  for (const n of [3, 7, 9]) {
    for (let start = 0; start < 50; start++) {
      const [dealt, keys] = [new Map(), []];
      for (let i = 0; i < 8; i++) {
        const s = apartSeed(pool(n), (start * 7919 + i * 104729) >>> 0, dealt);
        keys.push(pool(n)(s));
        dealt.set(pool(n)(s), i + 1);
      }
      assert.ok(keys.every((k, i) => i === 0 || k !== keys[i - 1]), `pool ${n}: ${keys.join(' ')}`);
      assert.equal(new Set(keys).size, Math.min(n, 8), `pool ${n}: ${keys.join(' ')}`);
      // Once the pool has run out, each repeat is the exercise dealt longest ago.
      for (let i = n; i < 8; i++) assert.equal(keys[i], keys[i - n], `pool ${n}, round ${i + 1}: ${keys.join(' ')}`);
    }
  }
});
