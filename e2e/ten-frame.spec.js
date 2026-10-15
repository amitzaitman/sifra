// The ten-frame game spec (architecture 4.7, R5, R6, R7, R9, R10) on index.html: play sessions
// from a seeded ladder for what is stored, and #/dev rounds with chosen seeds where the round matters.
import { test, expect } from '@playwright/test';
import { RULES } from '../data/errors.js';
import * as game from '../games/ten-frame/game.js';
import { rng } from '../shell/rng.js';
import { INDEX, NOW, expectCalm, expectMathLeftToRight, expectRoleColours, ladderAt, look, roundOf, seedStore, storeWith, stored } from './helpers.js';

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
  await look(page);
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
  while (!ok(game.makeRound(game.levels[number(id) - 1], rng(seed)))) {
    seed += 1;
    if (seed > 5000) throw new Error(`no round of ${id} passes the test`);
  }
  const round = game.makeRound(game.levels[number(id) - 1], rng(seed));
  await page.clock.install({ time: NOW });
  await page.goto(`${INDEX}#/dev/${ID}/${number(id)}/${seed}`);
  await expect(page.locator('main[data-screen="round"]')).toBeVisible();
  await look(page);
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
    if (level === 'bridge-frames') {
      // Bridging ten veils no counter (design 2, principle 3's exception; owner decision 2026-10-15): both
      // shades stay, and the revealed whole is the magenta outline round both frames, with the equation.
      await expect(unknowns).toHaveCount(0);
      const whole = page.locator('[data-area="picture"] .tf-whole');
      await expect(whole).toHaveCSS('opacity', '1');
      await expect(whole.locator('.tf-line')).toHaveCSS('stroke', 'rgb(214, 51, 108)');
      const [a, , b] = round.equation.left;
      const seen = await countersSeen(page);
      expect([tally(seen, true), tally(seen, false)], 'the counters as seen, solved').toEqual([{ dark: a, light: 0 }, { dark: 0, light: b }]);
    // Nothing under the cover (level 2, about one round in ten): the closing rings the empty place with 0.
    } else if (round.answer === 0) await expect(page.locator('[data-area="picture"] .tf-ring.is-zero')).toBeVisible();
    else expect(await unknowns.count()).toBeGreaterThan(0);
    for (const node of await unknowns.all()) {
      await expect(node).toHaveCSS('opacity', '1');
      await expect(node).toHaveCSS('background-color', 'rgb(214, 51, 108)');
    }
    await expect(page.locator('[data-area="picture"] .cover:not(.is-lifted)')).toHaveCount(0);
    await expectRoleColours(page);
    expect(await lastAttempt(page)).toMatchObject({
      game: ID, levelId: level, outcome: 'first', wrong: [], help: [], kind: 'new', options: 4, answer: round.answer, version: game.meta.version,
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
  await expect(page.locator('[data-area="equation"] .eq'), 'fixed frames: nothing moves, the exercise stays').toHaveText(/^8\+5=/);
  expect(await tours('bridge-move', (r) => r.equation.left[0] === 8 && r.equation.left[2] === 5)).toEqual(['10', '11', '12', '13']);
  await expect(page.locator('[data-area="equation"] .eq'), 'level 10: the first frame filled, 10 + 3').toHaveText(/^10\+3=/);
  expect(await tours('split-pairs', (r) => r.answer[0] === 2 && r.answer[1] === 3)).toEqual(['1', '2', '1', '2', '3']);
  expect(await tours('split-pairs', (r) => r.answer[0] === 7 && r.answer[1] === 0)).toEqual(['1', '2', '3', '4', '5', '6', '7', '0']);
});

// A 3-option level's first miss is step 2 and still a first miss: its display stays to the next
// tap, also with reduced motion (its final state), and the hint joins it (architecture 2.5 step 4).
for (const reduced of [false, true]) {
  test(`a 3-option level${reduced ? ' with reduced motion' : ''}: the first miss keeps its display to the next tap with the hint, the second brings the tour`, async ({ page }) => {
    if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' });
    const { round, answerAt } = await playAt(page, 'split-5');
    const wrong = round.choices.map((_, i) => i).filter((i) => i !== answerAt);
    await card(page, wrong[0]).click();
    await unlocked(page);
    const first = page.locator(`[data-display="${RULES[round.choices[wrong[0]].rule].display}"]`);
    await expect(first).toBeVisible();
    await expect(first).not.toHaveClass(/is-leaving/);
    await expect(first).toHaveCSS('opacity', '1');
    expect(await first.locator('*').count(), 'the display draws something').toBeGreaterThan(0);
    await expect(page.locator('[data-hint]')).toBeVisible();
    await expectCalm(page);
    const shown = await first.elementHandle();
    const html = await page.locator('main').innerHTML();
    await page.clock.runFor(60000);
    expect(await page.locator('main').innerHTML(), 'a minute changes nothing').toBe(html);
    await card(page, wrong[1]).click();
    await unlocked(page);
    expect(await shown.evaluate((el) => el.isConnected), 'the next tap removes the first display').toBe(false);
    await expect(page.locator('[data-display]'), 'the second runs and leaves').toHaveCount(0);
    await expect(page.locator('[data-hint]')).toHaveCount(1);
    await expect(page.locator('[data-tour]').last()).toHaveText(String(round.answer));
    await card(page, answerAt).click();
    await expect(page.locator('[data-next]')).toBeVisible();
    expect(await lastAttempt(page)).toMatchObject({ outcome: 'shown', options: 3, help: ['hint', 'tour'] });
  });
}

/** Every display the game uses, on each kind of picture: [level, rule]. */
const DISPLAYS = [
  ['split-10', 'given.whole'], ['split-10', 'given.part'], ['split-10', 'op.other'], ['split-10', 'zero.counted-as-one'],
  ['split-5', 'given.part'], ['ten-empty', 'given.whole'], ['ten-empty', 'op.other'], ['ten-empty', 'zero.counted-as-one'],
  ['ten-cover', 'op.other'], ['split-bond', 'given.whole'], ['split-bond', 'given.part'], ['split-bond', 'op.other'],
  ['split-pairs', 'given.whole'], ['split-pairs', 'op.other'], ['split-pairs', 'zero.counted-as-one'], ['split-pairs', 'slip.near'],
  ['teen-bundle', 'pv.teen-reversed'], ['teen-bundle', 'pv.digits-added'], ['teen-bundle', 'pv.ones-only'], ['teen-bundle', 'slip.near'],
  ['bridge-frames', 'bridge.whole-second'], ['bridge-frames', 'bridge.leftover-only'], ['bridge-frames', 'bridge.stopped-at-ten'],
  ['teen-symbols', 'given.whole'], ['teen-symbols', 'given.part'], ['teen-symbols', 'slip.near'], ['split-5', 'op.other'],
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
    await look(page);
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
  for (const level of ['split-10', 'split-bond', 'split-pairs', 'ten-empty', 'teen-bundle', 'teen-symbols', 'bridge-move']) {
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
  await look(page);
  await page.locator('[data-next]').click();
  await expect(page.locator('main[data-screen="round"]')).toHaveAttribute('data-seed', data.seed);
  await look(page);
  const { answerAt } = await roundOf(page);
  await card(page, answerAt).click();
  await expect(page.locator('[data-next]')).toBeVisible();
  expect(await lastAttempt(page)).toMatchObject({ outcome: 'help', help: ['how'], demo: ['how'], wrong: [] });
});

/**
 * Plays a session to its end screen, each round right on the first try (demos run through).
 * @param {import('@playwright/test').Page} page
 */
async function playToEnd(page) {
  for (let n = 0; n < 30; n++) {
    const screen = page.locator('main[data-screen]');
    await expect(screen).toHaveAttribute('data-screen', /^(round|demo|end)$/);
    const name = await screen.getAttribute('data-screen');
    if (name === 'end') return;
    if (name === 'round') {
      await look(page);
      await card(page, (await roundOf(page)).answerAt).click();
    }
    await expect(page.locator('[data-next]')).toBeVisible();
    await look(page);
    await page.locator('[data-next]').click();
  }
}

test('a session of 8 rounds ends on the solved pictures, and a round after it plays again', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await playAt(page, 'split-10');
  await playToEnd(page);
  await expect(page.locator('main[data-screen="end"] .end-thumbs > [data-thumb][data-solved]')).toHaveCount(8);
  for (const thumb of await page.locator('.end-thumbs [data-thumb]').all()) {
    await expect(thumb.locator('.cover')).toHaveCount(0);
    // The unknown shown, or a ring with 0 when nothing was under the cover.
    expect(await thumb.locator('[data-role="unknown"], .tf-ring.is-zero').count()).toBeGreaterThan(0);
  }
  expect((await stored(page)).child.attempts).toHaveLength(8);
  await look(page);
  await page.locator('[data-home]').click();
  await expect(page.locator('main[data-screen="home"]')).toBeVisible();
  await look(page);
  await page.locator(`[data-card][href="#/play/${ID}"]`).click();
  await expect(page.locator('main[data-screen="round"], main[data-screen="demo"]')).toBeVisible();
  const screen = page.locator('main[data-screen]');
  if (await screen.getAttribute('data-screen') === 'demo') {
    await expect(page.locator('[data-next]')).toBeVisible();
    await look(page);
    await page.locator('[data-next]').click();
    await expect(page.locator('main[data-screen="round"]')).toBeVisible();
  }
  await look(page);
  await card(page, (await roundOf(page)).answerAt).click();
  await expect(page.locator('[data-next]')).toBeVisible();
  expect(await lastAttempt(page)).toMatchObject({ session: 2, outcome: 'first' });
});

/**
 * The text boxes of elements, as drawn (Range rects include transforms), in DOM order.
 * @param {import('@playwright/test').Locator} locator
 */
const textBoxes = (locator) => locator.evaluateAll((els) => els.map((el) => {
  const range = document.createRange();
  range.selectNodeContents(el);
  const { left, right, top, bottom } = range.getBoundingClientRect();
  return { text: el.textContent, left, right, top, bottom, size: parseFloat(getComputedStyle(el).fontSize), cls: el.className };
}));

/** No two boxes on one line touch: at least 2px apart (design 4: digits at 14px and more stay separate). */
function expectApart(boxes) {
  for (const [i, a] of boxes.entries()) {
    for (const b of boxes.slice(i + 1)) {
      const sameLine = a.top < b.bottom && b.top < a.bottom;
      if (sameLine) expect(Math.max(b.left - a.right, a.left - b.right), `"${a.text}" and "${b.text}"`).toBeGreaterThanOrEqual(2);
    }
  }
}

/** Plays every wrong card of a #/dev round, so the tour runs. */
async function toTheTour(page, round, answerAt) {
  for (const i of round.choices.keys()) {
    if (i === answerAt) continue;
    await card(page, i).click();
    await unlocked(page);
  }
}

test('bundles at 320px: the digits above the sticks stay apart, above the outline, the last one grown (design 4, 7.2)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 568 });
  // count-up (a slip card comes only where the place-value rules leave room: 10 and 11).
  const near = await devAt(page, 'teen-bundle', (r) => r.answer === 11 && r.choices.some((c) => c.rule === 'slip.near' && c.value === 12));
  await card(page, near.round.choices.findIndex((c) => c.rule === 'slip.near')).click();
  await unlocked(page);
  const shown = await textBoxes(page.locator('[data-display="count-up"] .tf-digit'));
  expect(shown.map((d) => d.text)).toEqual(['10', '11', '12']);
  expectApart(shown);
  const { round, answerAt } = await devAt(page, 'teen-bundle', (r) => r.answer === 19);
  await toTheTour(page, round, answerAt);
  const tour = await textBoxes(page.locator('[data-tour]'));
  expect(tour.map((d) => d.text)).toEqual(['10', '11', '12', '13', '14', '15', '16', '17', '18', '19']);
  expect(tour.every((d) => d.size >= 14)).toBe(true);
  expectApart(tour);
  expect(tour.at(-1).bottom - tour.at(-1).top, 'the last digit grows').toBeGreaterThan(tour[1].bottom - tour[1].top);
  // The group's outline is drawn under the digits, and its line passes below them.
  const layer = page.locator('.tf-layer').filter({ has: page.locator('[data-tour]') });
  expect(await layer.evaluate((el) => el.firstElementChild?.tagName.toLowerCase())).toBe('svg');
  const line = await layer.locator('svg .tf-line').boundingBox();
  expect(Math.max(...tour.map((d) => d.bottom))).toBeLessThanOrEqual(line.y);
});

test('the bond\'s tour at 320px: the outline round the counted dots cuts none of them, and draws under the last digit (design 7.2)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 568 });
  // Three dots in one row (the last digit 3 in it); 0 and 8: a row of five and a row of three.
  for (const [level, ok] of [['split-bond', (r) => r.answer === 3], ['split-pairs', (r) => r.answer[0] === 0 && r.answer[1] === 8]]) {
    const { round, answerAt } = await devAt(page, level, ok);
    await toTheTour(page, round, answerAt);
    await expect(page.locator('[data-tour]').last(), level).toHaveText(lastTour(round));
    await expect(page.locator('.tf-svg.tf-line-unknown'), level).toHaveCount(1);
    const problems = await page.evaluate(() => {
      const out = [];
      // What is drawn takes a point: the dots, and each outline's line and halo.
      const style = document.head.appendChild(document.createElement('style'));
      style.textContent = '[data-game] .tf-dot { pointer-events: auto !important; } [data-game] .tf-svg path { pointer-events: visibleStroke !important; }';
      for (const dot of document.querySelectorAll('.tf-dot[data-role="unknown"].is-shown')) {
        const b = dot.getBoundingClientRect();
        for (const [edge, y] of [['top', b.top + 0.5], ['bottom', b.bottom - 0.5]]) {
          const hit = document.elementFromPoint(b.left + b.width / 2, y);
          if (hit !== dot) out.push(`a dot at ${Math.round(b.left)},${Math.round(b.top)}: its ${edge} under ${hit?.getAttribute('class')}`);
        }
      }
      style.remove();
      const last = [...document.querySelectorAll('[data-tour]')].at(-1);
      for (const svg of document.querySelectorAll('.tf-svg')) {
        if (last.compareDocumentPosition(svg) & Node.DOCUMENT_POSITION_FOLLOWING) out.push(`${svg.getAttribute('class')} is drawn over the last digit`);
      }
      return out;
    });
    expect(problems, level).toEqual([]);
  }
});

test('a cover over a run of cells covers each of them, and its two pieces meet by a 4px bar (design 6.6)', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  for (const [level, ok] of [['ten-cover', (r) => r.equation.left[0] === 3], ['split-10', (r) => r.equation.left[0] === 3 && r.equation.right[0] === 9]]) {
    const { round } = await devAt(page, level, ok);
    const misses = await page.evaluate(() => {
      const out = [];
      const lids = [...document.querySelectorAll('[data-area="picture"] .tf-lid')];
      // Every cell under a lid: near its top and bottom edges, a quarter in from either side, is the
      // cover itself (hit testing follows the dome's rounded corners), not the lid's box around it.
      for (const cell of document.querySelectorAll('[data-area="picture"] .tf-cell')) {
        const c = cell.getBoundingClientRect();
        const lid = lids.find((l) => {
          const b = l.getBoundingClientRect();
          return c.left >= b.left - 1 && c.right <= b.right + 1 && c.top >= b.top - 1 && c.bottom <= b.bottom + 1;
        });
        if (!lid) continue;
        for (const [fx, fy] of [[0.25, 0.2], [0.75, 0.2], [0.25, 0.85], [0.75, 0.85], [0.5, 0.1]]) {
          const hit = document.elementFromPoint(c.left + fx * c.width, c.top + fy * c.height);
          if (!hit?.matches('.cover')) out.push(`${cell.style.getPropertyValue('--x')},${cell.style.getPropertyValue('--y')} at ${fx},${fy}: ${hit?.className}`);
        }
      }
      return out;
    });
    expect(misses, `${level}: ${JSON.stringify(round.equation)}`).toEqual([]);
    const bar = await page.locator('[data-area="picture"] .tf-span').boundingBox();
    expect(bar.width).toBeLessThanOrEqual(4.5);
  }
});

test('fixed frames (level 11): the split labelled once per part, the ten counted in place, the exercise kept', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const { round, answerAt } = await devAt(page, 'bridge-frames', (r) => r.equation.left[0] === 6 && r.equation.left[2] === 9);
  const wrong = round.choices.map((_, i) => i).filter((i) => i !== answerAt);
  const counters = page.locator('[data-area="picture"] .tf-disc[data-role="part"]');
  const where = () => counters.evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map((b) => [Math.round(b.x), Math.round(b.y)]));
  const before = await where();
  await card(page, wrong[0]).click();
  await unlocked(page);
  await card(page, wrong[1]).click();
  await unlocked(page);
  // 9 = 4 + 5: one number per part. The rest wraps a row and is still one outline.
  const chips = page.locator('[data-hint] .tf-chip');
  await expect(chips).toHaveText(['4', '5']);
  await expect(page.locator('[data-hint] svg')).toHaveCount(1);
  await card(page, wrong[2]).click();
  await unlocked(page);
  await expect(page.locator('[data-tour]')).toHaveText(['10', '11', '12', '13', '14', '15']);
  expect(await where(), 'nothing moved').toEqual(before);
  await expect(page.locator('[data-area="equation"] .eq')).toHaveText(/^6\+9=/);
  // The ten's chip sits above the first frame, clear of the hint's numbers.
  const ten = await page.locator('[data-tour="10"]').boundingBox();
  for (const chip of await chips.all()) {
    const b = await chip.boundingBox();
    expect(ten.y + ten.height <= b.y || b.y + b.height <= ten.y || ten.x + ten.width <= b.x || b.x + b.width <= ten.x).toBe(true);
  }
  expect(ten.y + ten.height).toBeLessThanOrEqual((await page.locator('.tf-tray').first().boundingBox()).y + 4);
  await card(page, answerAt).click();
  await expect(page.locator('[data-next]')).toBeVisible();
  await expect(page.locator('[data-area="equation"] .eq')).toHaveText('6+9=15');
});

test('pair cards at 320px: count-up digits on ghosts are 19px, two-digit ones on a label, none touching (design 4)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 568 });
  const slip = (r) => r.choices.find((c) => c.rule === 'slip.near');
  const { round } = await devAt(page, 'split-pairs', (r) => slip(r) && slip(r).value[0] + slip(r).value[1] === 11 && slip(r).value[0] % 5 !== 0);
  await card(page, round.choices.indexOf(slip(round))).click();
  await unlocked(page);
  const digits = await textBoxes(page.locator('[data-display="count-up"] .tf-digit'));
  expect(digits.map((d) => d.text)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11']);
  for (const d of digits) {
    if (d.text.length === 1) expect(d.size, d.text).toBeGreaterThanOrEqual(19);
    else expect(d.cls, d.text).toContain('is-label');
  }
  expectApart(digits);
  const label = page.locator('[data-display="count-up"] .tf-digit.is-label').first();
  await expect(label).toHaveCSS('background-color', 'rgb(255, 255, 255)');
});

test('the picture label says one in the singular (R1 templates)', async ({ page }) => {
  await devAt(page, 'split-5', (r) => r.equation.left[0] === 1);
  await expect(page.locator('[data-area="picture"]')).toHaveAttribute('aria-label', /עִגּוּל אֶחָד וּמִכְסֶה$/);
  await devAt(page, 'ten-empty', (r) => r.answer === 1);
  await expect(page.locator('[data-area="picture"]')).toHaveAttribute('aria-label', /, תָּא רֵיק אֶחָד$/);
});

test('the second miss locks the cards under a second, also where the cover lifts for the hint (design 7.1)', async ({ page }) => {
  // The second miss is given.whole: its display (flash) leaves the cover down, so the hint lifts it.
  const { round } = await devAt(page, 'split-10', (r) => r.answer > 0 && r.choices.some((c) => c.rule === 'given.whole'));
  const wrong = [round.choices.findIndex((c) => c.rule && c.rule !== 'given.whole'), round.choices.findIndex((c) => c.rule === 'given.whole')];
  await card(page, wrong[0]).click();
  await unlocked(page);
  // The display's own timing, read when the cards lock (its animations exist by then), and the
  // lock timed on the animation timeline, which the page's fake clock does not touch.
  await page.evaluate(() => {
    const row = document.querySelector('[data-choices]');
    const w = /** @type {any} */ (window);
    w.lockTimes = [];
    const lifting = () => document.getAnimations().some((a) => a.playState === 'running' && /** @type {KeyframeEffect} */ (a.effect)?.target?.matches('.cover'));
    new MutationObserver(() => {
      const locked = row.hasAttribute('data-locked');
      if (locked) w.display = document.getAnimations();
      const ends = w.display.map((a) => Number(a.effect.getComputedTiming().endTime));
      const running = w.display.filter((a) => a.playState === 'running').length;
      w.lockTimes.push({ locked, t: document.timeline.currentTime, lifting: lifting(), end: Math.max(0, ...ends), running });
    }).observe(row, { attributes: true, attributeFilter: ['data-locked'] });
  });
  await card(page, wrong[1]).click();
  await unlocked(page);
  await expect(page.locator('[data-hint]')).toBeVisible();
  const times = await page.evaluate(() => /** @type {any} */ (window).lockTimes);
  const on = times.find((x) => x.locked);
  const off = times.findLast((x) => !x.locked);
  // The display runs under a second (design 7.1, 8) and the cards open when it has ended, not later.
  expect(on.end, 'the display as authored').toBeGreaterThan(500);
  expect(on.end, 'the display as authored').toBeLessThan(1000);
  expect(off.running, 'nothing of the display still runs when the cards open').toBe(0);
  expect(off.lifting, 'the cards are open while the cover still lifts').toBe(true);
  // Measured on frames: a frame or two late on a busy machine is not a longer display.
  expect(off.t - on.t).toBeGreaterThanOrEqual(on.end);
  expect(off.t - on.t).toBeLessThan(on.end + 250);
});

/** The equation row's text: the '?' cover adds none, and the hidden answer is in it. */
const row = (page) => page.locator('[data-area="equation"] .eq');
/** Waits out every finite animation (the answer card's ring too), so a calm check is not a race. */
const quiet = (page) => page.evaluate(() => Promise.all(document.getAnimations()
  .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity).map((a) => a.finished.catch(() => null))));

test('level 9, 14 = 10 + ?: the ones under the cover, the whole a tag over both; flash, flash, then the tour counts the ones from 1', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const { round, answerAt } = await devAt(page, 'teen-symbols', (r) => r.answer === 4 && r.eqform === 'reversed');
  const values = Object.fromEntries(round.choices.map((c) => [c.rule ?? 'answer', c.value]));
  expect(values).toEqual({ answer: 4, 'given.part': 10, 'given.whole': 14, 'slip.near': values['slip.near'] });
  expect([3, 5]).toContain(values['slip.near']);
  expect(await said(row(page))).toBe(spoken(round.equation, []));
  await page.locator('[data-show-picture]').click();
  const picture = page.locator('[data-area="picture"]');
  await expect(picture.locator('.tf-tag')).toHaveText('14');
  await expect(picture.locator('.tf-bundle[data-role="part"]')).toBeVisible();
  await expect(picture).toHaveAttribute('aria-label', /14/);
  // The cover holds every one of the ones, and leaves the bundle seen.
  const lid = await picture.locator('.tf-lid .cover').boundingBox();
  const ones = picture.locator('.tf-stick[data-role="unknown"]');
  await expect(ones).toHaveCount(4);
  for (const stick of await ones.all()) {
    const b = await stick.boundingBox();
    expect(b.x >= lid.x - 1 && b.x + b.width <= lid.x + lid.width + 1 && b.y >= lid.y - 1 && b.y + b.height <= lid.y + lid.height + 1).toBe(true);
  }
  const bundle = await picture.locator('.tf-bundle').boundingBox();
  expect(bundle.x + bundle.width).toBeLessThan(lid.x);
  // The tag is over the bundle and the cover together.
  const tag = await picture.locator('.tf-tag').boundingBox();
  expect(tag.y + tag.height).toBeLessThan(bundle.y);
  expect(tag.x).toBeGreaterThan(bundle.x);
  expect(tag.x + tag.width).toBeLessThan(lid.x + lid.width);
  await expectInPanel(page);
  await expectRoleColours(page);
  const at = (rule) => round.choices.findIndex((c) => c.rule === rule);
  // 14: the tag blinks and stays ringed.
  await card(page, at('given.whole')).click();
  await unlocked(page);
  await expect(page.locator('[data-display="flash"] .tf-ring.is-chip')).toBeVisible();
  await expect(picture.locator('.tf-tag')).toHaveClass(/tf-blink/);
  // 10: the bundle; then the hint: a 10 on the bundle, a ring on the cover, which stays down.
  await card(page, at('given.part')).click();
  await unlocked(page);
  await expect(page.locator('[data-hint] .tf-chip')).toHaveText('10');
  await expect(page.locator('[data-hint] .tf-ring.is-hint')).toBeVisible();
  await expect(picture.locator('.tf-lid .cover:not(.is-lifted)')).toHaveCount(1);
  // The slip: the tour lifts the cover and counts the ones from 1, ending on the answer (R5).
  await card(page, at('slip.near')).click();
  await unlocked(page);
  await expect(page.locator('[data-tour]')).toHaveText(['1', '2', '3', '4']);
  await expect(picture.locator('.tf-stick[data-role="unknown"].is-shown')).toHaveCount(4);
  await expect(picture.locator('.tf-lid .cover.is-lifted')).toHaveCount(1);
  await expectMathLeftToRight(page);
  await quiet(page);
  await expectCalm(page);
  await expectInPanel(page);
  await card(page, answerAt).click();
  await expect(page.locator('main[data-screen="round"]')).toHaveAttribute('data-solved', '');
  await expect(row(page)).toHaveText('14=10+4');
  expect(await said(row(page))).toBe(spoken(round.equation, ['4']));
  for (const stick of await ones.all()) await expect(stick).toHaveCSS('background-color', 'rgb(214, 51, 108)');
});

for (const [level, ok, what] of [['ten-cover', (r) => r.answer === 5, '5 + 5'], ['split-10', (r) => r.equation.left[0] === 4 && r.answer === 4, 'a double, 4 + 4']]) {
  test(`${what}: the cover holds the unknown's cells, the cards keep two real errors and a slip, and the tour ends on the answer`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    const { round, answerAt } = await devAt(page, level, ok);
    const whole = round.answer * 2;
    // given.part would be the answer: its card gives way to a slip (number sense 4.4).
    expect(round.choices.map((c) => c.rule).filter(Boolean).sort()).toEqual(['given.whole', 'op.other', 'slip.near']);
    expect(round.choices.map((c) => c.value).filter((v) => v !== round.answer && Math.abs(v - round.answer) !== 1)).toEqual([whole, whole + round.answer]);
    const picture = page.locator('[data-area="picture"]');
    await expect(picture.locator('.tf-disc[data-role="part"]')).toHaveCount(round.answer);
    const lids = picture.locator('.tf-lid');
    const covered = await picture.locator('.tf-cell').evaluateAll((cells, n) => {
      const boxes = [...document.querySelectorAll('[data-area="picture"] .tf-lid')].map((l) => l.getBoundingClientRect());
      return cells.map((c) => c.getBoundingClientRect()).filter((c) => boxes.some((b) => c.left >= b.left - 1 && c.right <= b.right + 1 && c.top >= b.top - 1 && c.bottom <= b.bottom + 1)).length;
    });
    expect(covered, 'the cover holds the unknown\'s cells').toBe(round.answer);
    expect(await lids.count()).toBeGreaterThan(0);
    for (const i of round.choices.keys()) {
      if (i === answerAt) continue;
      await card(page, i).click();
      await unlocked(page);
    }
    await expect(page.locator('[data-hint]')).toBeVisible();
    await expect(page.locator('[data-tour]')).toHaveText(Array.from({ length: round.answer }, (_, j) => String(j + 1)));
    await quiet(page);
    await expectCalm(page);
    await expectInPanel(page);
    await card(page, answerAt).click();
    await expect(page.locator('[data-next]')).toBeVisible();
    await expect(row(page)).toHaveText(`${round.answer}+${round.answer}=${whole}`);
  });
}

test('R8: a result-left round of level 12 and a reversed bond: the hint and the tour end on the answer, and the solved exercise is the one the child got', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const { round, answerAt } = await devAt(page, 'bridge-symbols', (r) => r.unknown === 'result-left' && r.equation.right[0] === 8 && r.equation.right[2] === 5);
  expect(round.equation).toEqual({ left: ['?'], right: [8, '+', 5] });
  expect(await said(row(page))).toBe('- paragraph: ? = 8 + 5');
  for (const i of round.choices.keys()) {
    if (i === answerAt) continue;
    await card(page, i).click();
    await unlocked(page);
  }
  // 8 + 5 in fixed frames: 2 go to the ten and 3 stay; the tour counts the ten, then on to 13.
  await expect(page.locator('[data-hint] .tf-chip')).toHaveText(['2', '3']);
  await expect(page.locator('[data-tour]')).toHaveText(['10', '11', '12', '13']);
  await expect(page.locator('[data-tour]').last()).toHaveText(String(round.answer));
  await expectMathLeftToRight(page);
  await card(page, answerAt).click();
  await expect(page.locator('[data-next]')).toBeVisible();
  await expect(row(page)).toHaveText('13=8+5');
  expect(await said(row(page))).toBe('- paragraph: 13 = 8 + 5');
  // The bond (level 3) also writes 9 = 3 + ?: the same picture and tour, the exercise kept.
  const bond = await devAt(page, 'split-bond', (r) => r.eqform === 'reversed');
  const [whole] = bond.round.equation.left;
  const part = bond.round.equation.right[0];
  expect(await said(row(page))).toBe(`- paragraph: ${whole} = ${part} + ?`);
  for (const i of bond.round.choices.keys()) {
    if (i === bond.answerAt) continue;
    await card(page, i).click();
    await unlocked(page);
  }
  await expect(page.locator('[data-tour]').last()).toHaveText(String(bond.round.answer));
  await card(page, bond.answerAt).click();
  await expect(page.locator('[data-next]')).toBeVisible();
  await expect(row(page)).toHaveText(`${whole}=${part}+${bond.round.answer}`);
});

// ---------- Owner decisions of 2026-10-15 ----------

/** An equation as its shape, numbers as n (as tests/ten-frame.test.js reads forms). */
const shapeOf = (r) => [...r.equation.left, '=', ...r.equation.right].map((t) => (typeof t === 'number' ? 'n' : t)).join(' ');

// Level 9 mixes three forms ("לערבב את שלוש הצורות"): the same picture and cards in each, and the
// help ends on the answer (R4, R5); the child's own exercise is the one solved.
for (const [form, solved] of [['n = n + ?', (k) => `${10 + k}=10+${k}`], ['n + ? = n', (k) => `10+${k}=${10 + k}`], ['n − n = ?', (k) => `${10 + k}−10=${k}`]]) {
  test(`level 9, ${form}: a first miss draws the bundle and the covered ones, the hint the 10, the tour counts the ones to the answer, then solved`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    const { round, answerAt } = await devAt(page, 'teen-symbols', (r) => shapeOf(r) === form && r.answer >= 3);
    const k = round.answer;
    const at = (rule) => round.choices.findIndex((c) => c.rule === rule);
    const cards = Object.fromEntries(round.choices.map((c) => [c.rule ?? 'answer', c.value]));
    expect(cards).toEqual({ answer: k, 'given.part': 10, 'given.whole': 10 + k, 'slip.near': cards['slip.near'] });
    expect([k - 1, k + 1]).toContain(cards['slip.near']);
    expect(await said(row(page))).toBe(spoken(round.equation, []));
    await expect(page.locator('[data-area="picture"] [data-role]')).toHaveCount(0);
    // 14 (given.whole): the help picture comes with the first miss, and the tag blinks.
    await card(page, at('given.whole')).click();
    await unlocked(page);
    const picture = page.locator('[data-area="picture"]');
    await expect(picture.locator('.tf-tag')).toHaveText(String(10 + k));
    await expect(picture.locator('.tf-bundle[data-role="part"]')).toBeVisible();
    await expect(picture.locator('.tf-stick[data-role="unknown"]')).toHaveCount(k);
    await expect(page.locator('[data-display="flash"] .tf-ring.is-chip')).toBeVisible();
    // 10 (given.part): the bundle blinks; the hint labels it 10 and rings the cover.
    await card(page, at('given.part')).click();
    await unlocked(page);
    await expect(page.locator('[data-hint] .tf-chip')).toHaveText('10');
    await expect(page.locator('[data-hint] .tf-ring.is-hint')).toBeVisible();
    // The slip: the tour lifts the cover and counts the ones from 1 to the answer (R5).
    await card(page, at('slip.near')).click();
    await unlocked(page);
    await expect(page.locator('[data-tour]')).toHaveText(Array.from({ length: k }, (_, j) => String(j + 1)));
    await expect(card(page, answerAt)).toHaveClass(/is-shown/);
    await expectMathLeftToRight(page);
    await expectInPanel(page);
    await card(page, answerAt).click();
    await expect(page.locator('main[data-screen="round"]')).toHaveAttribute('data-solved', '');
    await expect(row(page)).toHaveText(solved(k));
    expect(await said(row(page))).toBe(spoken(round.equation, [String(k)]));
  });
}

/**
 * The counters of a bridging picture as the child sees them: the colour painted at each one's centre (part
 * yellow, the light shade, magenta or other), read from a screenshot of the picture decoded in the page, and
 * which frame each is in. Not the data-second attribute or the counter's own background: anything drawn
 * over the counter would hide both. A counter that carries a number (the tour's 11 on) shows its colour in
 * the rim round the number's white circle: there the colour most of 36 points on that rim show, if 4 do.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} [root] the picture, or a thumb
 * @returns {Promise<{ seen: string, first: boolean }[]>}
 */
async function countersSeen(page, root = page.locator('[data-area="picture"]')) {
  const png = (await root.screenshot()).toString('base64');
  const where = await root.evaluate((p) => {
    const box = p.getBoundingClientRect();
    const first = p.querySelector('.tf-tray').getBoundingClientRect();
    const numbers = [...p.querySelectorAll('.tf-digit.on-disc')];
    return [...p.querySelectorAll('.tf-disc.is-counter')].map((d) => {
      const b = d.getBoundingClientRect();
      const [cx, cy] = [b.x + b.width / 2, b.y + b.height / 2];
      const number = numbers.find((n) => {
        const r = n.getBoundingClientRect();
        return Math.abs(r.x + r.width / 2 - cx) < 1 && Math.abs(r.y + r.height / 2 - cy) < 1;
      });
      // The rim between the number's white circle and the counter's 3px edge.
      const white = number ? number.offsetWidth / 2 - parseFloat(getComputedStyle(number, '::before').top) : 0;
      return { x: cx - box.x, y: cy - box.y, first: b.bottom <= first.bottom, rim: number ? (white + b.width / 2 - 3) / 2 : 0 };
    });
  });
  return page.evaluate(async ({ png, where }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${png}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    [canvas.width, canvas.height] = [img.width, img.height];
    const g = canvas.getContext('2d');
    g.drawImage(img, 0, 0);
    const scale = window.devicePixelRatio;
    const colours = { part: [255, 194, 51], light: [255, 237, 184], magenta: [214, 51, 108] };
    const at = (x, y) => {
      const px = g.getImageData(Math.floor(x * scale), Math.floor(y * scale), 1, 1).data;
      const near = Object.entries(colours).find(([, c]) => Math.hypot(px[0] - c[0], px[1] - c[1], px[2] - c[2]) < 30);
      return near ? near[0] : `rgb(${px[0]}, ${px[1]}, ${px[2]})`;
    };
    return where.map(({ x, y, first, rim }) => {
      if (!rim) return { seen: at(x, y), first };
      const hits = { part: 0, light: 0 };
      for (let k = 0; k < 36; k++) {
        const c = at(x + rim * Math.cos((k * Math.PI) / 18), y + rim * Math.sin((k * Math.PI) / 18));
        if (c in hits) hits[c] += 1;
      }
      const best = hits.part > hits.light ? 'part' : 'light';
      return { seen: hits[best] >= 4 ? best : `${hits.part} part and ${hits.light} light of 36 on the rim`, first };
    });
  }, { png, where });
}
/** How many counters in a frame show part yellow and how many the light shade. */
const tally = (list, first) => ({ dark: list.filter((c) => c.first === first && c.seen === 'part').length, light: list.filter((c) => c.first === first && c.seen === 'light').length });

/** Every hint chip at least 1px clear of every counter's disc and of the dashed places (design 7.2). */
async function expectChipsClear(page) {
  const problems = await page.locator('[data-area="picture"]').evaluate((p) => {
    const out = [];
    const circles = [...p.querySelectorAll('.tf-disc, [data-hint] .tf-place')].map((n) => n.getBoundingClientRect());
    for (const chip of p.querySelectorAll('[data-hint] .tf-chip')) {
      const c = chip.getBoundingClientRect();
      for (const d of circles) {
        const [cx, cy, r] = [d.x + d.width / 2, d.y + d.height / 2, d.width / 2];
        const gap = Math.hypot(Math.max(c.left, Math.min(cx, c.right)) - cx, Math.max(c.top, Math.min(cy, c.bottom)) - cy) - r;
        if (gap < 1) out.push(`chip ${chip.textContent} is ${gap.toFixed(1)}px from a circle at ${Math.round(d.x)},${Math.round(d.y)}`);
      }
    }
    return out;
  });
  expect(problems).toEqual([]);
}

test('level 10 at 320px: the second addend in the light shade before and after the move, so the full ten reads 7 + 3 and the rest + 3; the hint\'s numbers clear of every counter (owner decision 2026-10-15)', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const { round } = await devAt(page, 'bridge-move', (r) => r.equation.left[0] === 7 && r.equation.left[2] === 6);
  const [a, , b] = round.equation.left;
  const counters = page.locator('[data-area="picture"] .tf-disc[data-role="part"]');
  await expect(page.locator('[data-area="picture"] .tf-disc[data-second]')).toHaveCount(b);
  let now = await countersSeen(page);
  expect([tally(now, true), tally(now, false)], 'at rest').toEqual([{ dark: a, light: 0 }, { dark: 0, light: b }]);
  await expectRoleColours(page);
  // Two misses bring the hint: 3 go to the ten, 3 stay.
  const wrong = round.choices.map((_, i) => i).filter((i) => round.choices[i].rule !== null);
  for (const i of wrong.slice(0, 2)) {
    await card(page, i).click();
    await unlocked(page);
  }
  await expect(page.locator('[data-hint] .tf-chip')).toHaveText(['3', '3']);
  await expectChipsClear(page);
  await quiet(page);
  now = await countersSeen(page);
  expect([tally(now, true), tally(now, false)], 'in the hint').toEqual([{ dark: a, light: 0 }, { dark: 0, light: b }]);
  // The child moves the light counters up; each keeps its shade, and the hint follows them.
  for (let moved = 0; moved < 10 - a; moved++) await counters.nth(a + b - 1 - moved).click();
  await quiet(page);
  await expect(row(page)).toHaveText(/^10\+3=/);
  now = await countersSeen(page);
  expect([tally(now, true), tally(now, false)], 'after the move').toEqual([{ dark: a, light: 10 - a }, { dark: 0, light: a + b - 10 }]);
  await expectRoleColours(page);
  await expect(page.locator('[data-hint] .tf-chip')).toHaveText(['3', '3']);
  await expectChipsClear(page);
  await expectInPanel(page);
});

for (const [level, [w, h]] of [['bridge-frames', [320, 568]], ['bridge-symbols', [320, 568]], ['bridge-frames', [390, 844]]]) {
  test(`${level} at ${w}px: the second addend shows light at rest, in the hint, at the tour's end and when solved (owner decision 2026-10-15)`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: w, height: h });
    const { round, answerAt } = await devAt(page, level, (r) => r.answer === 15 && (r.unknown === 'result-left' ? r.equation.right : r.equation.left)[0] === 7);
    const [a, , b] = round.unknown === 'result-left' ? round.equation.right : round.equation.left;
    // Fixed frames: nothing moves, so the child sees a part yellow in the first frame and b light in the second
    // at every step. In symbols look the picture comes with the first miss.
    const fixed = [{ dark: a, light: 0 }, { dark: 0, light: b }];
    const seen = async () => {
      const now = await countersSeen(page);
      return [tally(now, true), tally(now, false)];
    };
    if (round.look !== 'symbols') expect(await seen(), 'at rest').toEqual(fixed);
    const wrong = round.choices.map((_, i) => i).filter((i) => i !== answerAt);
    for (const i of wrong.slice(0, 2)) {
      await card(page, i).click();
      await unlocked(page);
    }
    await expect(page.locator('[data-hint]')).toHaveCount(1);
    expect(await seen(), 'in the hint').toEqual(fixed);
    await card(page, wrong[2]).click();
    await unlocked(page);
    await expect(page.locator('[data-tour]').last()).toHaveText('15');
    // No veil: the tour's numbers sit on white circles, and the whole's outline closes the count.
    await expect(page.locator('[data-area="picture"] [data-role="unknown"]')).toHaveCount(0);
    await expect(page.locator('[data-area="picture"] .tf-whole')).toHaveCSS('opacity', '1');
    expect(await seen(), 'at the tour\'s end').toEqual(fixed);
    await expectRoleColours(page);
    await card(page, answerAt).click();
    await expect(page.locator('main[data-screen="round"]')).toHaveAttribute('data-solved', '');
    expect(await seen(), 'solved').toEqual(fixed);
    await expectRoleColours(page);
  });
}

/**
 * A number on a counter as the child sees it, from two screenshots decoded in the page (any engine): as
 * drawn, and with its ink transparent (its white circle and white outline stay). `ink`: the pixels the ink
 * changes; `off`: those whose backing is not white; `gap`: for two digits, the widest run of device-pixel
 * columns with no ink between the digits' centres (0 when they touch); `fill`: how many of 36 points just
 * outside the white circle show the counter's own colour (part yellow or the light shade).
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} digit
 */
async function onWhite(page, digit) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const box = await digit.evaluate((d) => {
    const b = d.getBoundingClientRect();
    const centres = [...d.textContent].map((_, i) => {
      const r = document.createRange();
      r.setStart(d.firstChild, i);
      r.setEnd(d.firstChild, i + 1);
      const c = r.getBoundingClientRect();
      return c.x + c.width / 2;
    });
    // The white circle: the digit's box is its counter's disc, less the ::before inset.
    const white = d.offsetWidth / 2 - parseFloat(getComputedStyle(d, '::before').top);
    return { x: b.x, y: b.y, w: b.width, h: b.height, centres, white, dpr: window.devicePixelRatio };
  });
  const pad = 3;
  const clip = { x: box.x - pad, y: box.y - pad, width: box.w + 2 * pad, height: box.h + 2 * pad };
  const inked = await page.screenshot({ clip });
  await digit.evaluate((d) => d.style.setProperty('color', 'transparent', 'important'));
  const bare = await page.screenshot({ clip });
  await digit.evaluate((d) => d.style.removeProperty('color'));
  return page.evaluate(async ({ shots, centres, white, dpr }) => {
    const pixels = await Promise.all(shots.map(async (png) => {
      const img = new Image();
      img.src = `data:image/png;base64,${png}`;
      await img.decode();
      const canvas = document.createElement('canvas');
      [canvas.width, canvas.height] = [img.width, img.height];
      const g = canvas.getContext('2d');
      g.drawImage(img, 0, 0);
      return g.getImageData(0, 0, img.width, img.height);
    }));
    const [a, b] = pixels.map((p) => p.data);
    const { width, height } = pixels[0];
    const column = new Array(width).fill(0);
    let [ink, off] = [0, 0];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])) <= 24) continue;
        ink += 1;
        column[x] += 1;
        if (Math.min(b[i], b[i + 1], b[i + 2]) < 232) off += 1;
      }
    }
    let [gap, run] = [0, 0];
    if (centres.length === 2) {
      for (let x = Math.ceil(centres[0] * dpr); x <= Math.floor(centres[1] * dpr); x++) {
        run = column[x] ? 0 : run + 1;
        gap = Math.max(gap, run);
      }
    }
    const fillColours = [[255, 194, 51], [255, 237, 184]];
    let fill = 0;
    for (let k = 0; k < 36; k++) {
      const r = (white + 1.1) * dpr;
      const x = Math.floor(width / 2 + r * Math.cos((k * Math.PI) / 18));
      const y = Math.floor(height / 2 + r * Math.sin((k * Math.PI) / 18));
      const i = (y * width + x) * 4;
      if (fillColours.some((c) => Math.hypot(a[i] - c[0], a[i + 1] - c[1], a[i + 2] - c[2]) < 30)) fill += 1;
    }
    return { ink, off, gap, fill };
  }, { shots: [inked, bare].map((s) => s.toString('base64')), centres: box.centres.map((c) => c - clip.x), white: box.white, dpr: box.dpr });
}

// The count stops at ten (bridge.stopped-at-ten). Its 10 is a two-digit number on a counter, at least 14px
// (design 4): it keeps a gap between its digits, its ink stays on white (its white circle, and a white outline
// where the digits pass it: at 320px and on a phone held sideways, where a counter is 20px), and at 390px its
// counter shows its light shade round the white circle, as 1 to 9 do (design 7.1). Measured in Chromium: gaps of
// 4-7 device pixels, 30-36 of the rim's 36 points in the counter's colour at 390px; set 0.1em tighter, the digits
// touched (no gap), and the white circle reached the counter's edge (0 of 36).
for (const [w, h, dpr] of [[320, 568], [390, 844], [390, 844, 3], [844, 390], [740, 360]]) {
  test.describe(`count-up at ${w}x${h}${dpr ? `, dpr ${dpr}` : ''}`, () => {
    if (dpr) test.use({ deviceScaleFactor: dpr });
    test(`count-up on a disc at ${w}x${h}: the 10 apart, on white, its counter's shade round it (design 7.1)`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.setViewportSize({ width: w, height: h });
      const { round } = await devAt(page, 'bridge-frames', (r) => r.equation.left.join() === '7,+,6');
      await card(page, round.choices.findIndex((c) => c.rule === 'bridge.stopped-at-ten')).click();
      await unlocked(page);
      await quiet(page);
      const digits = page.locator('[data-display] .tf-digit.on-disc');
      await expect(digits).toHaveText(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
      for (const [j, one] of (await digits.all()).entries()) {
        const seen = await onWhite(page, one);
        expect(seen.ink, `the ${j + 1} is drawn`).toBeGreaterThan(20);
        expect(seen.off, `ink pixels of the ${j + 1} off white`).toBe(0);
        if (w === 390) expect(seen.fill, `the ${j + 1}'s counter round its white circle, of 36 points`).toBeGreaterThanOrEqual(15);
        if (j === 9) expect(seen.gap, 'device-pixel columns between the 1 and the 0').toBeGreaterThanOrEqual(1);
      }
    });
  });
}

// The tour's numbers on the counters (bridging: 11 to the sum; its 10 is on a chip above the first frame). No
// veil covers a counter (design 2, principle 3's exception), so each number sits on a white circle on its light
// counter, as count-up's do (design 7.2): its digits apart, its ink on white, and at 390px the counter's shade
// round the white circle, the grown last one's too (its circle does not grow). 390px runs with motion. Measured
// in Chromium: gaps of 3-9 device pixels, 22-33 of the rim's 36 points at 390px (fewest round the grown last).
const TOUR = [
  ['bridge-frames', 320, 568, true, [9, 9]],
  ['bridge-symbols', 320, 568, true, [7, 8]],
  ['bridge-move', 320, 568, true, [8, 9]],
  ['bridge-frames', 390, 844, false, [9, 9]],
  ['bridge-frames', 390, 844, true, [8, 9], 3],
  ['bridge-frames', 844, 390, true, [9, 9]],
];
for (const [level, w, h, reduce, [a, b], dpr] of TOUR) {
  test.describe(`the tour at ${w}x${h}${dpr ? `, dpr ${dpr}` : ''}`, () => {
    if (dpr) test.use({ deviceScaleFactor: dpr });
    test(`${level} ${a} + ${b} at ${w}x${h}${reduce ? '' : ' with motion'}: each tour number on its counter apart and on white, the counter's shade round it (design 7.2)`, async ({ page }) => {
      if (reduce) await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.setViewportSize({ width: w, height: h });
      const { round, answerAt } = await devAt(page, level, (r) => (r.unknown === 'result-left' ? r.equation.right : r.equation.left).join() === `${a},+,${b}`);
      await toTheTour(page, round, answerAt);
      const numbers = page.locator('[data-tour].on-disc');
      await expect(numbers).toHaveText(Array.from({ length: a + b - 10 }, (_, j) => String(11 + j)));
      await quiet(page);
      const check = async (when) => {
        for (const one of await numbers.all()) {
          const n = await one.textContent();
          const seen = await onWhite(page, one);
          expect(seen.ink, `${when}: the ${n} is drawn`).toBeGreaterThan(20);
          expect(seen.off, `${when}: ink pixels of the ${n} off white`).toBe(0);
          expect(seen.gap, `${when}: device-pixel columns between the digits of ${n}`).toBeGreaterThanOrEqual(1);
          if (w === 390) expect(seen.fill, `${when}: the ${n}'s counter round its white circle, of 36 points`).toBeGreaterThanOrEqual(15);
        }
      };
      await check('the tour');
      await card(page, answerAt).click();
      await expect(page.locator('main[data-screen="round"]')).toHaveAttribute('data-solved', '');
      await quiet(page);
      await check('solved');
    });
  });
}

test('a home thumb at a bridging level draws the second addend light (owner decision 2026-10-15)', async ({ page }) => {
  await seedStore(page, storeWith({ games: { [ID]: ladderAt('bridge-frames') } }));
  await page.clock.install({ time: NOW });
  await page.goto(`${INDEX}#/`);
  const b = game.makeRound(game.levels[number('bridge-frames') - 1], rng(1)).equation.left[2];
  const thumb = page.locator(`[data-card][href="#/play/${ID}"] [data-thumb]`);
  await expect(thumb.locator('.tf-disc[data-role="part"][data-second]')).toHaveCount(b);
  const seen = await countersSeen(page, thumb);
  expect([tally(seen, true), tally(seen, false)], 'as the thumb shows them').toEqual([{ dark: seen.length - b, light: 0 }, { dark: 0, light: b }]);
  await expectRoleColours(page);
});

test('the end screen of a bridging session: each solved thumb shows the second addend light and the whole\'s outline (owner decision 2026-10-15)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await playAt(page, 'bridge-frames');
  await playToEnd(page);
  const thumbs = page.locator('.end-thumbs > [data-thumb][data-solved]');
  await expect(thumbs).toHaveCount(8);
  for (const thumb of await thumbs.all()) {
    // The thumb is drawn at rest: the first addend in the first frame, the second in the second.
    const b = await thumb.locator('.tf-disc.is-counter[data-second]').count();
    const a = (await thumb.locator('.tf-disc.is-counter').count()) - b;
    expect(a + b, 'a bridging sum').toBeGreaterThan(10);
    const seen = await countersSeen(page, thumb);
    expect([tally(seen, true), tally(seen, false)], `${a} + ${b} as the solved thumb shows it`).toEqual([{ dark: a, light: 0 }, { dark: 0, light: b }]);
    await expect(thumb.locator('.tf-whole')).toHaveCSS('opacity', '1');
  }
  await expect(page.locator('.end-thumbs [data-role="unknown"]')).toHaveCount(0);
  await expectRoleColours(page);
});
