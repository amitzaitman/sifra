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
import { demoSeedFor, plainDemo } from '../shell/planner.js';
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
      for (const tap of taps) expect(tap.top >= 0 && tap.bottom <= tap.screen, `a tap at ${tap.top}-${tap.bottom} on a ${tap.screen}px screen`).toBe(true);
    });
  }
}

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
