// The site (architecture 4.6): on e2e/fixture.html the shell's behaviour with the two fixture
// games; on index.html and fixture.html alike, the layout, touch-target, R1, R6, R7 and R10
// checks on home, the parents page and every level through #/dev.
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import * as registry from '../games/registry.js';
import * as parts from '../tests/fixtures/parts/game.js';
import * as scale from '../tests/fixtures/scale/game.js';
import { TOPICS } from '../data/videos.js';
import { rng } from '../shell/rng.js';
import { demoSeedFor, exerciseOf, pickMix, plainDemo } from '../shell/planner.js';
import {
  test, expect, CHILD, FIXTURE, INDEX, NOW, TODAY, YESTERDAY, expectCalm, expectMathLeftToRight, expectRoleColours, expectThumbsDrawn,
  expectTouchTargets, handSeen, ladderAt, look, roundOf, seedStore, skillState, storeWith, stored, watchHand,
} from './helpers.js';

const SITES = [
  { name: 'index.html', path: INDEX, games: Object.values(registry) },
  { name: 'fixture.html', path: FIXTURE, games: [parts, scale] },
];
/** Every level of a site as a #/dev route at seed 1. */
const levelRoutes = (site) => site.games.flatMap((g) => g.levels.map((_, i) => `#/dev/${g.meta.id}/${i + 1}/1`));
/**
 * Every level of a site as a #/dev route at its widest exercise: of seeds 1-400, the round whose row is widest (the
 * level built as #/dev builds it, a mixed value from the seed). Widths in em, as app.css draws the row: a character
 * about 0.6, a `?` slot at least 1.3 (.eq-slot) and as wide as its answer, 0.25 between tokens. Seed 1 where no round
 * has a row. Balance level 8 finds 379, the `10 + 10 = ? + 18` of bug hunt #9.
 */
const widestRoutes = (site) => site.games.flatMap((g) => g.levels.map((base, i) => {
  let [seed, most] = [1, -1];
  for (let s = 1; s <= 400; s++) {
    const { equation, answer } = g.makeRound({ ...base, ...pickMix(base, null, rng(s)) }, rng(s));
    if (!equation) continue;
    const answers = [answer].flat();
    let k = 0;
    const em = (t) => 0.25 + (t === '?' ? Math.max(1.3, 0.6 * String(answers[k++]).length) : 0.6 * String(t).length);
    const width = [...equation.left, '=', ...equation.right].reduce((sum, t) => sum + em(t), 0);
    if (width > most) [seed, most] = [s, width];
  }
  return `#/dev/${g.meta.id}/${i + 1}/${seed}`;
}));

/**
 * A round at the viewport's width keeps main's one column and both 16px gutters, the page has no sideways scroll, and
 * the equation row fits its box at 28px or more, or wrapped (design 5, 6.4, bug hunt #9).
 * @param {import('@playwright/test').Page} page
 * @param {string} where
 */
async function expectGutters(page, where) {
  const m = await page.evaluate(() => {
    const main = document.querySelector('main');
    const s = getComputedStyle(main);
    const content = main.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight);
    const boxes = [...main.querySelectorAll(':scope > :not(.sr-only)')].map((el) => el.getBoundingClientRect()).filter((b) => b.width > 0);
    const row = document.querySelector('.eq');
    return { width: innerWidth, scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth, column: parseFloat(s.gridTemplateColumns),
      content, left: Math.min(...boxes.map((b) => b.left)), right: Math.max(...boxes.map((b) => b.right)),
      over: row.scrollWidth - row.clientWidth, font: parseFloat(getComputedStyle(row).fontSize), wrapped: row.classList.contains('is-wrapped') };
  });
  expect(m.scroll, `${where}: no sideways scroll`).toBeLessThanOrEqual(0);
  expect(Math.abs(m.column - m.content), `${where}: the column, px`).toBeLessThan(0.5);
  expect(m.left, `${where}: left gutter`).toBeGreaterThanOrEqual(16 - 0.5);
  expect(m.right, `${where}: right gutter`).toBeLessThanOrEqual(m.width - 16 + 0.5);
  expect(m.over, `${where}: the row fits its box`).toBeLessThanOrEqual(0);
  expect(m.font >= 28 || m.wrapped, `${where}: 28px or more, or wrapped`).toBe(true);
}

/**
 * Installs the clock at "today", then opens a URL (architecture 4.5: the clock before every goto).
 * @param {import('@playwright/test').Page} page
 * @param {string} url
 */
async function open(page, url) {
  await page.clock.install({ time: NOW });
  await page.goto(url);
}

/** Solves the round on screen as a child does: looks, taps the answer, and looks at the solved round and "הַבָּא". */
async function solve(page) {
  await look(page);
  const { answerAt } = await roundOf(page);
  await page.locator(`button[data-index="${answerAt}"]`).click();
  await expect(page.locator('[data-next]')).toBeVisible();
  await look(page);
}

test('home: the next-step card, a card per game, and no parents link while the links are unverified', async ({ page }) => {
  await open(page, FIXTURE);
  await expect(page).toHaveTitle('סִפְרָה');
  await expect(page.locator('a.next-step')).toHaveAttribute('href', '#/next');
  await expect(page.locator('a.next-step [data-thumb]')).toHaveCount(1);
  await expect(page.locator('[data-card]')).toHaveCount(2);
  await expect(page.locator('[data-card]').nth(0)).toHaveAttribute('href', '#/play/parts');
  await expect(page.locator('[data-card]').nth(1)).toHaveAttribute('href', '#/play/scale');
  await expect(page.locator('[data-parents]')).toHaveCount(0);
  await expect(page.locator('a[href^="#/dev"]')).toHaveCount(0);
});

test('next step: an empty store opens the first game at level 1, and the jump is logged', async ({ page }) => {
  await open(page, `${FIXTURE}#/next`);
  await expect(page).toHaveURL(/#\/play\/parts$/);
  await expect(page.locator('main[data-screen="demo"]')).toHaveAttribute('data-level', '1');
  const { child } = await stored(page);
  expect(child.events).toEqual([expect.objectContaining({ type: 'jump', game: 'parts', from: null, to: 1, skill: 'num.parts.split', day: TODAY })]);
  expect(child.games.parts.fast).toBe('split-5');
});

test('next step: a passed skill opens the next one, in another game when it comes from there', async ({ page }) => {
  const split = ['split-5', 'split-10', 'split-sym'];
  await seedStore(page, storeWith({ games: { parts: ladderAt('split-sym', { passed: split }) } }));
  await open(page, `${FIXTURE}#/next`);
  await expect(page.locator('main[data-screen="demo"]')).toHaveAttribute('data-level', '4');
  await page.evaluate((v) => localStorage.setItem('sifra', JSON.stringify(v)), storeWith({ games: { parts: ladderAt('ten', { passed: [...split, 'ten'] }) } }));
  await page.goto(`${FIXTURE}?again#/next`);
  await expect(page).toHaveURL(/#\/play\/scale$/);
  await expect(page.locator('main[data-screen="demo"]')).toHaveAttribute('data-game', 'scale');
});

test('the level is kept after a reload: one first try climbs to level 2', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page, `${FIXTURE}#/play/parts`);
  await expect(page.locator('main[data-screen="demo"] [data-next]')).toBeVisible();
  await look(page);
  await page.locator('[data-next]').click();
  await expect(page.locator('main[data-screen="round"]')).toHaveAttribute('data-level', '1');
  await solve(page);
  const { child } = await stored(page);
  expect(child.games.parts.level).toBe('split-10');
  expect(child.attempts.at(-1)).toMatchObject({ outcome: 'first', level: 1, levelBefore: 1, levelAfter: 2, demo: ['auto'], child: expect.stringMatching(/^c[0-9a-f]{8}$/) });
  await page.reload();
  await expect(page.locator('main[data-screen="round"]')).toHaveAttribute('data-level', '2');
  await expect(page.locator('main[data-screen="round"]')).toHaveAttribute('data-kind', 'new');
});

test('review: a level passed yesterday opens the session with a review round from another game where the child passed a level', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seedStore(page, storeWith({
    games: { parts: ladderAt('split-sym', { passed: ['split-5', 'split-10'] }) },
    skills: { 'num.parts.split': skillState({ last: YESTERDAY, passedDay: YESTERDAY, due: TODAY }) },
  }));
  await page.clock.setFixedTime(NOW);
  await page.goto(`${FIXTURE}#/play/scale`);
  const main = page.locator('main[data-screen="round"]');
  await expect(main).toHaveAttribute('data-kind', 'review');
  await expect(main).toHaveAttribute('data-game', 'parts');
  await expect(main).toHaveAttribute('data-level', '2');
  await solve(page);
  const { child } = await stored(page);
  expect(child.attempts.at(-1)).toMatchObject({ kind: 'review', outcome: 'first', sinceDays: 1, levelBefore: 3, levelAfter: 3 });
  expect(child.skills['num.parts.split']).toMatchObject({ box: 1, due: '2026-10-17', reviewDays: [TODAY], lastReviewFirst: true });
  await page.locator('[data-next]').click();
  await expect(page.locator('main[data-screen="demo"]')).toHaveAttribute('data-game', 'scale');
});

test('R9: the first entry to a demo level runs the demo and writes no attempt; the hand logs how; the bar keeps the rounds done', async ({ page }) => {
  await open(page, `${FIXTURE}#/play/parts`);
  await expect(page.locator('main[data-screen="demo"] [data-demo] [data-hand]')).toBeVisible();
  await expect(page.locator('main[data-screen="demo"]')).toHaveAttribute('data-solved', '');
  await expect(page.locator('[data-next]')).toBeVisible();
  let { child } = await stored(page);
  expect(child.attempts).toEqual([]);
  expect(child.games.parts.demoSeen).toEqual(['split-5']);
  await look(page);
  await page.locator('[data-next]').click();
  const seed = await page.locator('main[data-screen="round"]').getAttribute('data-seed');
  await look(page);
  await page.locator('[data-how]').click();
  await expect(page.locator('main[data-screen="demo"]')).toBeVisible();
  await expect(page.locator('[data-next]')).toBeVisible();
  await look(page);
  await page.locator('[data-next]').click();
  await expect(page.locator('main[data-screen="round"]')).toHaveAttribute('data-seed', seed);
  await solve(page);
  ({ child } = await stored(page));
  expect(child.attempts).toHaveLength(1);
  // The round opened with the auto demo, then the hand: both are logged.
  expect(child.attempts[0]).toMatchObject({ outcome: 'help', help: ['how'], demo: ['auto', 'how'], wrong: [] });
  await page.locator('[data-next]').click();
  await expect(page.locator('main[data-screen="round"] [role="progressbar"]')).toHaveAttribute('aria-valuenow', '1');
  await look(page);
  await page.locator('[data-how]').click();
  await expect(page.locator('main[data-screen="demo"] [role="progressbar"]')).toHaveAttribute('aria-valuenow', '1');
  await expect(page.locator('[data-next]')).toBeVisible();
  await look(page);
  await page.locator('[data-next]').click();
  await solve(page);
  expect((await stored(page)).child.attempts[1]).toMatchObject({ help: ['how'], demo: ['how'] });
});

// "Show me how" in a session (3.3, 3.8; hunt 2 #2): its exercise is none the session dealt, and counts as dealt. At
// split-5 (8 exercises, its demo seen) with "show me how" on round 2: rounds 1-7 and the demo are the 8 exercises, and
// round 8 deals the oldest again, round 1's. Not counted, the 8 rounds deal all 8 and so the demo's. Every round is
// helped, so the ladder stays at level 1.
for (const seed of [1, 2]) {
  test(`"show me how" on round 2 solves an exercise the session has not dealt, and the rounds after it come apart from it (seed ${seed})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await seedStore(page, storeWith({ games: { parts: ladderAt('split-5') } }));
    await open(page, `${FIXTURE}?seed=${seed}#/play/parts`);
    const [rounds, unlocked] = [[], () => expect(page.locator('[data-choices]')).not.toHaveAttribute('data-locked')];
    let how = null;
    for (let n = 1; n <= 8; n++) {
      await expect(page.locator('main[data-screen="round"]')).toHaveAttribute('data-level', '1');
      await look(page);
      if (n === 2) {
        await page.locator('[data-how]').click();
        await expect(page.locator('main[data-screen="demo"] [data-next]')).toBeVisible();
        how = exerciseOf('parts', (await roundOf(page)).round);
        await look(page);
        await page.locator('[data-next]').click();
        await expect(page.locator('main[data-screen="round"]')).toBeVisible();
        await look(page);
      }
      const { round, answerAt } = await roundOf(page);
      rounds.push(exerciseOf('parts', round));
      // One wrong card, then the answer: every round helped.
      await page.locator(`button[data-index="${answerAt === 0 ? 1 : 0}"]`).click();
      await unlocked();
      await page.locator(`button[data-index="${answerAt}"]`).click();
      await expect(page.locator('[data-next]')).toBeVisible();
      await look(page);
      await page.locator('[data-next]').click();
    }
    const all = `demo ${how}; rounds ${rounds.join(', ')}`;
    expect(rounds, all).not.toContain(how);
    expect(new Set([...rounds.slice(0, 7), how]).size, all).toBe(8);
    expect(rounds[7], all).toBe(rounds[0]);
    expect((await stored(page)).child.attempts.map((a) => [a.levelId, a.demo])).toEqual(
      Array.from({ length: 8 }, (_, i) => ['split-5', i === 1 ? ['how'] : []]));
  });
}

// An entry demo writes the store as it starts only what is new (3.9, hunt 2 #15): play() wrote the session count, so a
// game with its ladder is written once before the hand taps the answer, a game played for the first time once more
// for its new ladder; then once when the demo is seen. Each write of the key is logged with whether the demo was solved.
for (const [what, games, start] of /** @type {[string, Record<string, any>, number][]} */ ([
  ['a game with its ladder', { parts: ladderAt('split-5', { demoSeen: [] }) }, 1],
  ['a game played for the first time', {}, 2],
])) {
  test(`an entry demo writes the store ${start === 1 ? 'once' : 'twice'} before the hand taps the answer, then once as it is seen: ${what} (3.9, hunt 2 #15)`, async ({ page }) => {
    await seedStore(page, storeWith({ games }));
    await page.addInitScript(() => {
      const set = Storage.prototype.setItem;
      /** @type {string[]} */
      const writes = [];
      Object.assign(globalThis, { writes });
      Storage.prototype.setItem = function (key, value) {
        if (this === localStorage && key === 'sifra') writes.push(document.querySelector('main[data-solved]') ? 'seen' : 'start');
        return set.call(this, key, value);
      };
    });
    await open(page, `${FIXTURE}#/`);
    await expect(page.locator('main[data-screen="home"]')).toBeVisible();
    await look(page);
    await page.locator('a.game-card[href="#/play/parts"]').click();
    await expect(page.locator('main[data-screen="demo"]')).toHaveAttribute('data-solved', '', { timeout: 15000 });
    await expect.poll(() => page.evaluate(() => /** @type {any} */ (globalThis).writes)).toEqual([...Array(start).fill('start'), 'seen']);
    const { child } = await stored(page);
    expect(child.sessions).toBe(1);
    expect(child.games.parts.demoSeen).toEqual(['split-5']);
  });
}

/**
 * The middle of a demo: the hand held on its way to the answer, and let go (the page's clock does not move CSS
 * motion, dev-spec R10).
 */
const holdHand = (page, hold = true) =>
  page.locator('[data-hand]').evaluate((el, on) => el.getAnimations().forEach((a) => (on ? a.pause() : a.play())), hold);

test('R9: a level\'s first demo is seen only once the hand has tapped the answer: a reload mid-demo brings it back', async ({ page }) => {
  const demo = page.locator('main[data-screen="demo"]');
  await open(page, `${FIXTURE}#/play/parts`);
  await expect(demo).toHaveAttribute('data-level', '1');
  await holdHand(page);
  await page.reload();
  await expect(demo).toHaveAttribute('data-level', '1');
  await holdHand(page);
  const { child } = await stored(page);
  expect(child.sessions).toBe(2);
  expect(child.games.parts.demoSeen).toEqual([]);
  await holdHand(page, false);
  await expect(demo).toHaveAttribute('data-solved', '');
  expect((await stored(page)).child.games.parts.demoSeen).toEqual(['split-5']);
  await expect(page.locator('[data-next]')).toBeVisible();
  await look(page);
  await page.locator('[data-next]').click();
  await expect(page.locator('main[data-screen="round"]')).toHaveAttribute('data-level', '1');
});

test('R9: leaving a level\'s first demo for home brings it back on the next step', async ({ page }) => {
  const demo = page.locator('main[data-screen="demo"]');
  await open(page, `${FIXTURE}#/next`);
  await expect(demo).toHaveAttribute('data-level', '1');
  await holdHand(page);
  await look(page);
  await page.locator('[data-home]').click();
  await expect(page.locator('main[data-screen="home"]')).toBeVisible();
  await look(page);
  await page.locator('a.next-step').click();
  await expect(demo).toHaveAttribute('data-level', '1');
  await expect(demo).toHaveAttribute('data-solved', '');
  const { child } = await stored(page);
  expect(child.games.parts.demoSeen).toEqual(['split-5']);
  expect(child.attempts).toEqual([]);
});

// Seeds where the raw demo seed, demoSeed(seed), deals the round's own answer, so a shell that skipped
// demoSeedFor fails here (a fixture, and a real game with a mixed level).
for (const [site, route] of [[FIXTURE, 'parts/1/3'], [INDEX, 'ten-frame/1/3'], [INDEX, 'balance/4/2'], [INDEX, 'stories/8/1']]) {
  test(`R9: the hand shows how on the round demoSeedFor picks: other answer, plain (3.8): ${route}`, async ({ page }) => {
    await open(page, `${site}#/dev/${route}`);
    const real = await roundOf(page);
    await look(page);
    await page.locator('[data-how]').click();
    await expect(page.locator('main[data-screen="demo"]')).toBeVisible();
    const shown = await roundOf(page);
    const make = (/** @type {number} */ s) => real.game.makeRound(real.level, rng(s));
    expect(Number(shown.data.seed)).toBe(demoSeedFor(make, Number(real.data.seed)));
    expect(shown.level).toEqual(real.level);
    expect(shown.round.answer).not.toEqual(real.round.answer);
    expect(plainDemo(shown.round)).toBe(true);
  });
}

// The demo's hand on a phone held sideways (2.6, the hunt of 2026-10-31), at every level of every game: the round
// is taller than the screen, so the page scrolls to each tap, the hand and what it taps on screen; the hand steps off
// the picture before the hint and the tour, so no tour digit is under it; "הַבָּא" is on screen at the end.
for (const game of Object.values(registry)) {
  for (const [i, level] of game.levels.entries()) {
    test(`R9 at 568×320: the hand on screen at every tap, over no tour digit, "הַבָּא" on screen: ${game.meta.id} ${i + 1} (${level.id})`, async ({ page }) => {
      await page.setViewportSize({ width: 568, height: 320 });
      await open(page, `${INDEX}#/dev/${game.meta.id}/${i + 1}/1`);
      await expect(page.locator('main[data-screen="round"]')).toBeVisible();
      await look(page);
      await watchHand(page);
      await page.locator('[data-how]').click();
      await expect(page.locator('main[data-screen="demo"]')).toHaveAttribute('data-solved', '', { timeout: 20000 });
      await expect(page.locator('[data-next]')).toBeInViewport({ ratio: 1 });
      const { covered, taps } = await handSeen(page);
      expect(covered, 'tour digits under the hand').toEqual([]);
      expect(taps.length).toBeGreaterThan(0);
      for (const tap of taps) {
        expect(tap.top >= 0 && tap.bottom <= tap.screen, `a tap at ${tap.top}-${tap.bottom} on a ${tap.screen}px screen`).toBe(true);
        expect(tap.moving, 'the hand had stopped when it tapped').toBe(false);
      }
    });
  }
}

// The hand at rest on a short phone (2.6, hunt 2 #1): its place at the foot of the round lies on the cards at 320×568
// and 375×548, so at rest it is hidden: while the hint or the tour is drawn, no visible hand rests on a card. A
// judging round (balance 10) never moves the hand before its tap. The real first screen too: the entry demo.
for (const size of [{ width: 320, height: 568 }, { width: 375, height: 548 }]) {
  for (const route of ['ten-frame/1/2', 'ten-frame/4/1', 'balance/2/1', 'balance/10/1', 'stories/1/1']) {
    test(`R9 at ${size.width}×${size.height}: the hand at rest is on no card while the hint or the tour is drawn: ${route}`, async ({ page }) => {
      await page.setViewportSize(size);
      await open(page, `${INDEX}#/dev/${route}`);
      await expect(page.locator('main[data-screen="round"]')).toBeVisible();
      await look(page);
      await watchHand(page);
      await page.locator('[data-how]').click();
      await expect(page.locator('main[data-screen="demo"]')).toHaveAttribute('data-solved', '', { timeout: 20000 });
      expect((await handSeen(page)).onCards, 'cards under the resting hand').toEqual([]);
    });
  }
}

test('R9 at 320×568: the first screen\'s entry demo rests the hand on no card while the tour counts (2.6, hunt 2 #1)', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await watchHand(page, { fromStart: true });
  await open(page, `${INDEX}#/next`);
  await expect(page.locator('main[data-screen="demo"]')).toHaveAttribute('data-solved', '', { timeout: 20000 });
  const { onCards, taps } = await handSeen(page);
  expect(taps.some((t) => t.tour), 'the tour was drawn before a tap').toBe(true);
  expect(onCards, 'cards under the resting hand').toEqual([]);
});

/** Turns the phone: a new viewport size, once the page has had its resize event. */
async function turn(page, size) {
  const resized = page.evaluate(() => new Promise((done) => addEventListener('resize', () => done(null), { once: true })));
  await page.setViewportSize(size);
  await resized;
}

/** The hand's box once it stops: every animation of the hand run to its end (a held one too). */
const handAtRest = (page) => page.locator('[data-hand]').evaluate((hand) => {
  hand.getAnimations().forEach((a) => a.finish());
  const { left, top, right, bottom, width } = hand.getBoundingClientRect();
  return { left, top, right, bottom, tip: { x: left + width / 2, y: top } };
});

test('R9: the hand aims again when the phone turns: mid-demo it stays on the round, off the bar; after it, it points at "הַבָּא" (2.6)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, `${INDEX}#/dev/ten-frame/10/3`);
  await look(page);
  await page.locator('[data-how]').click();
  // Level 10's hand taps counter after counter: held on its way to one, the phone turns.
  await expect(page.locator('main[data-screen="demo"] [data-hand]')).toHaveAttribute('style', /translate/);
  await holdHand(page);
  await turn(page, { width: 844, height: 390 });
  const hand = await handAtRest(page);
  const bar = await page.locator('main[data-screen="demo"] header.bar').boundingBox();
  const demo = await page.locator('[data-demo]').boundingBox();
  expect(hand.top, 'the hand is below the bar').toBeGreaterThanOrEqual(bar.y + bar.height);
  expect(hand.left >= demo.x && hand.right <= demo.x + demo.width && hand.bottom <= demo.y + demo.height, 'the hand is on the demo').toBe(true);
  await holdHand(page, false);
  await expect(page.locator('[data-next]')).toBeVisible({ timeout: 15000 });
  // Turned back after the demo: the hand points at "הַבָּא", in the answer card's place.
  await turn(page, { width: 390, height: 844 });
  const { tip } = await handAtRest(page);
  const next = await page.locator('[data-next]').boundingBox();
  expect(tip.x >= next.x && tip.x <= next.x + next.width && tip.y >= next.y && tip.y <= next.y + next.height,
    `the hand's tip (${tip.x}, ${tip.y}) is on "הַבָּא" (${next.x}, ${next.y}, ${next.width}×${next.height})`).toBe(true);
});

test('R9: a turn while the hand is on its way: it taps once it has reached the answer card\'s new place (2.6)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // Level 10's demo has no pans to touch: the hand's first move is to the answer card.
  await open(page, `${INDEX}#/dev/balance/10/1`);
  await look(page);
  await watchHand(page);
  // The hand is held at the start of its first move, as soon as it sets out.
  await page.evaluate(() => new MutationObserver((records, observer) => {
    const hand = records.map((r) => r.target).find((t) => t instanceof HTMLElement && t.matches('[data-hand]') && t.style.transform);
    if (!(hand instanceof HTMLElement)) return;
    observer.disconnect();
    hand.getAnimations().forEach((a) => a.pause());
    Object.assign(globalThis, { handHeld: true });
  }).observe(document, { subtree: true, attributes: true, attributeFilter: ['style'] }));
  await page.locator('[data-how]').click();
  await page.waitForFunction(() => /** @type {any} */ (globalThis).handHeld);
  const { answerAt } = await roundOf(page);
  await turn(page, { width: 844, height: 390 });
  await holdHand(page, false);
  await expect(page.locator('main[data-screen="demo"]')).toHaveAttribute('data-solved', '', { timeout: 15000 });
  const { taps } = await handSeen(page);
  expect(taps).toHaveLength(1);
  expect(taps[0].moving, 'the hand had stopped when it tapped').toBe(false);
  expect(taps[0].card, 'the hand\'s tip on the answer card when it tapped').toBe(answerAt);
});

// The double-tap window (design 6.9, shell/taps.js): the shell drops a tap that comes within 300 ms
// of a new screen or of "הַבָּא" appearing, by the events' timeStamps. The page's clock stamps the
// events (page.clock fakes Event.timeStamp along with performance.now), so on a paused clock every
// tap carries the same time until runFor moves it: the window is exact, and the same in Chromium
// and WebKit (iOS Safari counts no taps in click.detail; the window counts none).

/**
 * Opens a URL at "today", then pauses the clock a minute on: events get one time stamp until runFor.
 * @param {import('@playwright/test').Page} page
 * @param {string} url
 */
async function openPaused(page, url) {
  await open(page, url);
  await expect(page.locator('main')).toBeVisible();
  await page.clock.pauseAt(new Date(NOW.getTime() + 60000));
}

/** Two touchscreen taps at the middle of an element, at one time on the paused clock: one double tap. */
async function doubleTap(page, locator) {
  const box = await locator.boundingBox();
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  await page.touchscreen.tap(x, y);
  await page.touchscreen.tap(x, y);
}

/** The index of the card now under the middle of a box (-1 for none). */
const cardAt = (page, box) => page.evaluate(([x, y]) =>
  Number(document.elementFromPoint(x, y)?.closest('button[data-index]')?.getAttribute('data-index') ?? -1), [box.x + box.width / 2, box.y + box.height / 2]);

test('a double tap on the right card with reduced motion: "הַבָּא" is born under the finger, and the second tap does not skip the solved round (design 6.9)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seedStore(page, storeWith({ games: { parts: ladderAt('split-10') } }));
  await openPaused(page, `${FIXTURE}#/play/parts`);
  await look(page);
  const { answerAt, data } = await roundOf(page);
  await doubleTap(page, page.locator(`button[data-index="${answerAt}"]`));
  await expect(page.locator('[data-next]')).toBeVisible();
  await expect(page.locator('main[data-screen="round"]')).toHaveAttribute('data-solved', '');
  await expect(page.locator('main[data-screen="round"]')).toHaveAttribute('data-seed', data.seed);
  await expect(page.locator('[role="progressbar"]')).toHaveAttribute('aria-valuenow', '0');
  // After the window a tap is taken, on "הַבָּא": it is still there, so the second tap left it.
  await look(page);
  await page.locator('[data-next]').click();
  await expect(page.locator('[role="progressbar"]')).toHaveAttribute('aria-valuenow', '1');
});

for (const [name, route] of [['a session', '#/play/parts'], ['#/dev', '#/dev/parts/2/1']]) {
  test(`${name}: a double tap on "הַבָּא" starts the next round, and the second tap does not answer it (design 6.9)`, async ({ page }) => {
    await seedStore(page, storeWith({ games: { parts: ladderAt('split-10') } }));
    await openPaused(page, `${FIXTURE}${route}`);
    await solve(page);
    const before = await page.locator('main[data-screen="round"]').getAttribute('data-seed');
    const next = page.locator('[data-next]');
    const box = await next.boundingBox();
    await doubleTap(page, next);
    await expect(page.locator('main[data-screen="round"]')).not.toHaveAttribute('data-seed', before);
    await expect(page.locator('[data-choices]')).toBeVisible();
    // After the window, a wrong card that was not under the finger: the only card retired, and the
    // round's only miss, so the second tap answered nothing (had it, this tap would find no cards).
    await look(page);
    const { round, answerAt } = await roundOf(page);
    const under = await cardAt(page, box);
    const wrong = round.choices.findIndex((c, i) => c.rule && i !== under);
    await page.locator(`button[data-index="${wrong}"]`).click();
    await expect(page.locator(`button[data-index="${wrong}"]`)).toHaveClass(/is-retired/);
    await expect(page.locator('button[data-index].is-retired')).toHaveCount(1);
    await expect(page.locator('[data-choices]')).not.toHaveAttribute('data-locked');
    await look(page);
    await page.locator(`button[data-index="${answerAt}"]`).click();
    await expect(page.locator('[data-next]')).toBeVisible();
    if (route.startsWith('#/play')) {
      expect((await stored(page)).child.attempts.at(-1)).toMatchObject({ outcome: 'help', wrong: [round.choices[wrong].rule], taps: { picture: 0, equation: 0, other: 0 } });
    }
  });
}

test('the window\'s edge: a tap 299 ms after "הַבָּא" or a new round appears is dropped, at 300 ms it is taken (design 6.9)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seedStore(page, storeWith({ games: { parts: ladderAt('split-10') } }));
  await openPaused(page, `${FIXTURE}#/play/parts`);
  await look(page);
  let { answerAt } = await roundOf(page);
  await page.locator(`button[data-index="${answerAt}"]`).click();
  await expect(page.locator('[data-next]')).toBeVisible();
  // Each tap finds what it taps only if the one 1 ms before it was dropped.
  await page.clock.runFor(299);
  await page.locator('[data-next]').click();
  await page.clock.runFor(1);
  await page.locator('[data-next]').click();
  await expect(page.locator('[role="progressbar"]')).toHaveAttribute('aria-valuenow', '1');
  ({ answerAt } = await roundOf(page));
  await page.clock.runFor(299);
  await page.locator(`button[data-index="${answerAt}"]`).click();
  await page.clock.runFor(1);
  await page.locator(`button[data-index="${answerAt}"]`).click();
  await expect(page.locator('main[data-screen="round"]')).toHaveAttribute('data-solved', '');
  expect((await stored(page)).child.attempts.map((a) => a.outcome)).toEqual(['first', 'first']);
});

test('a double tap on the end screen\'s home button opens home and stays there (design 6.9)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seedStore(page, storeWith({ games: { parts: ladderAt('split-10') } }));
  await openPaused(page, `${FIXTURE}?seed=1#/play/parts`);
  const screen = page.locator('main[data-screen]');
  for (let n = 0; n < 20; n++) {
    await expect(screen).toHaveAttribute('data-screen', /^(round|demo|end)$/);
    const name = await screen.getAttribute('data-screen');
    if (name === 'end') break;
    if (name === 'round') await solve(page);
    await expect(page.locator('[data-next]')).toBeVisible();
    await look(page);
    await page.locator('[data-next]').click();
  }
  await expect(page.locator('main[data-screen="end"]')).toBeVisible();
  await look(page);
  await doubleTap(page, page.locator('[data-home]'));
  await expect(page.locator('main[data-screen="home"]')).toBeVisible();
  // After the window a game card is taken: home was still on screen, so the second tap opened nothing.
  await look(page);
  await page.locator('[data-card]').first().click();
  await expect(page).toHaveURL(/#\/play\/parts$/);
});

test('every screen opens at its top: a round opened from a home page scrolled down on a landscape phone (3.2, playtest 2026-10-31)', async ({ page }) => {
  await page.setViewportSize({ width: 568, height: 320 });
  await open(page, `${INDEX}#/`);
  const last = page.locator('[data-card]').last();
  await last.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0);
  await look(page);
  await last.click();
  await expect(page.locator('main[data-screen="round"], main[data-screen="demo"]')).toBeVisible();
  expect(await page.evaluate(() => scrollY)).toBe(0);
});

test('a card the shell focused shows no ring until a key is pressed; a pointer hides it again (3.2, playtest 2026-10-31)', async ({ page }) => {
  await open(page, `${INDEX}#/dev/stories/1/1`);
  const first = page.locator('button[data-index="0"]');
  await expect(first).toBeFocused();
  const ring = () => first.evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(await ring()).toBe('none');
  await page.keyboard.press('Shift');
  expect(await ring()).toBe('solid');
  await page.mouse.click(2, 2);
  await first.focus();
  expect(await ring()).toBe('none');
});

test('"הַבָּא" the shell focused shows no ring until a key is pressed, after a direct load into a demo (design 6.9, bug hunt #7)', async ({ page }) => {
  // A fresh store: #/play/ten-frame opens level 1's demo; its solve focuses "הַבָּא" with no tap before it.
  await open(page, `${INDEX}#/play/ten-frame`);
  const next = page.locator('main[data-screen="demo"] [data-next]');
  await expect(next).toBeVisible({ timeout: 15000 });
  await expect(next).toBeFocused();
  const ring = () => next.evaluate((el) => `${getComputedStyle(el).outlineStyle} ${getComputedStyle(el).outlineWidth}`);
  expect(await ring()).toMatch(/^none/);
  await page.keyboard.press('Shift');
  expect(await ring()).toBe('solid 4px');
});

test('a press and hold is a tap: no iOS link menu or text selection on the child\'s screens; the parents page, #/dev and the export keep selection (bug hunt #17)', async ({ page }) => {
  const select = (locator) => locator.evaluate((el) => { const s = getComputedStyle(el); return s.userSelect || s.webkitUserSelect; });
  // Chromium has no touch callout: there it reads as the default.
  const callout = (locator) => locator.evaluate((el) => getComputedStyle(el).webkitTouchCallout ?? 'default');
  await open(page, `${INDEX}#/`);
  await expect(page.locator('.next-step')).toBeVisible();
  expect(await select(page.locator('.next-step'))).toBe('none');
  expect(await select(page.locator('[data-card]').first())).toBe('none');
  await expect(page.locator('main')).not.toHaveAttribute('data-adult');
  await page.evaluate(() => { location.hash = '#/play/balance'; });
  await expect(page.locator('main[data-screen="round"], main[data-screen="demo"]')).toBeVisible();
  for (const sel of ['.eq', '.card']) expect(await select(page.locator(sel).first()), sel).toBe('none');
  await expect(page.locator('main')).not.toHaveAttribute('data-adult');
  // The adults' screens: app.js's one list marks them data-adult, and app.css keeps their selection and menu.
  for (const [hash, screen, sel] of [['#/parents', 'parents', 'main a'], ['#/dev', 'dev', 'main a'], ['#/dev/export', 'export', 'main']]) {
    await page.evaluate((h) => { location.hash = h; }, hash);
    await expect(page.locator(`main[data-screen="${screen}"]`)).toBeVisible();
    await expect(page.locator('main'), hash).toHaveAttribute('data-adult', '');
    expect(await select(page.locator(sel).first()), hash).not.toBe('none');
    expect(await callout(page.locator(sel).first()), `${hash}: the iOS menu`).not.toBe('none');
  }
  await page.evaluate(() => { location.hash = '#/dev/balance/1/1'; });
  await expect(page.locator('[data-dev]')).toBeVisible();
  expect(await select(page.locator('[data-dev]'))).toBe('text');
});

test('a press and hold opens no browser menu on the child\'s screens (Android Chrome\'s link menu is contextmenu); the parents page, #/dev and the export keep it (bug hunt #17)', async ({ page }) => {
  // Whether the page cancelled the contextmenu a long press fires, so the browser shows no menu.
  const cancelled = (locator) => locator.evaluate((el) => !el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })));
  await open(page, `${INDEX}#/`);
  await expect(page.locator('.next-step')).toBeVisible();
  for (const sel of ['.next-step', '[data-card]', 'h2']) expect(await cancelled(page.locator(sel).first()), `home ${sel}`).toBe(true);
  await page.evaluate(() => { location.hash = '#/dev/balance/2/5'; });
  await expect(page.locator('[data-choices]')).toBeVisible();
  for (const sel of ['.eq', '.card', '[data-area="picture"]']) expect(await cancelled(page.locator(sel).first()), `round ${sel}`).toBe(true);
  expect(await cancelled(page.locator('.dev-json')), 'the round\'s JSON on #/dev').toBe(false);
  await page.evaluate(() => { location.hash = '#/parents'; });
  await expect(page.locator('main[data-screen="parents"]')).toBeVisible();
  expect(await cancelled(page.locator('main[data-screen="parents"] a').first()), 'a parents link').toBe(false);
  await page.evaluate(() => { location.hash = '#/dev'; });
  await expect(page.locator('main[data-screen="dev"]')).toBeVisible();
  expect(await cancelled(page.locator('main[data-screen="dev"] a').first()), 'a #/dev link').toBe(false);
  await page.evaluate(() => { location.hash = '#/dev/export'; });
  await expect(page.locator('main[data-screen="export"]')).toBeVisible();
  expect(await cancelled(page.locator('[data-export]')), 'the export button').toBe(false);
});

test('a locked card does not sink under the finger; held until the lock ends, it sinks, and on release it is taken (design 6.5, bug hunt #18)', async ({ page }) => {
  await open(page, `${INDEX}#/dev/balance/2/5`);
  await look(page);
  const { round, answerAt } = await roundOf(page);
  const [first, second] = round.choices.flatMap((c, i) => (i === answerAt ? [] : [i]));
  // The display's animations are held, so the cards stay locked however slow the machine (the lock ends when they
  // do, lib/settle.js); 150 ms of a finger on a card would show its sink (--t-press, 100 ms).
  const hold = await page.addStyleTag({ content: '[data-area="picture"] * { animation-play-state: paused !important; }' });
  await page.locator(`button[data-index="${first}"]`).click();
  await expect(page.locator('[data-choices]')).toHaveAttribute('data-locked', '');
  const other = page.locator(`button[data-index="${second}"]`);
  const box = await other.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  const moved = () => other.evaluate((el) => getComputedStyle(el).transform);
  await page.waitForTimeout(150);
  await expect(page.locator('[data-choices]')).toHaveAttribute('data-locked', '');
  expect(await moved()).toBe('none');
  await hold.evaluate((s) => s.remove());
  await expect(page.locator('[data-choices]')).not.toHaveAttribute('data-locked', { timeout: 10000 });
  await expect.poll(moved).toBe('matrix(1, 0, 0, 1, 0, 3)');
  await page.mouse.up();
  await expect(other).toHaveClass(/is-retired/);
});

// Off-target taps (pedagogy 5.7, hunt 2 #6): a press counts once it ends as a tap. A scroll (the browser takes the
// touch: pointercancel) and a pinch (a second finger before the first is lifted) are no taps. On a phone held sideways
// every round needs a scroll to reach its cards.
test('an off-target tap counts once it ends as a tap: a scroll and a pinch on the picture are not taps (pedagogy 5.7, hunt 2 #6)', async ({ page }) => {
  await page.setViewportSize({ width: 568, height: 320 });
  await seedStore(page, storeWith({ games: { parts: ladderAt('split-10') } }));
  await open(page, `${FIXTURE}?seed=1#/play/parts`);
  await expect(page.locator('main[data-screen="round"]')).toBeVisible();
  await look(page);
  const paper = page.locator('[data-area="picture"]');
  await paper.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const at = { clientX: box.left + box.width / 2, clientY: box.top + box.height / 2, bubbles: true, pointerType: 'touch' };
    const fire = (/** @type {string} */ type, /** @type {number} */ id, /** @type {boolean} */ isPrimary) =>
      el.dispatchEvent(new PointerEvent(type, { ...at, pointerId: id, isPrimary }));
    // A scroll: the browser takes the touch and cancels the pointer.
    fire('pointerdown', 11, true);
    fire('pointercancel', 11, true);
    // A pinch: a second finger comes down before the first is lifted.
    fire('pointerdown', 12, true);
    fire('pointerdown', 13, false);
    fire('pointerup', 13, false);
    fire('pointerup', 12, true);
  });
  // One real tap on the paper.
  const box = await paper.boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await look(page);
  await page.locator(`button[data-index="${(await roundOf(page)).answerAt}"]`).click();
  await expect(page.locator('[data-next]')).toBeVisible();
  expect((await stored(page)).child.attempts.at(-1)).toMatchObject({ outcome: 'first', taps: { picture: 1, equation: 0, other: 0 } });
});

test('a real swipe up the picture scrolls the page and logs no off-target tap (pedagogy 5.7, hunt 2 #6)', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'the touch drag goes through Chromium\'s DevTools protocol');
  await page.setViewportSize({ width: 568, height: 320 });
  await seedStore(page, storeWith({ games: { parts: ladderAt('split-10') } }));
  await open(page, `${FIXTURE}?seed=1#/play/parts`);
  await expect(page.locator('main[data-screen="round"]')).toBeVisible();
  await look(page);
  const box = await page.locator('[data-area="picture"]').boundingBox();
  const [x, y] = [Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2)];
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  await touch('touchStart', [{ x, y }]);
  for (let dy = 10; dy <= 120; dy += 10) await touch('touchMove', [{ x, y: y - dy }]);
  await touch('touchEnd', []);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
  await look(page);
  await page.locator(`button[data-index="${(await roundOf(page)).answerAt}"]`).click();
  await expect(page.locator('[data-next]')).toBeVisible();
  expect((await stored(page)).child.attempts.at(-1)).toMatchObject({ outcome: 'first', taps: { picture: 0, equation: 0, other: 0 } });
});

test('a wide exercise never widens the page\'s column: the gutters stay and the row shrinks or wraps (design 5, 6.4, bug hunt #9)', async ({ page }) => {
  // 10 + 10 = ? + 18, the widest exercise of balance level 8 (seeds 379, 577, 699 of 3000).
  for (const [width, height] of [[320, 568], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await open(page, `${INDEX}?w=${width}#/dev/balance/8/379`);
    await expect(page.locator('[data-choices]')).toBeVisible();
    await expectGutters(page, `${width}×${height}`);
  }
});

for (const site of SITES) {
  test(`${site.name}: each level's widest exercise at 320×568 keeps both gutters and no sideways scroll, before and after the solve (design 5, 6.4, bug hunt #9)`, async ({ page }) => {
    test.setTimeout(120000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 320, height: 568 });
    await open(page, site.path);
    for (const hash of widestRoutes(site)) {
      await page.goto(`${site.path}${hash}`);
      await expect(page.locator('[data-choices]')).toBeVisible();
      await expectGutters(page, hash);
      await solve(page);
      await expectGutters(page, `${hash} solved`);
    }
  });
}

test('a turned phone fits the exercise again: shrunk on the narrow screen, full size back on the wide one (design 5, 6.4)', async ({ page }) => {
  // 10 + 10 = ? + 18 fits at 48px held sideways and needs 31.2px at 320: fitted once, turned, it spilled 8px into each gutter.
  await page.setViewportSize({ width: 568, height: 320 });
  await open(page, `${INDEX}#/dev/balance/8/379`);
  await expect(page.locator('[data-choices]')).toBeVisible();
  const row = () => page.locator('[data-area="equation"] .eq').evaluate((el) => ({ over: el.scrollWidth - el.clientWidth, font: parseFloat(getComputedStyle(el).fontSize), wrapped: el.classList.contains('is-wrapped') }));
  expect(await row()).toEqual({ over: 0, font: 48, wrapped: false });
  await page.setViewportSize({ width: 320, height: 568 });
  await expect.poll(async () => (await row()).over, '320×568: the row fits its box').toBeLessThanOrEqual(0);
  expect((await row()).font, '320×568: shrunk, 28px or more').toBeGreaterThanOrEqual(28);
  await page.setViewportSize({ width: 568, height: 320 });
  await expect.poll(async () => (await row()).font, '568×320: full size again').toBe(48);
  // The solved row is fitted the same way.
  await solve(page);
  await page.setViewportSize({ width: 320, height: 568 });
  await expect.poll(async () => (await row()).over, '320×568 solved').toBeLessThanOrEqual(0);
});

test('the equation row is one atomic live region per round: the solve fills the same node, so a reader says the solved exercise (design 6.4, bug hunt #12)', async ({ page }) => {
  for (const [route, solved] of [['ten-frame/2/1', null], ['balance/10/1', '8=1+7']]) {
    await open(page, `${INDEX}?r=${route}#/dev/${route}`);
    await look(page);
    const row = await page.locator('[data-area="equation"] .eq').elementHandle();
    await expect(page.locator('[data-area="equation"] .eq')).toHaveAttribute('aria-atomic', 'true');
    await expect(page.locator('[data-area="equation"] .eq')).toHaveAttribute('aria-live', 'polite');
    const { answerAt } = await roundOf(page);
    await page.locator(`button[data-index="${answerAt}"]`).click();
    await expect(page.locator('[data-next]')).toBeVisible();
    expect(await row.evaluate((el) => el.isConnected), `${route}: the same node`).toBe(true);
    if (solved) expect(await row.evaluate((el) => el.textContent), route).toBe(solved);
  }
});

test('a solve paints the card before it writes the log: the card is correct before the stored attempts change, and the attempt is stored by "הַבָּא" (design 6.5, bug hunt #20)', async ({ page }) => {
  const attempts = Array.from({ length: 300 }, (_, i) => ({ t: NOW.toISOString(), day: TODAY, game: 'parts', level: 2, i }));
  await seedStore(page, storeWith({ games: { parts: ladderAt('split-10') }, attempts }));
  await open(page, `${FIXTURE}?seed=1#/play/parts`);
  await expect(page.locator('main[data-screen="round"]')).toBeVisible();
  await look(page);
  const { answerAt } = await roundOf(page);
  await page.evaluate(() => {
    const count = () => { const v = JSON.parse(localStorage.getItem('sifra')); return v.children[v.current].attempts.length; };
    window.atCorrect = null;
    new MutationObserver(() => { if (window.atCorrect === null && document.querySelector('.card.is-correct')) window.atCorrect = count(); })
      .observe(document.querySelector('[data-choices]'), { subtree: true, attributes: true, attributeFilter: ['class'] });
  });
  await page.locator(`button[data-index="${answerAt}"]`).click();
  await expect(page.locator('[data-next]')).toBeVisible();
  expect(await page.evaluate(() => window.atCorrect)).toBe(300);
  expect((await stored(page)).child.attempts).toHaveLength(301);
});

test('the soft-grey small text has paper behind it, off the grid lines: the parents page and its link on home (design 3, bug hunt #25)', async ({ page }) => {
  await page.route((url) => url.pathname.endsWith('/data/videos.js'), async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, body: (await res.text()).replace('export const VERIFIED = false;', 'export const VERIFIED = true;') });
  });
  const paper = 'rgb(250, 246, 236)';
  await open(page, `${INDEX}#/`);
  await expect(page.locator('[data-parents] > span')).toHaveCSS('background-color', paper);
  await page.evaluate(() => { location.hash = '#/parents'; });
  await expect(page.locator('main[data-screen="parents"]')).toBeVisible();
  for (const who of await page.locator('.who').all()) await expect(who).toHaveCSS('background-color', paper);
});

test('parents page: plain links that open YouTube in a new tab, and the home button', async ({ page }) => {
  await open(page, `${INDEX}#/parents`);
  const links = page.locator('main[data-screen="parents"] a');
  await expect(links).toHaveCount(TOPICS.flatMap((t) => t.videos).length);
  for (const link of await links.all()) {
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener');
    await expect(link).toHaveAttribute('href', /^https:\/\/www\.youtube\.com\/watch\?v=/);
  }
  await expect(page.locator('iframe')).toHaveCount(0);
  await look(page);
  await page.locator('[data-home]').click();
  await expect(page.locator('main[data-screen="home"]')).toBeVisible();
});

test('an uncaught error shows the error screen with a home button, not a white page', async ({ page }) => {
  await open(page, FIXTURE);
  await page.evaluate(() => dispatchEvent(new ErrorEvent('error', { message: 'boom' })));
  await expect(page.locator('main[data-screen="error"] [data-home]')).toBeVisible();
});

test('a rejected promise from a game\'s miss shows the error screen, not cards locked for good (2.1, 3.9)', async ({ page, errors }) => {
  // A miss is async: a display it cannot draw throws after the cards lock, as a rejected promise only
  // the unhandledrejection listener sees.
  errors.allow(/no drawing/);
  await page.route((url) => url.pathname.endsWith('/tests/fixtures/scale/game.js') && !url.search, (route) => route.fulfill({
    contentType: 'text/javascript',
    body: "import { render as draw } from './game.js?real';\nexport * from './game.js?real';\n" +
      "export function render(host, round, ctx) { const view = draw(host, round, ctx); return Object.assign(Object.create(view), { miss: () => Promise.reject(new Error('no drawing')) }); }\n",
  }));
  await open(page, `${FIXTURE}#/dev/scale/2/1`);
  await look(page);
  const { answerAt } = await roundOf(page);
  await page.locator(`button[data-index="${answerAt === 0 ? 1 : 0}"]`).click();
  await expect(page.locator('main[data-screen="error"] [data-home]')).toBeVisible();
});

test('a broken stored record is mended on load: home opens, the next step plays, and one repair event keeps what was lost (3.9)', async ({ page }) => {
  // A ladder without `passed` made the next step throw on home, and the error screen's reload threw again.
  await seedStore(page, storeWith({
    sessions: 'x', games: { parts: { level: 'split-5' }, scale: { level: 3, passed: ['same'] } }, skills: { 'num.parts.split': { last: YESTERDAY } },
  }));
  await open(page, FIXTURE);
  await expect(page.locator('main[data-screen="home"]')).toBeVisible();
  await expect(page.locator('a.next-step [data-thumb]')).toHaveCount(1);
  await expectThumbsDrawn(page);
  await look(page);
  await page.locator('a.next-step').click();
  await expect(page.locator('main[data-screen="demo"]')).toHaveAttribute('data-level', '1');
  // The demo's tap on the answer writes demoSeen (3.4).
  await expect(page.locator('main[data-screen="demo"]')).toHaveAttribute('data-solved', '');
  const { child } = await stored(page);
  expect(child.games).toEqual({ parts: { ...ladderAt('split-5'), hold: null } });
  expect(child.skills).toEqual({ 'num.parts.split': skillState({ last: YESTERDAY }) });
  expect(child.sessions).toBe(1);
  expect(child.events).toEqual([{ t: expect.any(String), day: TODAY, type: 'repair', lost: { sessions: 'x', 'games/scale': { level: 3, passed: ['same'] } } }]);
});

test('a next step that throws leaves home without its card, the games open, and #/next goes home (3.9)', async ({ page, errors }) => {
  // The planner, served with a nextStep that throws; the module itself loads from ?real. The
  // console error is this test's point, so the errors fixture lets it through.
  errors.allow(/a broken next step/);
  await page.route((url) => url.pathname.endsWith('/shell/planner.js') && !url.search, (route) => route.fulfill({
    contentType: 'text/javascript',
    body: "export * from './planner.js?real';\nexport function nextStep() { throw new Error('a broken next step'); }\n",
  }));
  const logged = [];
  page.on('console', (m) => { if (m.type() === 'error') logged.push(m.text()); });
  await open(page, FIXTURE);
  await expect(page.locator('main[data-screen="home"]')).toBeVisible();
  await expect(page.locator('a.next-step')).toHaveCount(0);
  await expect(page.locator('[data-card]')).toHaveCount(2);
  await expectThumbsDrawn(page);
  await look(page);
  await page.goto(`${FIXTURE}#/next`);
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.locator('main[data-screen="home"] [data-card]')).toHaveCount(2);
  expect(logged.some((text) => text.includes('a broken next step')), 'the error is logged').toBe(true);
  await look(page);
  await page.locator('[data-card]').first().click();
  await expect(page.locator('main[data-screen="demo"]')).toHaveAttribute('data-game', 'parts');
});

test('a game whose render throws leaves its home card with the title only, and home still opens (3.9)', async ({ page, errors }) => {
  // The scale fixture, served with a render that throws; the module itself loads from ?real. The
  // console error is this test's point, so the errors fixture lets it through.
  errors.allow(/a broken game/);
  await page.route((url) => url.pathname.endsWith('/tests/fixtures/scale/game.js') && !url.search, (route) => route.fulfill({
    contentType: 'text/javascript',
    body: "export * from './game.js?real';\nexport function render() { throw new Error('a broken game'); }\n",
  }));
  const logged = [];
  page.on('console', (m) => { if (m.type() === 'error') logged.push(m.text()); });
  await open(page, FIXTURE);
  await expect(page.locator('main[data-screen="home"]')).toBeVisible();
  await expect(page.locator('[data-card]')).toHaveCount(2);
  await expect(page.locator('[data-card]').nth(1)).toHaveText(scale.meta.title);
  await expect(page.locator('[data-card] [data-thumb][data-game="scale"]')).toBeEmpty();
  await expect(page.locator('[data-card] [data-thumb][data-game="scale"]')).toHaveAttribute('data-broken');
  await expect(page.locator('[data-card] [data-thumb][data-game="parts"] > *')).not.toHaveCount(0);
  expect(logged.some((text) => text.includes('a broken game')), 'the error is logged').toBe(true);
});

test('the shell freezes the round before render: a game that sorts its choices breaks its thumb and its round (2.5)', async ({ page, errors }) => {
  // The scale fixture, served with a render that sorts the round's cards first. Only the shell's
  // freeze (dealt in app.js) makes that write throw: no game writes to a round, and the contract
  // loop freezes its own copy, so this is the one test that fails if the shell stops freezing.
  errors.allow(/read.?only|frozen|not extensible/i);
  await page.route((url) => url.pathname.endsWith('/tests/fixtures/scale/game.js') && !url.search, (route) => route.fulfill({
    contentType: 'text/javascript',
    body: "import { render as draw } from './game.js?real';\nexport * from './game.js?real';\n" +
      'export function render(host, round, ctx) { round.choices.sort(); return draw(host, round, ctx); }\n',
  }));
  await open(page, FIXTURE);
  await expect(page.locator('[data-card] [data-thumb][data-game="scale"]')).toHaveAttribute('data-broken');
  await expect(page.locator('[data-card] [data-thumb][data-game="parts"] > *')).not.toHaveCount(0);
  await page.evaluate(() => { location.hash = '#/dev/scale/2/1'; });
  await expect(page.locator('main[data-screen="error"] [data-home]')).toBeVisible();
});

test('#/dev/export: one button downloads the stored value as is, named by the local day', async ({ page }) => {
  const value = storeWith({ sessions: 3 });
  await seedStore(page, value);
  // 00:30 in Israel, still the day before in UTC.
  await page.clock.install({ time: new Date('2026-10-14T00:30:00+03:00') });
  await page.goto(`${FIXTURE}#/dev/export`);
  await expect(page.locator('[data-export]')).toBeVisible();
  await look(page);
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('[data-export]').click()]);
  expect(download.suggestedFilename()).toBe(`sifra-${CHILD}-2026-10-14.json`);
  const file = JSON.parse(readFileSync(await download.path(), 'utf8'));
  expect(file).toMatchObject({ key: 'sifra', schema: 1, data: value });
});

test('index.html: the first load of home is at most 200 KB of same-origin responses, gzipped as Pages serves them', async ({ page, baseURL }) => {
  const sizes = [];
  page.on('response', (r) => {
    if (new URL(r.url()).origin === new URL(baseURL).origin) sizes.push(r.body().then((b) => gzipSync(b).length, () => 0));
  });
  await open(page, INDEX);
  await page.waitForLoadState('networkidle');
  const total = (await Promise.all(sizes)).reduce((a, b) => a + b, 0);
  // The run's log keeps the figure (architecture 6, "First-load budget"), so the room left is known before it runs out.
  console.log(`first load of home: ${(total / 1024).toFixed(1)} KiB gzipped of 200`);
  expect(total).toBeLessThanOrEqual(200 * 1024);
});

for (const site of SITES) {
  test(`${site.name}: no sideways scroll at 320×568 and 375×550; at 375×550 the round fits the screen`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, site.path);
    for (const [width, height] of [[320, 568], [375, 550]]) {
      await page.setViewportSize({ width, height });
      // #/dev is the owner's list of levels: its outside bullets hung 2px past the left edge (scrollWidth 322 at 320).
      for (const hash of ['#/', '#/parents', '#/dev', ...levelRoutes(site)]) {
        await page.goto(`${site.path}${hash}`);
        await expect(page.locator('main')).toBeVisible();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${hash} at ${width}`).toBeLessThanOrEqual(0);
        if (!hash.startsWith('#/dev/') || width !== 375) continue;
        for (const area of ['[data-area="picture"]', '[data-area="equation"]', '[data-choices]']) {
          expect((await page.locator(area).boundingBox()).y + (await page.locator(area).boundingBox()).height, `${hash} ${area}`).toBeLessThanOrEqual(height);
        }
        await solve(page);
        const next = await page.locator('[data-next]').boundingBox();
        expect(next.y + next.height, `${hash} הַבָּא`).toBeLessThanOrEqual(height);
      }
    }
  });

  test(`${site.name}: home draws each level's thumb, on the game cards and the next-step card`, async ({ page }) => {
    // A thumb that throws is left empty so home still opens (3.9): no test would fail on it but this one.
    await open(page, site.path);
    for (let i = 0; i < Math.max(...site.games.map((g) => g.levels.length)); i++) {
      const at = (g) => ladderAt(g.levels[Math.min(i, g.levels.length - 1)].id, { passed: g.levels.slice(0, i).map((l) => l.id) });
      await page.evaluate((v) => localStorage.setItem('sifra', JSON.stringify(v)), storeWith({ games: Object.fromEntries(site.games.map((g) => [g.meta.id, at(g)])) }));
      await page.goto(`${site.path}?${i}#/`);
      await expect(page.locator('main[data-screen="home"] [data-card]')).toHaveCount(site.games.length);
      await expectThumbsDrawn(page, `level ${i + 1}`);
    }
  });

  test(`${site.name}: every control and card is at least 64×64`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 320, height: 568 });
    await open(page, site.path);
    for (const hash of ['#/', '#/parents', ...levelRoutes(site)]) {
      await page.goto(`${site.path}${hash}`);
      await expect(page.locator('main')).toBeVisible();
      await expectTouchTargets(page.locator('[data-control], [data-card], button[data-index]'));
      if (hash.startsWith('#/dev/')) {
        await solve(page);
        await expectTouchTargets(page.locator('[data-control]'));
      }
    }
  });

  test(`${site.name}: R7, every [data-math] reads left to right, before and after the answer`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, site.path);
    for (const hash of levelRoutes(site)) {
      await page.goto(`${site.path}${hash}`);
      await expect(page.locator('[data-choices]')).toBeVisible();
      await expectMathLeftToRight(page);
      await solve(page);
      await expectMathLeftToRight(page);
    }
  });

  // One test for home and one per game: each display runs in real time (about a second per level),
  // so a single loop over every level would grow toward the timeout with each new game.
  for (const [what, hashes] of [['home', ['#/']], ...site.games.map((g) => [g.meta.id, levelRoutes({ games: [g] })])]) {
    test(`${site.name}: R10, ${what}: a waiting round is calm and a minute adds nothing`, async ({ page }) => {
      test.setTimeout(60000);
      await open(page, site.path);
      for (const hash of hashes) {
        await page.goto(`${site.path}${hash}`);
        await expect(page.locator('main')).toBeVisible();
        await expectCalm(page);
        const before = await page.locator('main').innerHTML();
        await page.clock.runFor(60000);
        expect(await page.locator('main').innerHTML(), hash).toBe(before);
        if (!hash.startsWith('#/dev/')) continue;
        const { round, answerAt } = await roundOf(page);
        await page.locator(`button[data-index="${answerAt === 0 ? 1 : 0}"]`).click();
        await expect(page.locator('[data-display]')).toBeVisible();
        await expect(page.locator('[data-choices]')).not.toHaveAttribute('data-locked');
        await expectCalm(page);
        const after = await page.locator('main').innerHTML();
        await page.clock.runFor(60000);
        expect(await page.locator('main').innerHTML(), `${hash} after a miss`).toBe(after);
        expect(round.choices.length).toBeGreaterThan(1);
      }
    });
  }

  test(`${site.name}: R1, with the words hidden the round is whole and every control has an icon`, async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, site.path);
    for (const hash of ['#/', ...levelRoutes(site)]) {
      await page.goto(`${site.path}${hash}`);
      await expect(page.locator('main')).toBeVisible();
      await page.evaluate(() => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          if (/[א-ת]/.test(walker.currentNode.data)) walker.currentNode.parentElement.style.color = 'transparent';
        }
      });
      for (const control of await page.locator('[data-control]').all()) await expect(control.locator('svg[data-icon]')).toHaveCount(1);
      if (hash.startsWith('#/dev/')) {
        for (const area of ['[data-area="picture"]', '[data-area="equation"]', '[data-choices]']) await expect(page.locator(area)).toBeVisible();
        await expect(page.locator('[data-area="equation"] .eq > *, [data-area="picture"] > *').first()).toBeVisible();
      }
      await testInfo.attach(`${site.name} ${hash}`, { body: await page.screenshot(), contentType: 'image/png' });
    }
  });

  test(`${site.name}: R6, every [data-role] element has its role colour; one cover kind`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, site.path);
    for (const hash of ['#/', ...levelRoutes(site)]) {
      await page.goto(`${site.path}${hash}`);
      await expect(page.locator('main')).toBeVisible();
      await expectRoleColours(page);
      if (!hash.startsWith('#/dev/')) continue;
      await solve(page);
      await expectRoleColours(page);
    }
  });
}

test('R10: a minute in real time adds nothing to any game waiting on a covered round', async ({ context }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'the one real-time test of the suite runs once');
  test.setTimeout(120000);
  const waiting = [];
  for (const site of SITES) {
    for (const game of site.games) {
      // The first level drawn without a click whose round at seed 1 has a '?' in its exercise (a level
      // may cover nothing: balance level 1 leaves a pan empty).
      const one = (l) => game.makeRound({ ...l, structure: [l.structure].flat()[0], ask: [l.ask].flat()[0] }, rng(1));
      const n = game.levels.findIndex((l) => l.look !== 'symbols' && JSON.stringify(one(l).equation ?? '').includes('"?"')) + 1;
      const page = await context.newPage();
      await page.goto(`${site.path}#/dev/${game.meta.id}/${n}/1`);
      await expect(page.locator('main[data-screen="round"] .cover').first()).toBeVisible();
      // A story's '?' comes at the end of its event (architecture 2.4): the round waits once the event is over.
      await expect(page.locator('[data-event]')).toHaveCount(0);
      waiting.push({ page, before: await page.locator('main').innerHTML() });
    }
  }
  expect(waiting.length).toBeGreaterThan(0);
  await waiting[0].page.waitForTimeout(60000);
  for (const { page, before } of waiting) {
    expect(await page.locator('main').innerHTML()).toBe(before);
    await expectCalm(page);
  }
});
