// The site (architecture 4.6): on e2e/fixture.html the shell's behaviour with the two fixture
// games; on index.html and fixture.html alike, the layout, touch-target, R1, R6, R7 and R10
// checks on home, the parents page and every level through #/dev.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import * as registry from '../games/registry.js';
import * as parts from '../tests/fixtures/parts/game.js';
import * as scale from '../tests/fixtures/scale/game.js';
import { TOPICS } from '../data/videos.js';
import { rng } from '../lib/rng.js';
import {
  CHILD, FIXTURE, INDEX, NOW, TODAY, YESTERDAY, expectCalm, expectMathLeftToRight, expectRoleColours, expectTouchTargets,
  ladderAt, roundOf, seedStore, skillState, storeWith, stored,
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

/** Solves the round on screen and waits for "הַבָּא". */
async function solve(page) {
  const { answerAt } = await roundOf(page);
  await page.locator(`button[data-index="${answerAt}"]`).click();
  await expect(page.locator('[data-next]')).toBeVisible();
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
  await expect(page.locator('main[data-screen="demo"]')).toBeVisible();
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
  await page.locator('[data-next]').click();
  const seed = await page.locator('main[data-screen="round"]').getAttribute('data-seed');
  await page.locator('[data-how]').click();
  await expect(page.locator('main[data-screen="demo"]')).toBeVisible();
  await expect(page.locator('[data-next]')).toBeVisible();
  await page.locator('[data-next]').click();
  await expect(page.locator('main[data-screen="round"]')).toHaveAttribute('data-seed', seed);
  await solve(page);
  ({ child } = await stored(page));
  expect(child.attempts).toHaveLength(1);
  // The round opened with the auto demo, then the hand: both are logged.
  expect(child.attempts[0]).toMatchObject({ outcome: 'help', help: ['how'], demo: ['auto', 'how'], wrong: [] });
  await page.locator('[data-next]').click();
  await expect(page.locator('main[data-screen="round"] [role="progressbar"]')).toHaveAttribute('aria-valuenow', '1');
  await page.locator('[data-how]').click();
  await expect(page.locator('main[data-screen="demo"] [role="progressbar"]')).toHaveAttribute('aria-valuenow', '1');
  await page.locator('[data-next]').click();
  await solve(page);
  expect((await stored(page)).child.attempts[1]).toMatchObject({ help: ['how'], demo: ['how'] });
});

/** Two touchscreen taps at the middle of an element, as fast as the protocol sends them: one double tap. */
async function doubleTap(page, locator) {
  const box = await locator.boundingBox();
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  await page.touchscreen.tap(x, y);
  await page.touchscreen.tap(x, y);
}

test('a double tap on the right card with reduced motion: "הַבָּא" is born under the finger, and the second tap does not skip the solved round (design 6.9)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seedStore(page, storeWith({ games: { parts: ladderAt('split-10') } }));
  await open(page, `${FIXTURE}#/play/parts`);
  const { answerAt, data } = await roundOf(page);
  await doubleTap(page, page.locator(`button[data-index="${answerAt}"]`));
  await expect(page.locator('[data-next]')).toBeVisible();
  await expect(page.locator('main[data-screen="round"]')).toHaveAttribute('data-solved', '');
  await expect(page.locator('main[data-screen="round"]')).toHaveAttribute('data-seed', data.seed);
  await expect(page.locator('[role="progressbar"]')).toHaveAttribute('aria-valuenow', '0');
  // A tap of its own is taken.
  await page.locator('[data-next]').click();
  await expect(page.locator('[role="progressbar"]')).toHaveAttribute('aria-valuenow', '1');
});

for (const [name, route] of [['a session', '#/play/parts'], ['#/dev', '#/dev/parts/2/1']]) {
  test(`${name}: a double tap on "הַבָּא" starts the next round, and the second tap does not answer it (design 6.9)`, async ({ page }) => {
    await seedStore(page, storeWith({ games: { parts: ladderAt('split-10') } }));
    await open(page, `${FIXTURE}${route}`);
    await solve(page);
    const before = await page.locator('main[data-screen="round"]').getAttribute('data-seed');
    await doubleTap(page, page.locator('[data-next]'));
    await expect(page.locator('main[data-screen="round"]')).not.toHaveAttribute('data-seed', before);
    await expect(page.locator('[data-choices]')).toBeVisible();
    await expect(page.locator('button[data-index].is-retired')).toHaveCount(0);
    await expect(page.locator('main[data-screen="round"]')).not.toHaveAttribute('data-solved', '');
    expect((await stored(page)).child.attempts).toHaveLength(route.startsWith('#/play') ? 1 : 0);
    // The next tap is taken.
    await solve(page);
  });
}

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
  await page.locator('[data-home]').click();
  await expect(page.locator('main[data-screen="home"]')).toBeVisible();
});

test('an uncaught error shows the error screen with a home button, not a white page', async ({ page }) => {
  await open(page, FIXTURE);
  await page.evaluate(() => dispatchEvent(new ErrorEvent('error', { message: 'boom' })));
  await expect(page.locator('main[data-screen="error"] [data-home]')).toBeVisible();
});

test('#/dev/export: one button downloads the stored value as is, named by the local day', async ({ page }) => {
  const value = storeWith({ sessions: 3 });
  await seedStore(page, value);
  // 00:30 in Israel, still the day before in UTC.
  await page.clock.install({ time: new Date('2026-10-14T00:30:00+03:00') });
  await page.goto(`${FIXTURE}#/dev/export`);
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
  expect(total).toBeLessThanOrEqual(200 * 1024);
});

for (const site of SITES) {
  test(`${site.name}: no sideways scroll at 320×568 and 375×550; at 375×550 the round fits the screen`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, site.path);
    for (const [width, height] of [[320, 568], [375, 550]]) {
      await page.setViewportSize({ width, height });
      for (const hash of ['#/', '#/parents', ...levelRoutes(site)]) {
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

  test(`${site.name}: R10, a waiting round is calm and a minute adds nothing`, async ({ page }) => {
    await open(page, site.path);
    for (const hash of ['#/', ...levelRoutes(site)]) {
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
