// The game spec of architecture 4.7, run on the two fixture games through the real shell. Each
// game branch writes e2e/<id>.spec.js the same way.
import { test, expect } from '@playwright/test';
import { RULES } from '../data/errors.js';
import { FIXTURE, NOW, ladderAt, roundOf, seedStore, storeWith, stored } from './helpers.js';

/**
 * Opens a play session of a game whose ladder is at a level (its demo already seen).
 * @param {import('@playwright/test').Page} page
 * @param {string} game
 * @param {string} level a level id
 * @param {object} [over] more ladder fields
 */
async function playAt(page, game, level, over = {}) {
  await seedStore(page, storeWith({ games: { [game]: ladderAt(level, over) } }));
  await page.clock.install({ time: NOW });
  await page.goto(`${FIXTURE}#/play/${game}`);
  await expect(page.locator('main[data-screen="round"], main[data-screen="demo"]')).toBeVisible();
  return roundOf(page);
}
const card = (page, i) => page.locator(`button[data-index="${i}"]`);
const unlocked = (page) => expect(page.locator('[data-choices]')).not.toHaveAttribute('data-locked');
const lastAttempt = async (page) => (await stored(page)).child.attempts.at(-1);

for (const [game, level] of [['parts', 'split-10'], ['scale', 'right']]) {
  test(`${game}: a first try closes the picture, writes the equation and puts "הַבָּא" in the cards' place`, async ({ page }) => {
    const { round, answerAt } = await playAt(page, game, level);
    const panel = await page.locator('[data-area="picture"]').boundingBox();
    await page.mouse.click(panel.x + 40, panel.y + 40);
    await card(page, answerAt).click();
    const main = page.locator('main[data-screen="round"]');
    await expect(main).toHaveAttribute('data-solved', '');
    const answer = page.locator('.eq-answer');
    await expect(answer).toHaveText(String(round.answer));
    await expect(answer).toHaveCSS('opacity', '1');
    await expect(answer).toHaveCSS('color', 'rgb(214, 51, 108)');
    await expect(page.locator('[data-area="equation"] .cover')).toHaveClass(/is-lifted/);
    await expect(page.locator('[data-next]')).toBeFocused();
    await expect(page.locator('[data-choices]')).toHaveCount(0);
    for (const dot of await page.locator('[data-area="picture"] [data-role="unknown"]').all()) await expect(dot).toHaveCSS('opacity', '1');
    expect(await lastAttempt(page)).toMatchObject({
      game, levelId: level, outcome: 'first', wrong: [], help: [], kind: 'new', options: 4, answer: round.answer,
      taps: { picture: 1, equation: 0, other: 0 }, version: 1, params: expect.objectContaining({ id: level }),
    });
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
    expect(await lastAttempt(page)).toMatchObject({ outcome: 'shown', wrong: wrong.map((i) => round.choices[i].rule), help: ['hint', 'tour'] });
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

test('R6: the first dot is left of the second', async ({ page }) => {
  await playAt(page, 'parts', 'split-10');
  const dots = page.locator('[data-area="picture"] [data-role="part"]');
  if ((await dots.count()) < 2) return;
  expect((await dots.nth(0).boundingBox()).x).toBeLessThan((await dots.nth(1).boundingBox()).x);
});

test('a session of 8 rounds ends on the solved pictures and the home button', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install({ time: NOW });
  await page.goto(`${FIXTURE}#/play/scale`);
  for (let n = 0; n < 20; n++) {
    const screen = page.locator('main[data-screen]');
    await expect(screen).toHaveAttribute('data-screen', /^(round|demo|end)$/);
    const name = await screen.getAttribute('data-screen');
    if (name === 'end') break;
    if (name === 'round') {
      const { answerAt } = await roundOf(page);
      await card(page, answerAt).click();
    }
    await page.locator('[data-next]').click();
  }
  await expect(page.locator('main[data-screen="end"] .end-thumbs > [data-thumb][data-solved]')).toHaveCount(8);
  const { child } = await stored(page);
  expect(child.attempts).toHaveLength(8);
  expect(child.attempts.every((a) => a.session === 1 && a.outcome === 'first')).toBe(true);
  await page.locator('[data-home]').click();
  await expect(page.locator('main[data-screen="home"]')).toBeVisible();
});
