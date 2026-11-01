// The game spec of architecture 4.7, run on the two fixture games through the real shell. Each
// game branch writes e2e/<id>.spec.js the same way.
import { RULES } from '../data/errors.js';
import * as scale from '../tests/fixtures/scale/game.js';
import { test, expect, FIXTURE, NOW, expectThumbsDrawn, ladderAt, look, roundOf, seedStore, skillState, storeWith, stored } from './helpers.js';

/**
 * Opens a play session of a game whose ladder is at a level (its demo already seen). The seed
 * fixes the session's rounds, so a failure can be replayed.
 * @param {import('@playwright/test').Page} page
 * @param {string} game
 * @param {string} level a level id
 * @param {object} [over] more ladder fields
 * @param {number} [seed] fixture.html's seed
 */
async function playAt(page, game, level, over = {}, seed = 1) {
  await seedStore(page, storeWith({ games: { [game]: ladderAt(level, over) } }));
  await page.clock.install({ time: NOW });
  await page.goto(`${FIXTURE}?seed=${seed}#/play/${game}`);
  await expect(page.locator('main[data-screen="round"], main[data-screen="demo"]')).toBeVisible();
  await look(page);
  return roundOf(page);
}
const card = (page, i) => page.locator(`button[data-index="${i}"]`);
const unlocked = (page) => expect(page.locator('[data-choices]')).not.toHaveAttribute('data-locked');
const lastAttempt = async (page) => (await stored(page)).child.attempts.at(-1);
/** What a screen reader gets from the equation row: the '?' until solved, then the answer. */
const spoken = (equation, answer) => `- paragraph: ${[...equation.left, '=', ...equation.right].map((t) => (t === '?' ? answer : t)).join(' ')}`;

for (const [game, level] of [['parts', 'split-10'], ['scale', 'right']]) {
  test(`${game}: a first try closes the picture, writes the equation and puts "הַבָּא" in the cards' place`, async ({ page }) => {
    const { round, answerAt } = await playAt(page, game, level);
    const row = page.locator('[data-area="equation"] .eq');
    expect(await row.ariaSnapshot()).toBe(spoken(round.equation, '?'));
    const panel = await page.locator('[data-area="picture"]').boundingBox();
    await page.mouse.click(panel.x + 40, panel.y + 40);
    // Two seconds of looking before the tap: firstMs and ms are the time from the mount (3.9).
    await page.clock.runFor(2000);
    await card(page, answerAt).click();
    const main = page.locator('main[data-screen="round"]');
    await expect(main).toHaveAttribute('data-solved', '');
    const answer = page.locator('.eq-answer');
    await expect(answer).toHaveText(String(round.answer));
    await expect(answer).toHaveCSS('opacity', '1');
    await expect(answer).toHaveCSS('color', 'rgb(214, 51, 108)');
    expect(await row.ariaSnapshot()).toBe(spoken(round.equation, round.answer));
    await expect(page.locator('[data-area="equation"] .cover')).toHaveClass(/is-lifted/);
    await expect(page.locator('[data-next]')).toBeFocused();
    await expect(page.locator('[data-choices]')).toHaveCount(0);
    for (const dot of await page.locator('[data-area="picture"] [data-role="unknown"]').all()) await expect(dot).toHaveCSS('opacity', '1');
    expect(await lastAttempt(page)).toMatchObject({
      game, levelId: level, outcome: 'first', wrong: [], help: [], kind: 'new', options: 4, answer: round.answer,
      taps: { picture: 1, equation: 0, other: 0 }, version: 1, params: expect.objectContaining({ id: level }),
    });
    // The 300 ms of look() and the 2000 ms run, in whole ms; the installed clock also runs in real time, so no tight
    // top bound. The first tap is the solve: the shell reads the clock once for both, so they are equal.
    const { firstMs, ms } = await lastAttempt(page);
    expect(Number.isInteger(ms) && Number.isInteger(firstMs)).toBe(true);
    expect(ms).toBeGreaterThanOrEqual(2300);
    expect(ms).toBeLessThan(30000);
    expect(ms).toBe(firstMs);
  });

  test(`${game}: the help ladder: display, hint, then the tour ends on the answer`, async ({ page }) => {
    const { round, answerAt } = await playAt(page, game, level);
    const wrong = round.choices.map((_, i) => i).filter((i) => i !== answerAt);
    const slot = await card(page, wrong[0]).boundingBox();
    await card(page, wrong[0]).click();
    await expect(card(page, wrong[0])).toHaveClass(/is-retired/);
    expect(await card(page, wrong[0]).boundingBox()).toEqual(slot);
    await expect(page.locator(`[data-display="${RULES[round.choices[wrong[0]].rule].display}"]`)).toBeVisible();
    await unlocked(page);
    await expect(page.locator('[data-hint]')).toHaveCount(0);
    const html = await page.locator('main').innerHTML();
    await page.clock.runFor(60000);
    expect(await page.locator('main').innerHTML()).toBe(html);
    await card(page, wrong[1]).click();
    await expect(page.locator('[data-hint]')).toBeVisible();
    await expect(page.locator('[data-display]')).toHaveCount(1);
    await unlocked(page);
    await card(page, wrong[2]).click();
    await unlocked(page);
    await expect(page.locator('button[data-index]:not(.is-retired)')).toHaveCount(1);
    await expect(card(page, answerAt)).toHaveClass(/is-shown/);
    await expect(page.locator('[data-tour]').last()).toHaveText(String(round.answer));
    await card(page, answerAt).click();
    await expect(page.locator('[data-next]')).toBeVisible();
    const saved = await lastAttempt(page);
    expect(saved).toMatchObject({ outcome: 'shown', wrong: wrong.map((i) => round.choices[i].rule), help: ['hint', 'tour'] });
    // firstMs at the first (wrong) tap, after look()'s 300 ms; ms at the solve, after the minute run between them.
    expect(saved.firstMs).toBeGreaterThanOrEqual(300);
    expect(saved.ms - saved.firstMs).toBeGreaterThanOrEqual(60000);
  });
}

test('a 3-option level: the first miss brings the display and the hint, the second the tour', async ({ page }) => {
  const { round, answerAt } = await playAt(page, 'parts', 'split-5');
  const wrong = round.choices.map((_, i) => i).filter((i) => i !== answerAt);
  await card(page, wrong[0]).click();
  await expect(page.locator('[data-display]')).toBeVisible();
  await expect(page.locator('[data-hint]')).toBeVisible();
  await unlocked(page);
  await card(page, wrong[1]).click();
  await expect(page.locator('[data-tour]').last()).toHaveText(String(round.answer));
  await unlocked(page);
  await card(page, answerAt).click();
  await expect(page.locator('[data-next]')).toBeVisible();
  expect(await lastAttempt(page)).toMatchObject({ outcome: 'shown', options: 3, help: ['hint', 'tour'] });
});

test('reduced motion: a tap is taken right after a miss', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { answerAt } = await playAt(page, 'scale', 'left');
  await card(page, answerAt === 0 ? 1 : 0).click();
  await card(page, answerAt).click();
  await expect(page.locator('[data-next]')).toBeVisible();
  expect(await lastAttempt(page)).toMatchObject({ outcome: 'help' });
});

test('a demo level runs its demo first, and the hand taps the answer', async ({ page }) => {
  await playAt(page, 'scale', 'right', { demoSeen: [] });
  await expect(page.locator('main[data-screen="demo"] [data-hand]')).toBeVisible();
  await expect(page.locator('[data-next]')).toBeVisible();
  await expect(page.locator('main[data-screen="demo"]')).toHaveAttribute('data-solved', '');
  expect((await stored(page)).child.attempts).toEqual([]);
  await look(page);
  await page.locator('[data-next]').click();
  await expect(page.locator('main[data-screen="round"]')).toHaveAttribute('data-level', '2');
});

test('a symbols level shows the picture on request and logs picture', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { answerAt } = await playAt(page, 'parts', 'split-sym');
  await expect(page.locator('[data-area="picture"] [data-role]')).toHaveCount(0);
  await page.locator('[data-show-picture]').click();
  await expect(page.locator('[data-show-picture]')).toHaveCount(0);
  await expect(page.locator('[data-area="picture"] [data-role="part"]').first()).toBeVisible();
  await card(page, answerAt).click();
  await expect(page.locator('[data-next]')).toBeVisible();
  expect(await lastAttempt(page)).toMatchObject({ outcome: 'help', help: ['picture'], wrong: [] });
});

test('a saved attempt does not change after the solve', async ({ page }) => {
  // Solved on the first tap; then the picture button and a tap in each area. None of it is the round's.
  // This pins the saved record only: the copies (finish) and the solved guards (runRound) each keep it,
  // and nothing else reads the round's record after the solve.
  const first = await playAt(page, 'parts', 'split-sym');
  await card(page, first.answerAt).click();
  await expect(page.locator('[data-next]')).toBeVisible();
  const saved = await lastAttempt(page);
  expect(saved).toMatchObject({ outcome: 'first', wrong: [], help: [], taps: { picture: 0, equation: 0, other: 0 } });
  await look(page);
  await page.locator('[data-show-picture]').click();
  // It draws the solved picture, without the cover (architecture 2.5 step 2).
  await expect(page.locator('[data-area="picture"] [data-role="part"]').first()).toBeVisible();
  await expect(page.locator('[data-area="picture"] .cover')).toHaveCount(0);
  for (const area of ['[data-area="picture"]', '[data-area="equation"]', '.progress']) {
    const box = await page.locator(area).boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  }
  await page.locator('[data-next]').click();
  await expect(page.locator('main[data-screen="round"]')).not.toHaveAttribute('data-solved');
  await look(page);
  await card(page, (await roundOf(page)).answerAt).click();
  await expect(page.locator('[data-next]')).toBeVisible();
  const { attempts } = (await stored(page)).child;
  expect(attempts).toHaveLength(2);
  expect(attempts[0]).toEqual(saved);
});

test('a stuck return in the same game: levelAfter is the level the child was moved to (3.7)', async ({ page }) => {
  // The tenth round at split-10, in a second session, under half first tries: stuck. No game
  // offers count.set.how-many, so the return is to split-5 in parts itself.
  const at = { 'split-10': { n: 9, first: 0, sessions: 1, lastSession: 1 } };
  await seedStore(page, storeWith({ sessions: 1, games: { parts: ladderAt('split-10', { passed: ['split-5'], at }) } }));
  await page.clock.install({ time: NOW });
  await page.goto(`${FIXTURE}?seed=1#/play/parts`);
  await expect(page.locator('main[data-screen="round"]')).toHaveAttribute('data-level', '2');
  await look(page);
  await card(page, (await roundOf(page)).answerAt).click();
  await expect(page.locator('[data-next]')).toBeVisible();
  const { child } = await stored(page);
  expect(child.events.at(-1)).toMatchObject({ type: 'stuck', game: 'parts', level: 2, to: { game: 'parts', level: 1 } });
  expect(child.games.parts.level).toBe('split-5');
  expect(child.attempts.at(-1)).toMatchObject({ levelId: 'split-10', outcome: 'first', levelBefore: 2, levelAfter: 1 });
});

test('a stuck return into another game: the rest of the session plays the target, the stuck game keeps its level (3.3, 3.7)', async ({ page }) => {
  // dev-spec A.2: stuck in eq.sign.missing (scale 'right', tenth round, second session, no first
  // tries) with eq.sign.same-as mastered: the return goes to num.parts.split in parts.
  const at = { right: { n: 9, first: 0, sessions: 1, lastSession: 1 } };
  const sameAs = skillState({ last: '2026-10-05', passedDay: '2026-10-01', box: 3, due: '2026-12-01', reviewDays: ['2026-10-02', '2026-10-05'] });
  await seedStore(page, storeWith({ sessions: 1, games: { scale: ladderAt('right', { passed: ['same'], at }) }, skills: { 'eq.sign.same-as': sameAs } }));
  await page.clock.install({ time: NOW });
  await page.goto(`${FIXTURE}?seed=1#/play/scale`);
  const main = page.locator('main[data-screen="round"], main[data-screen="demo"]');
  // The passed same-as opens the session with review rounds; the first new round is at 'right'.
  await expect(main).toBeVisible();
  while ((await main.getAttribute('data-kind')) === 'review') {
    await look(page);
    await card(page, (await roundOf(page)).answerAt).click();
    await expect(page.locator('[data-next]')).toBeVisible();
    await look(page);
    await page.locator('[data-next]').click();
    await expect(page.locator('main[data-screen="round"]')).not.toHaveAttribute('data-solved');
  }
  await expect(main).toHaveAttribute('data-game', 'scale');
  await expect(main).toHaveAttribute('data-level', '2');
  await look(page);
  await card(page, (await roundOf(page)).answerAt).click();
  await expect(page.locator('[data-next]')).toBeVisible();
  const { child } = await stored(page);
  expect(child.events.at(-1)).toMatchObject({ type: 'stuck', game: 'scale', level: 2, to: { game: 'parts', level: 1, skill: 'num.parts.split' }, missing: [] });
  expect(child.games.scale.level).toBe('right');
  expect(child.games.parts).toMatchObject({ level: 'split-5', hold: 'split-5', demoDue: 'split-5' });
  expect(child.attempts.at(-1)).toMatchObject({ game: 'scale', levelId: 'right', levelBefore: 2, levelAfter: 2 });
  // The address names the game the session now plays (3.7, hunt 2 #12).
  expect(new URL(page.url()).hash).toBe('#/play/parts');
  await look(page);
  await page.locator('[data-next]').click();
  // The target's demo runs once more, then its rounds fill the session.
  await expect(page.locator('main[data-screen="demo"]')).toHaveAttribute('data-game', 'parts');
  await expect(page.locator('main[data-screen="demo"]')).toHaveAttribute('data-level', '1');
  await expect(page.locator('[data-next]')).toBeVisible({ timeout: 15000 });
  await look(page);
  await page.locator('[data-next]').click();
  await expect(page.locator('main[data-screen="round"]')).toHaveAttribute('data-game', 'parts');
  await expect(page.locator('main[data-screen="round"]')).toHaveAttribute('data-level', '1');
  await expect(page.locator('main[data-screen="round"]')).toHaveAttribute('data-kind', 'new');
});

/**
 * Opens a session at scale's 'right' that is stuck on its first new round (dev-spec A.2: the tenth round, the second
 * session, no first tries, eq.sign.same-as mastered, so the return goes to num.parts.split in parts), plays its review
 * rounds, and stops at the stuck round, looked at.
 * @param {import('@playwright/test').Page} page
 */
async function stuckInScale(page) {
  const at = { right: { n: 9, first: 0, sessions: 1, lastSession: 1 } };
  const sameAs = skillState({ last: '2026-10-05', passedDay: '2026-10-01', box: 3, due: '2026-12-01', reviewDays: ['2026-10-02', '2026-10-05'] });
  await seedStore(page, storeWith({ sessions: 1, games: { scale: ladderAt('right', { passed: ['same'], at }) }, skills: { 'eq.sign.same-as': sameAs } }));
  await page.clock.install({ time: NOW });
  await page.goto(`${FIXTURE}?seed=1#/play/scale`);
  const main = page.locator('main[data-screen="round"], main[data-screen="demo"]');
  await expect(main).toBeVisible();
  while ((await main.getAttribute('data-kind')) === 'review') {
    await look(page);
    await card(page, (await roundOf(page)).answerAt).click();
    await expect(page.locator('[data-next]')).toBeVisible();
    await look(page);
    await page.locator('[data-next]').click();
    await expect(page.locator('main[data-screen="round"]')).not.toHaveAttribute('data-solved');
  }
  await expect(main).toHaveAttribute('data-level', '2');
  await look(page);
}

test('after a stuck return into another game a reload opens the target: the address names it (3.1, 3.7, hunt 2 #12)', async ({ page }) => {
  await stuckInScale(page);
  await card(page, (await roundOf(page)).answerAt).click();
  await expect(page.locator('[data-next]')).toBeVisible();
  await expect(page).toHaveURL(/\?seed=1#\/play\/parts$/);
  await page.reload();
  // The target's demo, once more, at its level; scale keeps its own.
  await expect(page.locator('main[data-screen="demo"]')).toHaveAttribute('data-game', 'parts');
  await expect(page.locator('main[data-screen="demo"]')).toHaveAttribute('data-level', '1');
  expect((await stored(page)).child.games.scale.level).toBe('right');
});

test('home tapped during a stuck round\'s closing stays home: the address is the target\'s only while it names the session\'s game (3.7, hunt 2 #12)', async ({ page }) => {
  await stuckInScale(page);
  // The answer, and home at once, before the closing has run: the solved round is applied as home opens.
  await page.evaluate((i) => {
    /** @type {HTMLElement} */ (document.querySelector(`button[data-index="${i}"]`)).click();
    /** @type {HTMLElement} */ (document.querySelector('[data-home]')).click();
  }, (await roundOf(page)).answerAt);
  await expect(page.locator('main[data-screen="home"]')).toBeVisible();
  expect(new URL(page.url()).hash).toBe('#/');
  const { child } = await stored(page);
  expect(child.events.at(-1)).toMatchObject({ type: 'stuck', game: 'scale', to: { game: 'parts', level: 1 } });
  expect(child.games.parts).toMatchObject({ level: 'split-5', hold: 'split-5' });
  await page.clock.runFor(1000);
  await expect(page.locator('main[data-screen="home"]')).toBeVisible();
  expect(new URL(page.url()).hash).toBe('#/');
});

test('two tabs: each reads the store again before it writes, so neither undoes the other\'s progress (3.9, bug hunt #8)', async ({ page, context }) => {
  // A plays parts and B scale, in one context (one localStorage), as a second tab a WhatsApp link opens.
  await seedStore(page, storeWith({ games: { parts: ladderAt('split-10'), scale: ladderAt('right') } }));
  await page.clock.install({ time: NOW });
  await page.goto(`${FIXTURE}?seed=1#/play/parts`);
  await expect(page.locator('main[data-screen="round"]')).toBeVisible();
  await look(page);
  await card(page, (await roundOf(page)).answerAt).click();
  await expect(page.locator('[data-next]')).toBeVisible();
  const b = await context.newPage();
  await b.clock.install({ time: NOW });
  await b.goto(`${FIXTURE}?seed=2#/play/scale`);
  await expect(b.locator('main[data-screen="round"]')).toBeVisible();
  await look(b);
  await card(b, (await roundOf(b)).answerAt).click();
  await expect(b.locator('[data-next]')).toBeVisible();
  // A goes on in its old tab.
  await look(page);
  await page.locator('[data-next]').click();
  await expect(page.locator('main[data-screen="round"]')).not.toHaveAttribute('data-solved');
  await look(page);
  await card(page, (await roundOf(page)).answerAt).click();
  await expect(page.locator('[data-next]')).toBeVisible();
  const { data, child } = await stored(page);
  expect(Object.keys(data.children)).toEqual([data.current]);
  expect(child.attempts.map((a) => a.game)).toEqual(['parts', 'scale', 'parts']);
  expect(child.games.scale.streak).toBe(1);
  expect(child.games.parts.streak).toBe(2);
});

for (const [what, then] of [['the closing ends', null], ['the page goes (pagehide)', 'pagehide']]) {
  test(`two tabs: another tab's write during the closing is kept when ${what}; the solved round is applied on it (3.9, bug hunt #8)`, async ({ page }) => {
    // Two visible tabs (iPad split view, a desktop): the other one writes while this one's closing runs.
    const { answerAt } = await playAt(page, 'parts', 'split-10');
    // Run in the solving tap, after the shell's own listener: the round is solved and its closing has begun.
    await card(page, answerAt).evaluate((el, [scale, event]) => el.addEventListener('click', () => {
      const v = JSON.parse(localStorage.getItem('sifra'));
      v.children[v.current].games.scale = scale;
      localStorage.setItem('sifra', JSON.stringify(v));
      if (event) dispatchEvent(new Event(event));
    }, { once: true }), [ladderAt('right', { streak: 2 }), then]);
    await card(page, answerAt).click();
    await expect(page.locator('[data-next]')).toBeVisible();
    const { data, child } = await stored(page);
    expect(Object.keys(data.children)).toEqual([data.current]);
    expect(child.games.scale, 'the other tab\'s write').toMatchObject({ level: 'right', streak: 2 });
    expect(child.attempts.map((a) => [a.game, a.levelId, a.outcome])).toEqual([['parts', 'split-10', 'first']]);
    expect(child.games.parts.streak).toBe(1);
    expect(child.sessions).toBe(1);
  });
}

test('"תַּרְאוּ לִי אֶת הַתְּמוּנָה" pressed with a key hands its focus on, to the first live card, or to "הַבָּא" after the solve (design 6.5)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const first = await playAt(page, 'parts', 'split-sym');
  await page.locator('[data-show-picture]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-show-picture]')).toHaveCount(0);
  await expect(page.locator('button[data-index]').first()).toBeFocused();
  await look(page);
  await card(page, first.answerAt).click();
  await look(page);
  await page.locator('[data-next]').click();
  await expect(page.locator('main[data-screen="round"]')).not.toHaveAttribute('data-solved');
  // Solved first: the button stays (a symbols level) and draws the solved picture; focus goes to "הַבָּא".
  await look(page);
  await card(page, (await roundOf(page)).answerAt).click();
  await expect(page.locator('[data-next]')).toBeVisible();
  await look(page);
  await page.locator('[data-show-picture]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-show-picture]')).toHaveCount(0);
  await expect(page.locator('[data-next]')).toBeFocused();
});

test('"show me how" on a symbols level draws the help picture in the demo', async ({ page }) => {
  await page.clock.install({ time: NOW });
  await page.goto(`${FIXTURE}#/dev/parts/3/1`);
  await expect(page.locator('[data-show-picture]')).toHaveCount(1);
  await look(page);
  await page.locator('[data-how]').click();
  await expect(page.locator('main[data-screen="demo"]')).toBeVisible();
  await expect(page.locator('[data-show-picture]')).toHaveCount(0);
  await expect(page.locator('[data-area="picture"] [data-role="part"]').first()).toBeVisible();
});

test('a judging round: the cards read as exercises, a wrong one gets its display, the true one solves it', async ({ page }) => {
  await page.clock.install({ time: NOW });
  const n = scale.levels.findIndex((l) => l.skill === 'eq.sign.true-false') + 1;
  await page.goto(`${FIXTURE}#/dev/scale/${n}/1`);
  const { round, answerAt } = await roundOf(page);
  for (const [i, { value }] of round.choices.entries()) {
    await expect(card(page, i)).toHaveAttribute('aria-label', [...value.left, '=', ...value.right].join(' '));
  }
  const wrong = answerAt === 0 ? 1 : 0;
  await look(page);
  await card(page, wrong).click();
  await expect(card(page, wrong)).toHaveClass(/is-retired/);
  await expect(page.locator(`[data-display="${RULES[round.choices[wrong].rule].display}"]`)).toBeVisible();
  await unlocked(page);
  await card(page, answerAt).click();
  await expect(page.locator('main[data-screen="round"]')).toHaveAttribute('data-solved', '');
  await expect(page.locator('[data-next]')).toBeFocused();
});

test('R6: the first dot is left of the second', async ({ page }) => {
  // Seed 2 opens on a round with five part dots.
  await playAt(page, 'parts', 'split-10', {}, 2);
  const dots = page.locator('[data-area="picture"] [data-role="part"]');
  expect(await dots.count()).toBeGreaterThanOrEqual(2);
  expect((await dots.nth(0).boundingBox()).x).toBeLessThan((await dots.nth(1).boundingBox()).x);
});

test('a session of 8 rounds ends on the solved pictures and the home button', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install({ time: NOW });
  await page.goto(`${FIXTURE}?seed=1#/play/scale`);
  for (let n = 0; n < 20; n++) {
    const screen = page.locator('main[data-screen]');
    await expect(screen).toHaveAttribute('data-screen', /^(round|demo|end)$/);
    const name = await screen.getAttribute('data-screen');
    if (name === 'end') break;
    if (name === 'round') {
      await look(page);
      const { answerAt } = await roundOf(page);
      await card(page, answerAt).click();
    }
    await expect(page.locator('[data-next]')).toBeVisible();
    await look(page);
    await page.locator('[data-next]').click();
  }
  await expect(page.locator('main[data-screen="end"] .end-thumbs > [data-thumb][data-solved]')).toHaveCount(8);
  await expectThumbsDrawn(page);
  const { child } = await stored(page);
  expect(child.attempts).toHaveLength(8);
  expect(child.attempts.every((a) => a.session === 1 && a.outcome === 'first')).toBe(true);
  await look(page);
  await page.locator('[data-home]').click();
  await expect(page.locator('main[data-screen="home"]')).toBeVisible();
});

// A story's event and the equation row (architecture 2.4-2.5): the story fixture, on fixture.html?story,
// builds the row with its event (ctx.build). The tests hold the event at each phase: its animations
// start paused, and step() finishes the running one, so the next phase starts, paused too.
const STORY = `${FIXTURE}?story`;
const HOLD = '[data-event] * { animation-play-state: paused !important; }';
const step = (page) => page.evaluate(() => {
  for (const a of document.querySelector('[data-event]')?.getAnimations({ subtree: true }) ?? []) a.finish();
});
/** The equation row now: aria-busy, the tokens shown (by index), each token's box and the row's. */
const rowNow = (page) => page.locator('[data-area="equation"] .eq').evaluate((row) => {
  const box = (el) => { const b = el.getBoundingClientRect(); return [b.x, b.y, b.width, b.height].map((v) => Math.round(v * 10) / 10).join(' '); };
  return {
    busy: row.getAttribute('aria-busy'),
    shown: [...row.children].flatMap((t, i) => (getComputedStyle(t).visibility === 'visible' ? [i] : [])),
    unbuilt: row.querySelectorAll('.is-unbuilt').length,
    boxes: [row, ...row.children].map(box),
  };
});
/** The phases of a story fixture round: the sum's first number, then its operator and '?', then every token. */
const phasesOf = (round) => {
  const at = round.equation.left.length > 1 ? 0 : 2;
  return [[at], [at, at + 1, at + 2], [0, 1, 2, 3, 4]];
};

/**
 * Cold-loads fixture.html?story at a hash with every event held (HOLD is in the page before its
 * scripts run). The shell's first route waits for the games' stylesheets (3.1), so the round's
 * event finds its animations even on a cold load: without that wait it would run every phase at once.
 * @param {import('@playwright/test').Page} page
 * @param {string} hash
 */
async function holdStory(page, hash) {
  await page.clock.install({ time: NOW });
  await page.addInitScript((css) => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    document.adoptedStyleSheets = [sheet];
  }, HOLD);
  await page.goto(`${STORY}${hash}`);
  await expect(page.locator('main[data-screen="round"][data-game="story"], main[data-screen="demo"][data-game="story"]')).toBeVisible();
  await look(page);
  return roundOf(page);
}

for (const seed of [1, 2]) {
  test(`story, seed ${seed}: the event builds the equation row in place, aria-busy until every token shows`, async ({ page }) => {
    const { round } = await holdStory(page, `#/dev/story/1/${seed}`);
    expect(round.eqform).toBe(seed === 1 ? 'standard' : 'reversed');
    const phases = phasesOf(round);
    const first = await rowNow(page);
    expect(first).toMatchObject({ busy: 'true', shown: phases[0], unbuilt: 4 });
    await expect(page.locator('[data-area="picture"] [data-event]')).toHaveCount(1);
    await step(page);
    await expect.poll(async () => (await rowNow(page)).shown).toEqual(phases[1]);
    expect(await rowNow(page)).toEqual({ ...first, shown: phases[1], unbuilt: 2 });
    await step(page);
    await expect.poll(async () => (await rowNow(page)).shown).toEqual(phases[2]);
    // Built, the row and every token keep the boxes they had with one token shown: nothing moved.
    expect(await rowNow(page)).toEqual({ ...first, busy: null, shown: phases[2], unbuilt: 0 });
    await expect(page.locator('[data-event]')).toHaveCount(0);
    expect(await page.locator('[data-area="equation"] .eq').ariaSnapshot()).toBe(spoken(round.equation, '?'));
  });
}

test('story: a right tap during the event is taken; the row shows every token and leaves aria-busy before the cover lifts', async ({ page }) => {
  await seedStore(page, storeWith({ games: { story: ladderAt('event') } }));
  const { round, answerAt } = await holdStory(page, '#/play/story');
  expect((await rowNow(page)).busy).toBe('true');
  await page.locator('[data-area="equation"]').evaluate((area) => {
    const log = [];
    /** @type {any} */ (window).equationLog = log;
    new MutationObserver((records) => {
      for (const r of records) {
        const el = /** @type {Element} */ (r.target);
        if (r.attributeName === 'aria-busy') log.push(`busy ${el.getAttribute('aria-busy')}`);
        else if (el.classList.contains('cover')) log.push(el.classList.contains('is-lifted') ? 'lift' : 'cover');
        else if (el.parentElement?.classList.contains('eq')) log.push(el.classList.contains('is-unbuilt') ? 'hide' : 'show');
      }
    }).observe(area, { attributes: true, subtree: true, attributeFilter: ['aria-busy', 'class'] });
  });
  await card(page, answerAt).click();
  await expect(page.locator('main[data-screen="round"]')).toHaveAttribute('data-solved', '');
  const log = await page.evaluate(() => /** @type {any} */ (window).equationLog);
  expect(log.filter((e) => e !== 'cover')).toEqual(['show', 'show', 'show', 'show', 'busy null', 'lift']);
  expect(await rowNow(page)).toMatchObject({ busy: null, shown: [0, 1, 2, 3, 4], unbuilt: 0 });
  await expect(page.locator('[data-event]')).toHaveCount(0);
  await expect(page.locator('[data-next]')).toBeVisible();
  // A late build after the solve, as an event chain resuming after the tap would send, does nothing (2.4).
  await page.evaluate(() => /** @type {any} */ (window).storyBuild([0]));
  expect(await rowNow(page)).toMatchObject({ busy: null, shown: [0, 1, 2, 3, 4], unbuilt: 0 });
  // [data-solved] shows a token even if something marked it unbuilt after the solve (app.css).
  const late = await page.locator('[data-area="equation"] .eq > *').nth(1).evaluate((t) => {
    t.classList.add('is-unbuilt');
    return getComputedStyle(t).visibility;
  });
  expect(late).toBe('visible');
  expect(await lastAttempt(page)).toMatchObject({ game: 'story', outcome: 'first', wrong: [], answer: round.answer });
  // The next round starts from its own event: one token shown, the row busy again.
  await look(page);
  await page.locator('[data-next]').click();
  await expect(page.locator('main[data-screen="round"]:not([data-solved])')).toBeVisible();
  const next = await roundOf(page);
  expect(await rowNow(page)).toMatchObject({ busy: 'true', shown: phasesOf(next.round)[0], unbuilt: 4 });
});

test('story: a wrong tap during the event finishes it, gets its display, and setEquation draws the row whole', async ({ page }) => {
  const { round, answerAt } = await holdStory(page, '#/dev/story/1/1');
  await page.locator('[data-area="equation"] .eq').evaluate((row) => [row, ...row.children].forEach((n) => n.setAttribute('data-before', '')));
  const wrong = answerAt === 0 ? 1 : 0;
  await card(page, wrong).click();
  await expect(page.locator(`[data-display="${RULES[round.choices[wrong].rule].display}"]`)).toBeVisible();
  await unlocked(page);
  await expect(page.locator('[data-event]')).toHaveCount(0);
  // The fixture finishes its event on a miss with setEquation: the row refilled in place (one atomic live region per
  // round, design 6.4), its tokens new, fully built, not busy.
  await expect(page.locator('[data-area="equation"] .eq')).toHaveAttribute('data-before');
  await expect(page.locator('[data-area="equation"] .eq > [data-before]')).toHaveCount(0);
  expect(await rowNow(page)).toMatchObject({ busy: null, shown: [0, 1, 2, 3, 4], unbuilt: 0 });
  expect(await page.locator('[data-area="equation"] .eq').ariaSnapshot()).toBe(spoken(round.equation, '?'));
  await card(page, answerAt).click();
  await expect(page.locator('[data-next]')).toBeVisible();
});

test('story: "show me how" during the event: the demo builds its own row and waits for its event; then the round starts again', async ({ page }) => {
  const { round } = await holdStory(page, '#/dev/story/1/1');
  // The round's build and row, kept for a late build after the abort.
  await page.evaluate(() => Object.assign(window, { lateBuild: /** @type {any} */ (window).storyBuild, oldRow: document.querySelector('[data-area="equation"] .eq') }));
  await page.locator('[data-how]').click();
  await expect(page.locator('main[data-screen="demo"]')).toBeVisible();
  const demo = await roundOf(page);
  const demoRow = await rowNow(page);
  expect(demoRow).toMatchObject({ busy: 'true', shown: phasesOf(demo.round)[0] });
  // After the abort the round's build does nothing: no throw, its old row as it was, the demo's row unchanged (2.4).
  const old = await page.evaluate(() => {
    const w = /** @type {any} */ (window);
    w.lateBuild([]);
    return { busy: w.oldRow.getAttribute('aria-busy'), unbuilt: w.oldRow.querySelectorAll('.is-unbuilt').length };
  });
  expect(old).toEqual({ busy: 'true', unbuilt: 4 });
  expect(await rowNow(page)).toEqual(demoRow);
  // The demo waits for the event: the hand has not moved, and nothing is solved.
  await expect(page.locator('[data-hand]')).not.toHaveAttribute('style');
  await step(page);
  await expect.poll(async () => (await rowNow(page)).shown).toEqual(phasesOf(demo.round)[1]);
  await expect(page.locator('main[data-screen="demo"]')).not.toHaveAttribute('data-solved');
  await step(page);
  await expect(page.locator('main[data-screen="demo"]')).toHaveAttribute('data-solved', '');
  expect(await rowNow(page)).toMatchObject({ busy: null, unbuilt: 0 });
  await look(page);
  await page.locator('[data-next]').click();
  await expect(page.locator('main[data-screen="round"]')).toHaveAttribute('data-seed', '1');
  expect(await rowNow(page)).toMatchObject({ busy: 'true', shown: phasesOf(round)[0], unbuilt: 4 });
});

test('story: with reduced motion the event is at its end at once; thumbs draw their end state', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install({ time: NOW });
  await page.goto(`${STORY}#/`);
  // Each thumb's render builds its row (a no-op there): the thumb ctx has build().
  await expectThumbsDrawn(page);
  await expect(page.locator('[data-card] [data-thumb][data-game="story"] > *')).not.toHaveCount(0);
  await page.evaluate(() => { location.hash = '#/dev/story/1/2'; });
  await expect(page.locator('main[data-screen="round"][data-game="story"]')).toBeVisible();
  expect(await rowNow(page)).toMatchObject({ busy: null, shown: [0, 1, 2, 3, 4], unbuilt: 0 });
  await expect(page.locator('[data-event]')).toHaveCount(0);
});

test('a game stylesheet that fails to load does not hold the first route (3.1)', async ({ page, errors }) => {
  errors.allow(/story\/game\.css/);
  await page.route((url) => url.pathname.endsWith('/tests/fixtures/story/game.css'), (route) => route.abort());
  await page.clock.install({ time: NOW });
  await page.goto(`${STORY}#/dev/story/1/1`);
  await expect(page.locator('main[data-screen="round"][data-game="story"]')).toBeVisible();
  // With no CSS the event finds no animation: it is at its end at once.
  expect(await rowNow(page)).toMatchObject({ busy: null, unbuilt: 0 });
});

test('buildEquation: by index in [...left, "=", ...right]; [] hides every token, null shows them all; an index that is no token throws', async ({ page }) => {
  await page.clock.install({ time: NOW });
  await page.goto(`${FIXTURE}#/dev`);
  const result = await page.evaluate(async () => {
    const { buildEquation, drawEquation } = await import('/shell/equation.js');
    const host = document.createElement('div');
    document.body.append(host);
    const { row } = drawEquation(host, { left: [5], right: [2, '+', '?'] }, 3, () => document.createElement('span'));
    const now = () => ({ busy: row.getAttribute('aria-busy'), unbuilt: [...row.children].flatMap((t, i) => (t.classList.contains('is-unbuilt') ? [i] : [])) });
    const states = [];
    for (const indices of [[2], [2, 3, 4], [], null]) {
      buildEquation(row, indices);
      states.push(now());
    }
    const thrown = [[5], [-1], [1.5]].map((indices) => {
      try { buildEquation(row, indices); return 'no throw'; } catch (e) { return e.name; }
    });
    host.remove();
    return { states, thrown, after: now() };
  });
  expect(result.states).toEqual([
    { busy: 'true', unbuilt: [0, 1, 3, 4] },
    { busy: 'true', unbuilt: [0, 1] },
    { busy: 'true', unbuilt: [0, 1, 2, 3, 4] },
    { busy: null, unbuilt: [] },
  ]);
  expect(result.thrown).toEqual(['RangeError', 'RangeError', 'RangeError']);
  expect(result.after, 'a throw changes nothing').toEqual({ busy: null, unbuilt: [] });
});
