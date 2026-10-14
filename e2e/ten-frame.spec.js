// The ten-frame game spec (architecture 4.7, R5, R6, R7, R9, R10) on index.html: play sessions
// from a seeded ladder for what is stored, and #/dev rounds with chosen seeds where the round matters.
import { test, expect } from '@playwright/test';
import { RULES } from '../data/errors.js';
import * as game from '../games/ten-frame/game.js';
import { rng } from '../lib/rng.js';
import { INDEX, NOW, expectCalm, expectMathLeftToRight, expectRoleColours, ladderAt, roundOf, seedStore, storeWith, stored } from './helpers.js';

const ID = 'ten-frame';
/** @type {(id: string) => number} a level's number, from 1 */
const number = (id) => game.levels.findIndex((l) => l.id === id) + 1;
const card = (page, i) => page.locator(`button[data-index="${i}"]`);
const unlocked = (page) => expect(page.locator('[data-choices]')).not.toHaveAttribute('data-locked');
const lastAttempt = async (page) => (await stored(page)).child.attempts.at(-1);
/** The answer as the k-th '?' shows it. */
const answers = (round) => [round.answer].flat().map(String);
/** What a screen reader gets from the equation row: '?' until solved, then the answers. */
const spoken = (equation, values) => {
  const queue = [...values];
  return `- paragraph: ${[...equation.left, '=', ...equation.right].map((t) => (t === '?' ? queue.shift() ?? '?' : t)).join(' ')}`;
};
/** The row's aria snapshot, without the quotes YAML puts around a line that starts with '?'. */
const said = async (row) => (await row.ariaSnapshot()).replace(/"/g, '');
/** The tour's last digit (R5): the answer, or the second part of a pair. */
const lastTour = (round) => String([round.answer].flat().at(-1));

/**
 * A play session of the game with its ladder at a level (the demo seen), the round rebuilt in Node.
 * @param {import('@playwright/test').Page} page
 * @param {string} level a level id
 * @param {object} [over] more ladder fields
 */
async function playAt(page, level, over = {}) {
  await seedStore(page, storeWith({ games: { [ID]: ladderAt(level, over) } }));
  await page.clock.install({ time: NOW });
  await page.goto(`${INDEX}#/play/${ID}`);
  await expect(page.locator('main[data-screen="round"], main[data-screen="demo"]')).toBeVisible();
  return roundOf(page);
}

/**
 * A #/dev round of a level: the first seed whose round passes a test.
 * @param {import('@playwright/test').Page} page
 * @param {string} id
 * @param {(round: Round) => boolean} [ok]
 */
async function devAt(page, id, ok = () => true) {
  let seed = 1;
  while (!ok(game.makeRound(game.levels[number(id) - 1], rng(seed)))) seed += 1;
  const round = game.makeRound(game.levels[number(id) - 1], rng(seed));
  await page.clock.install({ time: NOW });
  await page.goto(`${INDEX}#/dev/${ID}/${number(id)}/${seed}`);
  await expect(page.locator('main[data-screen="round"]')).toBeVisible();
  return { round, seed, answerAt: round.choices.findIndex((c) => c.rule === null) };
}

/** The panel holds the whole drawing, and nothing scrolls sideways (320px, design 5, 7.1). */
async function expectInPanel(page) {
  const panel = await page.locator('[data-area="picture"]').boundingBox();
  const draw = await page.locator('.tf-draw').boundingBox();
  expect(draw.x).toBeGreaterThanOrEqual(panel.x - 1);
  expect(draw.y).toBeGreaterThanOrEqual(panel.y - 1);
  expect(draw.x + draw.width).toBeLessThanOrEqual(panel.x + panel.width + 1);
  expect(draw.y + draw.height).toBeLessThanOrEqual(panel.y + panel.height + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
}

const KINDS = [['split-10', 'frame'], ['split-bond', 'number bond'], ['split-pairs', 'pair cards'], ['ten-cover', 'make ten'],
  ['teen-bundle', 'bundles'], ['bridge-frames', 'two frames']];

for (const [level, kind] of KINDS) {
  test(`${kind}: a first try closes the picture, writes the equation and puts "הַבָּא" in the cards' place`, async ({ page }) => {
    const { round, answerAt } = await playAt(page, level);
    const row = page.locator('[data-area="equation"] .eq');
    expect(await said(row)).toBe(spoken(round.equation, []));
    await card(page, answerAt).click();
    await expect(page.locator('main[data-screen="round"]')).toHaveAttribute('data-solved', '');
    await expect(page.locator('[data-next]')).toBeFocused();
    await expect(page.locator('[data-choices]')).toHaveCount(0);
    expect(await said(row)).toBe(spoken(round.equation, answers(round)));
    for (const answer of await page.locator('.eq-answer').all()) {
      await expect(answer).toHaveCSS('opacity', '1');
      await expect(answer).toHaveCSS('color', 'rgb(214, 51, 108)');
    }
    const unknowns = page.locator('[data-area="picture"] [data-role="unknown"]');
    expect(await unknowns.count()).toBeGreaterThan(0);
    for (const node of await unknowns.all()) {
      await expect(node).toHaveCSS('opacity', '1');
      await expect(node).toHaveCSS('background-color', 'rgb(214, 51, 108)');
    }
    await expect(page.locator('[data-area="picture"] .cover:not(.is-lifted)')).toHaveCount(0);
    await expectRoleColours(page);
    expect(await lastAttempt(page)).toMatchObject({
      game: ID, levelId: level, outcome: 'first', wrong: [], help: [], kind: 'new', options: 4, answer: round.answer, version: 1,
    });
  });

  test(`${kind}: the help ladder: each display, then the hint, then the tour ends on the answer`, async ({ page }) => {
    const { round, answerAt } = await playAt(page, level);
    const wrong = round.choices.map((_, i) => i).filter((i) => i !== answerAt);
    const display = (i) => RULES[round.choices[i].rule].display;
    const slot = await card(page, wrong[0]).boundingBox();
    await card(page, wrong[0]).click();
    await expect(card(page, wrong[0])).toHaveClass(/is-retired/);
    expect(await card(page, wrong[0]).boundingBox()).toEqual(slot);
    const first = page.locator(`[data-display="${display(wrong[0])}"]`);
    await expect(first).toBeVisible();
    await unlocked(page);
    await expect(page.locator('[data-hint]')).toHaveCount(0);
    const shown = await first.elementHandle();
    const html = await page.locator('main').innerHTML();
    await page.clock.runFor(60000);
    expect(await page.locator('main').innerHTML()).toBe(html);
    await card(page, wrong[1]).click();
    await unlocked(page);
    await expect(page.locator('[data-hint]')).toBeVisible();
    expect(await shown.evaluate((el) => el.isConnected), 'the first display is gone').toBe(false);
    await expect(page.locator('[data-display]'), 'the second runs and leaves').toHaveCount(0);
    await card(page, wrong[2]).click();
    await unlocked(page);
    await expect(page.locator('button[data-index]:not(.is-retired)')).toHaveCount(1);
    await expect(card(page, answerAt)).toHaveClass(/is-shown/);
    await expect(page.locator('[data-tour]').last()).toHaveText(lastTour(round));
    await expectMathLeftToRight(page);
    await expectCalm(page);
    await card(page, answerAt).click();
    await expect(page.locator('[data-next]')).toBeVisible();
    expect(await lastAttempt(page)).toMatchObject({ outcome: 'shown', wrong: wrong.map((i) => round.choices[i].rule), help: ['hint', 'tour'] });
  });
}

test('the tour counts the unknown from 1 when it is a part, and on from ten when it is the whole (R5)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const tours = async (id, ok) => {
    const { round, answerAt } = await devAt(page, id, ok);
    for (const i of round.choices.keys()) {
      if (i === answerAt) continue;
      await card(page, i).click();
      await unlocked(page);
    }
    await expect(page.locator('[data-tour]').last()).toHaveText(lastTour(round));
    return page.locator('[data-tour]').allTextContents();
  };
  expect(await tours('ten-cover', (r) => r.answer === 3)).toEqual(['1', '2', '3']);
  expect(await tours('ten-empty', (r) => r.answer === 0)).toEqual(['0']);
  expect(await tours('teen-bundle', (r) => r.answer === 14)).toEqual(['10', '11', '12', '13', '14']);
  expect(await tours('bridge-frames', (r) => r.equation.left[0] === 8 && r.equation.left[2] === 5)).toEqual(['10', '11', '12', '13']);
  await expect(page.locator('[data-area="equation"] .eq'), 'the first frame filled: 10 + 3').toHaveText(/^10\+3=/);
  expect(await tours('split-pairs', (r) => r.answer[0] === 2 && r.answer[1] === 3)).toEqual(['1', '2', '1', '2', '3']);
  expect(await tours('split-pairs', (r) => r.answer[0] === 7 && r.answer[1] === 0)).toEqual(['1', '2', '3', '4', '5', '6', '7', '0']);
});

test('a 3-option level: the first miss brings the display and the hint, the second the tour', async ({ page }) => {
  const { round, answerAt } = await playAt(page, 'split-5');
  const wrong = round.choices.map((_, i) => i).filter((i) => i !== answerAt);
  await card(page, wrong[0]).click();
  await unlocked(page);
  await expect(page.locator(`[data-display="${RULES[round.choices[wrong[0]].rule].display}"]`)).toBeVisible();
  await expect(page.locator('[data-hint]')).toBeVisible();
  await card(page, wrong[1]).click();
  await unlocked(page);
  await expect(page.locator('[data-tour]').last()).toHaveText(String(round.answer));
  await card(page, answerAt).click();
  await expect(page.locator('[data-next]')).toBeVisible();
  expect(await lastAttempt(page)).toMatchObject({ outcome: 'shown', options: 3, help: ['hint', 'tour'] });
});

/** Every display the game uses, on each kind of picture: [level, rule]. */
const DISPLAYS = [
  ['split-10', 'given.whole'], ['split-10', 'given.part'], ['split-10', 'op.other'], ['split-10', 'zero.counted-as-one'],
  ['split-5', 'given.part'], ['ten-empty', 'given.whole'], ['ten-empty', 'op.other'], ['ten-empty', 'zero.counted-as-one'],
  ['ten-cover', 'op.other'], ['split-bond', 'given.whole'], ['split-bond', 'given.part'], ['split-bond', 'op.other'],
  ['split-pairs', 'given.whole'], ['split-pairs', 'op.other'], ['split-pairs', 'zero.counted-as-one'], ['split-pairs', 'slip.near'],
  ['teen-bundle', 'pv.teen-reversed'], ['teen-bundle', 'pv.digits-added'], ['teen-bundle', 'pv.ones-only'], ['teen-bundle', 'slip.near'],
  ['bridge-frames', 'bridge.whole-second'], ['bridge-frames', 'bridge.leftover-only'], ['bridge-frames', 'bridge.stopped-at-ten'],
];

for (const [level, rule] of DISPLAYS) {
  test(`${level}, ${rule}: its display (${RULES[rule].display}) at 320px, and gone at the next tap`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    const { round, answerAt } = await devAt(page, level, (r) => r.choices.some((c) => c.rule === rule));
    const i = round.choices.findIndex((c) => c.rule === rule);
    await card(page, i).click();
    const shown = page.locator(`[data-display="${RULES[rule].display}"]`);
    await expect(shown).toBeVisible();
    await unlocked(page);
    expect(await shown.locator('*').count(), 'the display draws something').toBeGreaterThan(0);
    await expectInPanel(page);
    await expectCalm(page);
    const handle = await shown.elementHandle();
    const next = round.choices.findIndex((c, j) => j !== i && j !== answerAt);
    await card(page, next).click();
    await unlocked(page);
    expect(await handle.evaluate((el) => el.isConnected)).toBe(false);
    await expectInPanel(page);
  });
}

test('reduced motion: a tap is taken right after a miss, and the hint is there at once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { round, answerAt } = await playAt(page, 'ten-cover');
  const wrong = round.choices.map((_, i) => i).filter((i) => i !== answerAt);
  await card(page, wrong[0]).click();
  await card(page, wrong[1]).click();
  await expect(page.locator('[data-hint]')).toBeVisible();
  await expect(page.locator('[data-display]')).toHaveCount(0);
  await card(page, answerAt).click();
  await expect(page.locator('[data-next]')).toBeVisible();
  expect(await lastAttempt(page)).toMatchObject({ outcome: 'help', wrong: wrong.slice(0, 2).map((i) => round.choices[i].rule) });
});

for (const level of game.levels.filter((l) => l.demo).map((l) => l.id)) {
  test(`${level}: the demo runs first, writes nothing, and the hand taps the answer (R9)`, async ({ page }) => {
    await playAt(page, level, { demoSeen: [] });
    await expect(page.locator('main[data-screen="demo"] [data-hand]')).toBeVisible();
    await expect(page.locator('[data-next]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('main[data-screen="demo"]')).toHaveAttribute('data-solved', '');
    if (level === 'bridge-move') await expect(page.locator('[data-area="equation"] .eq')).toHaveText(/^10\+\d=\d+$/);
    else await expect(page.locator('[data-tour]').first()).toBeVisible();
    expect((await stored(page)).child.attempts).toEqual([]);
    await page.locator('[data-next]').click();
    await expect(page.locator('main[data-screen="round"]')).toHaveAttribute('data-level', String(number(level)));
  });
}

for (const level of game.levels.filter((l) => l.look === 'symbols').map((l) => l.id)) {
  test(`${level}: the exercise alone; the picture on request is the help picture, logged as picture`, async ({ page }) => {
    const { round, answerAt } = await playAt(page, level);
    await expect(page.locator('[data-area="picture"] [data-role]')).toHaveCount(0);
    await page.locator('[data-show-picture]').click();
    await expect(page.locator('[data-show-picture]')).toHaveCount(0);
    await expect(page.locator('[data-area="picture"] [data-role="part"]').first()).toBeVisible();
    await expect(page.locator('[data-area="picture"]')).toHaveAttribute('role', 'img');
    await card(page, answerAt).click();
    await expect(page.locator('[data-next]')).toBeVisible();
    expect(await lastAttempt(page)).toMatchObject({ outcome: 'help', help: ['picture'], wrong: [], answer: round.answer });
  });
}

test('level 10: a tap on a counter of the second frame moves it into the first; full, the exercise reads 10 + the rest', async ({ page }) => {
  const { round, answerAt } = await playAt(page, 'bridge-move');
  const [a, , b] = round.equation.left;
  const row = page.locator('[data-area="equation"] .eq');
  const counters = page.locator('[data-area="picture"] .tf-disc[data-role="part"]');
  const second = page.locator('[data-area="picture"] .tf-tray').nth(1);
  const top = async () => (await second.boundingBox()).y;
  for (let moved = 0; moved < 10 - a; moved++) {
    expect(await row.ariaSnapshot()).toBe(`- paragraph: ${a} + ${b} = ?`);
    // The last counter left in the second frame (drawn last): it moves up into the first frame.
    const node = counters.nth(a + b - 1 - moved);
    await node.click();
    await expect.poll(async () => (await node.boundingBox()).y).toBeLessThan(await top());
  }
  expect(await row.ariaSnapshot()).toBe(`- paragraph: 10 + ${a + b - 10} = ?`);
  const firstFrame = await page.locator('[data-area="picture"] .tf-tray').first().boundingBox();
  let inFirst = 0;
  for (const c of await counters.all()) if ((await c.boundingBox()).y < firstFrame.y + firstFrame.height) inFirst += 1;
  expect(inFirst).toBe(10);
  await counters.first().click();   // the first frame is full: nothing moves any more
  expect(await row.ariaSnapshot()).toBe(`- paragraph: 10 + ${a + b - 10} = ?`);
  await card(page, answerAt).click();
  await expect(page.locator('[data-next]')).toBeVisible();
  expect(await row.ariaSnapshot()).toBe(`- paragraph: 10 + ${a + b - 10} = ${a + b}`);
  expect(await lastAttempt(page)).toMatchObject({ outcome: 'first', taps: { picture: 0, equation: 0, other: 0 } });
});

test('a tap on a counted thing leaves one mark; a second tap on it is logged as off-target (design 6.3)', async ({ page }) => {
  const { answerAt } = await playAt(page, 'split-10');
  const disc = page.locator('[data-area="picture"] .tf-disc[data-role="part"]').first();
  await disc.click();
  await expect(disc.locator('.tf-mark')).toHaveCount(1);
  await disc.click();
  await expect(disc.locator('.tf-mark')).toHaveCount(1);
  await card(page, answerAt).click();
  await expect(page.locator('[data-next]')).toBeVisible();
  expect(await lastAttempt(page)).toMatchObject({ outcome: 'first', taps: { picture: 1 } });
});

test('R6: the first dot is left of the second; the tray is navy only when the frame is the whole', async ({ page }) => {
  await devAt(page, 'split-10', (r) => r.equation.left[0] >= 2);
  const dots = page.locator('[data-area="picture"] [data-role="part"]');
  expect((await dots.nth(0).boundingBox()).x).toBeLessThan((await dots.nth(1).boundingBox()).x);
  await expect(page.locator('.tf-tray')).toHaveCSS('background-color', 'rgb(122, 111, 92)');
  await expect(page.locator('.tf-tray[data-role]')).toHaveCount(0);
  await devAt(page, 'ten-cover');
  await expect(page.locator('.tf-tray')).toHaveCSS('background-color', 'rgb(14, 58, 138)');
  await expect(page.locator('.tf-tray')).toHaveAttribute('data-role', 'whole');
  await devAt(page, 'bridge-frames');
  for (const tray of await page.locator('.tf-tray').all()) await expect(tray).toHaveCSS('background-color', 'rgb(122, 111, 92)');
});

test('R7: the picture, its hint and its tour read left to right, line by line', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const level of ['split-10', 'split-bond', 'split-pairs', 'ten-empty', 'teen-bundle', 'bridge-move']) {
    const { round, answerAt } = await devAt(page, level);
    await expectMathLeftToRight(page);
    for (const i of round.choices.keys()) {
      if (i === answerAt) continue;
      await card(page, i).click();
      await unlocked(page);
    }
    await expect(page.locator('[data-tour]').last()).toHaveText(lastTour(round));
    await expectMathLeftToRight(page);
  }
});

test('"show me how": a demo, then the same round from the start, logged as how', async ({ page }) => {
  const { data } = await playAt(page, 'split-bond');
  await page.locator('[data-how]').click();
  await expect(page.locator('main[data-screen="demo"]')).toBeVisible();
  await expect(page.locator('[data-next]')).toBeVisible({ timeout: 15000 });
  await page.locator('[data-next]').click();
  await expect(page.locator('main[data-screen="round"]')).toHaveAttribute('data-seed', data.seed);
  const { answerAt } = await roundOf(page);
  await card(page, answerAt).click();
  await expect(page.locator('[data-next]')).toBeVisible();
  expect(await lastAttempt(page)).toMatchObject({ outcome: 'help', help: ['how'], demo: ['how'], wrong: [] });
});

test('a session of 8 rounds ends on the solved pictures, and a round after it plays again', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await playAt(page, 'split-10');
  const play = async () => {
    for (let n = 0; n < 30; n++) {
      const screen = page.locator('main[data-screen]');
      await expect(screen).toHaveAttribute('data-screen', /^(round|demo|end)$/);
      const name = await screen.getAttribute('data-screen');
      if (name === 'end') return;
      if (name === 'round') await card(page, (await roundOf(page)).answerAt).click();
      await page.locator('[data-next]').click();
    }
  };
  await play();
  await expect(page.locator('main[data-screen="end"] .end-thumbs > [data-thumb][data-solved]')).toHaveCount(8);
  for (const thumb of await page.locator('.end-thumbs [data-thumb]').all()) {
    await expect(thumb.locator('.cover')).toHaveCount(0);
    // The unknown shown, or a ring with 0 when nothing was under the cover.
    expect(await thumb.locator('[data-role="unknown"], .tf-ring.is-zero').count()).toBeGreaterThan(0);
  }
  expect((await stored(page)).child.attempts).toHaveLength(8);
  await page.locator('[data-home]').click();
  await page.locator(`[data-card][href="#/play/${ID}"]`).click();
  await expect(page.locator('main[data-screen="round"], main[data-screen="demo"]')).toBeVisible();
  const screen = page.locator('main[data-screen]');
  if (await screen.getAttribute('data-screen') === 'demo') await page.locator('[data-next]').click();
  await card(page, (await roundOf(page)).answerAt).click();
  await expect(page.locator('[data-next]')).toBeVisible();
  expect(await lastAttempt(page)).toMatchObject({ session: 2, outcome: 'first' });
});
