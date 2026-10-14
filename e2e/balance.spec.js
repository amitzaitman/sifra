// The balance game through the real shell (architecture 4.7): a first try, every wrong rule's
// display and its removal, the help ladder to the tour's last digit, the stored outcome, a round
// after "show me how", reduced motion, demos, the symbols picture, 320px, R6 and R7, a session.
import { test, expect } from '@playwright/test';
import { RULES } from '../data/errors.js';
import * as balance from '../games/balance/game.js';
import { INDEX, NOW, expectCalm, expectMathLeftToRight, ladderAt, readsLeftToRight, roundOf, seedStore, storeWith, stored } from './helpers.js';

const MAGENTA = 'rgb(214, 51, 108)';
const PART_EDGE = 'rgb(158, 108, 0)';
/** The real pan's stack (the display and hint layers have frameless pans of their own). */
const stack = (page, side) => page.locator(`.bl-scene > .bl-pan[data-pan="${side}"] > .bl-stack`);
const number = (id) => balance.levels.findIndex((l) => l.id === id) + 1;
const card = (page, i) => page.locator(`button[data-index="${i}"]`);
// A tour can count twenty cubes, 150 ms each: the cards may stay locked a few seconds.
const unlocked = (page) => expect(page.locator('[data-choices]')).not.toHaveAttribute('data-locked', { timeout: 10000 });
const lastAttempt = async (page) => (await stored(page)).child.attempts.at(-1);
const wrongOf = (round) => round.choices.flatMap((c, i) => (c.rule ? [i] : []));
/** @type {(tokens: any[]) => number} */
const total = (tokens) => tokens.reduce((n, t, i) => (typeof t !== 'number' ? n : tokens[i - 1] === '−' ? n - t : n + t), 0);
const tiltOf = (left, right) => (left > right ? 'left' : left < right ? 'right' : 'level');

/**
 * Opens a play session with the ladder at a level whose demo was seen (index.html: random seeds;
 * the round is rebuilt from the screen).
 * @param {import('@playwright/test').Page} page
 * @param {string} level
 * @param {object} [over]
 */
async function playAt(page, level, over = {}) {
  await seedStore(page, storeWith({ games: { balance: ladderAt(level, over) } }));
  await page.clock.install({ time: NOW });
  await page.goto(`${INDEX}#/play/balance`);
  await expect(page.locator('main[data-screen="round"], main[data-screen="demo"]')).toBeVisible();
  return roundOf(page);
}

let visits = 0;
/**
 * One round of #/dev (nothing stored), at a fixed seed.
 * @param {import('@playwright/test').Page} page
 * @param {string} level
 * @param {number} seed
 */
async function devAt(page, level, seed) {
  visits += 1;
  if (visits === 1 || !page.url().includes('?')) await page.clock.install({ time: NOW });
  // A new query each time, so the page loads afresh even on the same round.
  await page.goto(`${INDEX}?v=${visits}#/dev/balance/${number(level)}/${seed}`);
  await expect(page.locator('[data-choices]')).toBeVisible();
  return roundOf(page);
}

/** Where the scene goes when a value fills the unknown's pan: every cube weighs (design 7.3). */
function tiltWith(round, value) {
  const groups = round.look === 'symbols' ? round.helpPicture : round.picture;
  const unknown = groups.find((g) => g.role === 'unknown');
  const sum = (side) => groups.filter((g) => g.side === side && g.role !== 'unknown').reduce((n, g) => n + g.count, 0);
  const mine = sum(unknown.side) + value;
  const other = sum(unknown.side === 'left' ? 'right' : 'left');
  return unknown.side === 'left' ? tiltOf(mine, other) : tiltOf(other, mine);
}

test('a first try: the pans stay level, the unknown shows in its colour, the full exercise, "הַבָּא" in the cards\' place', async ({ page }) => {
  const { round, answerAt } = await playAt(page, 'missing-left');
  const scene = page.locator('.bl-scene');
  await expect(scene).toHaveAttribute('data-tilt', 'level');
  await expect(page.locator('.bl-lid .cover').first()).toBeVisible();
  await card(page, answerAt).click();
  await expect(page.locator('main[data-screen="round"]')).toHaveAttribute('data-solved', '');
  const answer = page.locator('.eq-answer');
  await expect(answer).toHaveText(String(round.answer));
  await expect(answer).toHaveCSS('color', MAGENTA);
  await expect(page.locator('[data-area="equation"] .eq')).toHaveText(`${round.equation.left.join('')}=${round.equation.right.join('')}`.replace('?', String(round.answer)));
  const unknown = page.locator('.bl-cube[data-role="unknown"]');
  await expect(unknown).toHaveCount(round.answer);
  for (const cube of await unknown.all()) {
    await expect(cube).toHaveCSS('opacity', '1');
    await expect(cube).toHaveCSS('background-color', MAGENTA);
  }
  await expect(page.locator('.bl-lid .cover.is-lifted')).toHaveCount(await page.locator('.bl-lid').count());
  await expect(scene).toHaveAttribute('data-tilt', 'level');
  await expect(page.locator('[data-next]')).toBeFocused();
  await expect(page.locator('[data-choices]')).toHaveCount(0);
  expect(await lastAttempt(page)).toMatchObject({ game: 'balance', levelId: 'missing-left', outcome: 'first', wrong: [], help: [], answer: round.answer, options: 4 });
});

// Every rule the game offers, in rounds that show it, with what its display draws (design 7.1, 7.3).
const DISPLAYS = [
  ['same', 1], ['missing-right', 11], ['missing-right', 3], ['missing-reversed', 2], ['missing-reversed', 4],
  ['both-sides', 1], ['turn', 1], ['true-false', 1], ['relational', 1],
];
test('every wrong rule shows its display, and its card goes with its slot kept', async ({ page }) => {
  test.setTimeout(120000);
  const seen = new Set();
  for (const [level, seed] of DISPLAYS) {
    const { round } = await devAt(page, level, seed);
    for (const i of wrongOf(round)) {
      await devAt(page, level, seed);
      const { value, rule } = round.choices[i];
      const display = RULES[rule].display;
      const where = `${level} ${seed} ${rule}`;
      const slot = await card(page, i).boundingBox();
      await card(page, i).click();
      await expect(card(page, i), where).toHaveClass(/is-retired/);
      expect(await card(page, i).boundingBox(), where).toEqual(slot);
      const root = page.locator(`[data-display="${display}"]`);
      await expect(root, where).toBeVisible();
      seen.add(rule);
      const scene = page.locator('.bl-scene');
      if (round.model === 'cards') {
        await expect(root.locator('.bl-ghost'), where).toHaveCount(total(value.left) + total(value.right));
        await expect(scene, where).toHaveAttribute('data-tilt', tiltOf(total(value.left), total(value.right)));
      } else if (round.model === 'set') {
        await expect(root.locator('.bl-ghost'), where).toHaveCount(value);
        await expect(root.locator('.bl-ring'), where).not.toHaveCount(0);
        await expect(page.locator('.bl-lid .cover.is-lifted'), where).toHaveCount(1);
      } else if (display === 'flash') {
        await expect(page.locator('.bl-cube.is-flash'), where).toHaveCount(value);
        await expect(root.locator('.bl-ring'), where).not.toHaveCount(0);
      } else if (display === 'empty-plate') {
        await expect(root.locator('.bl-zero'), where).toHaveText('0');
      } else if (display === 'jumps') {
        await expect(root.locator('.bl-mark').last(), where).toHaveText(String(value));
        await expect(root.locator('.bl-ring'), where).not.toHaveCount(0);
      } else {
        await expect(root.locator('.bl-ghost'), where).toHaveCount(value);
        await expect(scene, where).toHaveAttribute('data-tilt', tiltWith(round, value));
        if (rule === 'equal.compensate-wrong') {
          // a + b = c + ?: the cube went the wrong way, so the second group is the choice.
          const [a, , b] = round.equation.left;
          await expect(stack(page, 'left'), where).toHaveAttribute('data-groups', `${a + b - value} ${value}`);
        }
      }
      await unlocked(page);
    }
  }
  expect([...seen].sort()).toEqual(Object.keys(balance.rules).filter((r) => !['slip.near'].includes(r)).sort());
});

test('a display stays until the next tap, which removes it; a minute changes nothing', async ({ page }) => {
  const { round } = await devAt(page, 'missing-right', 11);
  const [first, second] = wrongOf(round);
  await card(page, first).click();
  await unlocked(page);
  await expectCalm(page);
  const html = await page.locator('main').innerHTML();
  await page.clock.runFor(60000);
  expect(await page.locator('main').innerHTML()).toBe(html);
  await card(page, second).click();
  await unlocked(page);
  // The second display ran and went: the start picture, cover included, with the hint on it (design 7.2).
  await expect(page.locator('[data-display]')).toHaveCount(0);
  await expect(page.locator('.bl-lid .cover.is-lifted')).toHaveCount(0);
  await expect(page.locator('.bl-scene')).toHaveAttribute('data-tilt', 'level');
  await expect(page.locator('[data-hint]')).toHaveCount(1);
  await expectCalm(page);
});

test('a later miss unlocks the cards when its display ends; the beam goes back and the hint comes after, unlocked (design 7.1-7.2)', async ({ page }) => {
  const { round } = await devAt(page, 'both-sides', 1);
  // Two misses whose display tilts the beam, so the return is a real motion.
  const [first, second] = wrongOf(round).filter((i) => RULES[round.choices[i].rule].display === 'balance');
  await card(page, first).click();
  await unlocked(page);
  // What the picture is doing at the moment the cards unlock after the second miss.
  await page.evaluate(() => {
    const row = document.querySelector('[data-choices]');
    new MutationObserver((_, watch) => {
      if (row.hasAttribute('data-locked')) return;
      watch.disconnect();
      window['atUnlock'] = { leaving: document.querySelectorAll('.bl-scene [data-display].is-leaving').length, hint: document.querySelectorAll('[data-hint]').length };
    }).observe(row, { attributes: true, attributeFilter: ['data-locked'] });
  });
  await card(page, second).click();
  await expect(page.locator('[data-choices]')).toHaveAttribute('data-locked');
  const at = await (await page.waitForFunction(() => window['atUnlock'], null, { timeout: 10000 })).jsonValue();
  // The display has ended (it is leaving) and the return runs with the cards open; then the hint.
  expect(at).toEqual({ leaving: 1, hint: 0 });
  await expect(page.locator('[data-hint]')).toHaveCount(1);
  await expect(page.locator('[data-display]')).toHaveCount(0);
  await expect(page.locator('.bl-scene')).toHaveAttribute('data-tilt', 'level');
});

test('the right card during the beam\'s return after the second miss: the hint the shell logged is drawn before the closing (design 7.2)', async ({ page }) => {
  const { round, answerAt } = await devAt(page, 'both-sides', 1);
  const [first, second] = wrongOf(round).filter((i) => RULES[round.choices[i].rule].display === 'balance');
  await card(page, first).click();
  await unlocked(page);
  // The right card is tapped the moment the cards unlock after the second miss, while the beam goes back.
  await page.evaluate((i) => {
    const row = document.querySelector('[data-choices]');
    new MutationObserver((_, watch) => {
      if (row.hasAttribute('data-locked')) return;
      watch.disconnect();
      window['atTap'] = { leaving: document.querySelectorAll('.bl-scene [data-display].is-leaving').length, hint: document.querySelectorAll('[data-hint]').length };
      row.querySelector(`button[data-index="${i}"]`)?.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    }).observe(row, { attributes: true, attributeFilter: ['data-locked'] });
  }, answerAt);
  await card(page, second).click();
  await expect(page.locator('[data-next]')).toBeVisible();
  expect(await page.evaluate(() => window['atTap'])).toEqual({ leaving: 1, hint: 0 });
  await expect(page.locator('[data-hint]')).toHaveCount(1);
});

test('the help ladder: display, then chips and the cover\'s outline, then the tour ends on the answer; outcome shown', async ({ page }) => {
  const { round, answerAt } = await playAt(page, 'missing-right');
  const wrong = wrongOf(round);
  await card(page, wrong[0]).click();
  await expect(page.locator(`[data-display="${RULES[round.choices[wrong[0]].rule].display}"]`)).toBeVisible();
  await unlocked(page);
  await expect(page.locator('[data-hint]')).toHaveCount(0);
  await card(page, wrong[1]).click();
  await expect(page.locator('[data-hint]')).toBeVisible();
  await expect(page.locator('.bl-chip')).toHaveText([`${round.equation.left[0]}+?`, String(round.equation.right[0])]);
  await expect(page.locator('.bl-dash')).toHaveCount(round.answer);
  await unlocked(page);
  await card(page, wrong[2]).click();
  await unlocked(page);
  await expect(page.locator('button[data-index]:not(.is-retired)')).toHaveCount(1);
  await expect(card(page, answerAt)).toHaveClass(/is-shown/);
  await expect(page.locator('[data-tour]').last()).toHaveText(String(round.answer));
  await expect(page.locator('[data-tour]')).toHaveCount(Math.max(1, round.answer));
  await card(page, answerAt).click();
  await expect(page.locator('[data-next]')).toBeVisible();
  expect(await lastAttempt(page)).toMatchObject({ outcome: 'shown', wrong: wrong.map((i) => round.choices[i].rule), help: ['hint', 'tour'] });
});

test('a 3-option level (same-as): piles on the cards; the first miss brings the hint, the second the tour, counting on to the answer', async ({ page }) => {
  const { round, answerAt } = await playAt(page, 'same');
  await expect(page.locator('.bl-scene')).toHaveAttribute('data-tilt', 'left');
  await expect(page.locator('[data-area="equation"] .eq > *')).toHaveCount(0);
  for (const [i, { value }] of round.choices.entries()) {
    await expect(card(page, i).locator('.bl-pile i')).toHaveCount(value);
    await expect(card(page, i)).toHaveAttribute('aria-label', String(value));
  }
  const wrong = wrongOf(round);
  await card(page, wrong[0]).click();
  await expect(page.locator('[data-hint]')).toBeVisible();
  await expect(page.locator('.bl-chip')).toHaveText([String(round.answer), '?']);
  await unlocked(page);
  // A first miss: its display stays with the hint (R5).
  await expect(page.locator(`[data-display="${RULES[round.choices[wrong[0]].rule].display}"]`)).toBeVisible();
  await card(page, wrong[1]).click();
  await unlocked(page);
  await expect(page.locator('[data-tour]').last()).toHaveText(String(round.answer));
  await expect(page.locator('.bl-scene')).toHaveAttribute('data-tilt', 'level');
  await card(page, answerAt).click();
  await expect(page.locator('[data-next]')).toBeVisible();
  expect(await lastAttempt(page)).toMatchObject({ outcome: 'shown', options: 3, help: ['hint', 'tour'] });
});

test('judging: the cards read left to right on one line, two by two; the hint gives each live card a small balance; the tour counts both sides', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const { round, answerAt } = await devAt(page, 'true-false', 1);
  const cards = page.locator('[data-choices]');
  expect(await readsLeftToRight(cards)).toBe('');
  for (const [i, { value }] of round.choices.entries()) {
    await expect(card(page, i)).toHaveAttribute('aria-label', [...value.left, '=', ...value.right].join(' '));
    const eq = await card(page, i).locator('.bl-eq').boundingBox();
    expect(eq.height, 'one line').toBeLessThan(40);
  }
  await expect(page.locator('.bl-mini').first()).toBeHidden();
  const wrong = wrongOf(round);
  await card(page, wrong[0]).click();
  await unlocked(page);
  await card(page, wrong[1]).click();
  await unlocked(page);
  await expect(card(page, answerAt).locator('.bl-mini')).toBeVisible();
  await expect(card(page, answerAt).locator('.bl-mini')).toHaveAttribute('data-tilt', 'level');
  await expect(card(page, wrong[2]).locator('.bl-mini')).not.toHaveAttribute('data-tilt', 'level');
  await expect(card(page, wrong[0]).locator('.bl-mini')).toBeHidden();
  await card(page, wrong[2]).click();
  await unlocked(page);
  await expect(page.locator('[data-tour]').last()).toHaveText(String(total(round.answer.left)));
  await expect(page.locator('[data-tour]')).toHaveCount(total(round.answer.left) + total(round.answer.right));
  await expect(page.locator('[data-area="equation"] .eq > *')).toHaveCount(0);
  await card(page, answerAt).click();
  await expect(page.locator('.bl-scene')).toHaveAttribute('data-tilt', 'level');
  await expect(page.locator('.bl-pan[data-pan="left"] .bl-cube[data-role="whole"]')).toHaveCount(total(round.answer.left));
  // The true card's exercise is written in the equation row (R5), left to right.
  await expect(page.locator('[data-area="equation"] .eq')).toHaveText([...round.answer.left, '=', ...round.answer.right].join(''));
  expect(await readsLeftToRight(page.locator('[data-area="equation"] .eq'))).toBe('');
});

test('the turned row (eq.props.commutative): it turns on mount; the hint turns it again with a ring in each role\'s colour; the tour counts the unknown', async ({ page }) => {
  const { round, answerAt } = await devAt(page, 'turn', 1);
  const [a, , b] = round.equation.left;
  const dots = page.locator('.bl-set > .bl-dot[data-role="part"]');
  expect((await dots.nth(0).boundingBox()).x).toBeLessThan((await dots.nth(1).boundingBox()).x);
  // On mount a copy of the first row turns onto the second, only the dots moving (R10).
  const intro = page.locator('.bl-turning:not([data-hint]) > .bl-twin[data-role="part"]');
  await expect(intro).toHaveCount(a + b);
  await expect(intro.first()).toHaveCSS('animation-name', 'balance-turn');
  const wrong = wrongOf(round);
  await card(page, wrong[0]).click();
  await unlocked(page);
  await card(page, wrong[1]).click();
  await expect(page.locator('[data-hint] > .bl-twin')).toHaveCount(a + b);
  await expect(page.locator('[data-hint] .bl-ring')).toHaveCount(2);
  await expect(page.locator('[data-hint] .bl-ring.is-part')).toHaveCSS('border-top-color', PART_EDGE);
  await expect(page.locator('[data-hint] .bl-ring:not(.is-part)')).toHaveCSS('border-top-color', MAGENTA);
  await unlocked(page);
  await card(page, wrong[2]).click();
  await unlocked(page);
  await expect(page.locator('[data-tour]').last()).toHaveText(String(round.answer));
  await card(page, answerAt).click();
  await expect(page.locator('.bl-set .bl-dot[data-role="unknown"]')).toHaveCount(round.answer);
});

test('the turned row does not turn with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await devAt(page, 'turn', 1);
  await expect(page.locator('.bl-set > .bl-dot').first()).toBeVisible();
  await expect(page.locator('.bl-twin')).toHaveCount(0);
});

test('relational: the hint moves the cubes that make a into c to the first group, the beam level; what is left is ringed against the cover', async ({ page }) => {
  for (const seed of [1, 3]) {
    const { round } = await devAt(page, 'relational', seed);
    const [a, , b] = round.equation.left;
    const [c] = round.equation.right;
    await expect(stack(page, 'left')).toHaveAttribute('data-groups', `${a} ${b}`);
    const wrong = wrongOf(round).filter((i) => round.choices[i].rule !== 'equal.compensate-wrong');
    await card(page, wrong[0]).click();
    await unlocked(page);
    await card(page, wrong[1]).click();
    await unlocked(page);
    await expect(stack(page, 'left'), `seed ${seed}`).toHaveAttribute('data-groups', `${c} ${round.answer}`);
    await expect(page.locator('.bl-scene')).toHaveAttribute('data-tilt', 'level');
    // The second group, now the answer's size, is ringed in the part's colour; the cover in magenta.
    const part = page.locator('[data-hint] .bl-pan[data-pan="left"] .bl-ring.is-part');
    await expect(part).not.toHaveCount(0);
    await expect(part.first()).toHaveCSS('border-top-color', PART_EDGE);
    await expect(page.locator('[data-hint] .bl-pan[data-pan="right"] .bl-ring:not(.is-part)').first()).toHaveCSS('border-top-color', MAGENTA);
  }
});

test('? = a + b: the cover in the shape of a and b; the tour counts on over what was under it, a + 1 to the answer', async ({ page }) => {
  const { round, answerAt } = await devAt(page, 'missing-reversed', 1);
  expect(round.unknown).toBe('result-left');
  const [a, , b] = round.equation.right;
  // The cover: a piece for a's places, a piece for b's from the next row, one bridge.
  await expect(page.locator('.bl-pan[data-pan="left"] .bl-lid:not(.bl-bridge)')).toHaveCount(Math.ceil(a / 5) + Math.ceil(b / 5));
  const wrong = wrongOf(round);
  for (const i of wrong) {
    await card(page, i).click();
    await unlocked(page);
  }
  const tour = page.locator('[data-tour]');
  await expect(tour).toHaveText(Array.from({ length: b }, (_, j) => String(a + j + 1)));
  await expect(tour.last()).toHaveText(String(round.answer));
  // The digits are on the uncovered pile, its last b cubes, and the ring goes round the pile.
  const pile = stack(page, 'left').locator('.bl-cube[data-role="unknown"]');
  await expect(pile).toHaveCount(round.answer);
  for (let j = 0; j < round.answer; j++) await expect(pile.nth(j).locator('[data-tour]')).toHaveCount(j < a ? 0 : 1);
  await expect(page.locator('[data-hint] .bl-pan[data-pan="left"] .bl-ring.is-tour')).not.toHaveCount(0);
  await expect(page.locator('[data-hint] .bl-pan[data-pan="right"] .bl-ring.is-tour')).toHaveCount(0);
  await card(page, answerAt).click();
  await expect(page.locator('[data-next]')).toBeVisible();
});

for (const [level, thing] of [['missing-left', '.bl-scene > .bl-pan > .bl-stack > .bl-cube[data-role="part"]'], ['turn', '.bl-set > .bl-dot[data-role="part"]']]) {
  test(`${level}: a tap on a counted thing leaves one mark; a second tap on it, or a tap on the cover, is logged as off-target (design 6.3)`, async ({ page }) => {
    const { answerAt } = await playAt(page, level);
    const known = page.locator(thing).first();
    await known.click();
    await expect(known.locator('.bl-touch')).toHaveCount(1);
    await known.click();
    await expect(known.locator('.bl-touch')).toHaveCount(1);
    await page.locator('.bl-lid').first().click();
    await expect(page.locator('.bl-touch')).toHaveCount(1);
    await card(page, answerAt).click();
    await expect(page.locator('[data-next]')).toBeVisible();
    expect(await lastAttempt(page)).toMatchObject({ outcome: 'first', taps: { picture: 2, equation: 0, other: 0 } });
  });
}

test('reduced motion: a tap is taken right after a miss, and the hint comes at once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { round, answerAt } = await playAt(page, 'both-sides');
  const wrong = wrongOf(round);
  await card(page, wrong[0]).click();
  await card(page, wrong[1]).click();
  await expect(page.locator('[data-hint]')).toHaveCount(1);
  await expect(page.locator('[data-display]')).toHaveCount(0);
  await card(page, answerAt).click();
  await expect(page.locator('[data-next]')).toBeVisible();
  expect(await lastAttempt(page)).toMatchObject({ outcome: 'help', wrong: wrong.slice(0, 2).map((i) => round.choices[i].rule) });
});

test('reduced motion on a 3-option level: the first miss shows its display\'s final state, then the hint', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { round } = await devAt(page, 'same', 5);
  const [i, j] = wrongOf(round);
  await card(page, i).click();
  await expect(page.locator(`[data-display="${RULES[round.choices[i].rule].display}"]`)).toBeVisible();
  await expect(page.locator('[data-hint]')).toHaveCount(1);
  await card(page, j).click();
  await expect(page.locator('[data-display]')).toHaveCount(0);
  await expect(page.locator('[data-tour]').last()).toHaveText(String(round.answer));
});

for (const level of ['same', 'missing-right', 'both-sides', 'true-false']) {
  test(`a demo level (${level}) runs its demo first: the hand, the closed picture, nothing written`, async ({ page }) => {
    await playAt(page, level, { demoSeen: [] });
    await expect(page.locator('main[data-screen="demo"] [data-hand]')).toBeVisible();
    await expect(page.locator('main[data-screen="demo"]')).toHaveAttribute('data-solved', '');
    await expect(page.locator('[data-next]')).toBeVisible();
    await expect(page.locator('.bl-scene')).toHaveAttribute('data-tilt', 'level');
    expect((await stored(page)).child.attempts).toEqual([]);
    await page.locator('[data-next]').click();
    await expect(page.locator('main[data-screen="round"]')).toHaveAttribute('data-level', String(number(level)));
  });
}

test('a symbols level draws the balance only on request, and logs picture', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { answerAt } = await playAt(page, 'missing-symbols');
  await expect(page.locator('.bl-stage')).toHaveCount(0);
  await page.locator('[data-show-picture]').click();
  await expect(page.locator('.bl-scene')).toBeVisible();
  await expect(page.locator('.bl-lid .cover').first()).toBeVisible();
  await card(page, answerAt).click();
  await expect(page.locator('[data-next]')).toBeVisible();
  expect(await lastAttempt(page)).toMatchObject({ outcome: 'help', help: ['picture'], wrong: [] });
});

test('a symbols level solved on a first try: the exercise closes, no picture was asked for', async ({ page }) => {
  const { answerAt } = await playAt(page, 'missing-symbols-20');
  await card(page, answerAt).click();
  await expect(page.locator('[data-next]')).toBeFocused();
  await expect(page.locator('.bl-stage')).toHaveCount(0);
  expect(await lastAttempt(page)).toMatchObject({ outcome: 'first', help: [] });
});

test('a symbols level draws the balance before the first display', async ({ page }) => {
  const { round } = await playAt(page, 'both-sides-symbols');
  const [i] = wrongOf(round);
  await card(page, i).click();
  await expect(page.locator(`[data-display="${RULES[round.choices[i].rule].display}"]`)).toBeVisible();
  await expect(page.locator('.bl-scene')).toBeVisible();
});

test('a round after "show me how": the demo, then the same round from the start; the record goes on', async ({ page }) => {
  const { data, round, answerAt } = await playAt(page, 'missing-left');
  const [i] = wrongOf(round);
  await card(page, i).click();
  await unlocked(page);
  await page.locator('[data-how]').click();
  await expect(page.locator('main[data-screen="demo"]')).toBeVisible();
  await expect(page.locator('[data-next]')).toBeVisible();
  await page.locator('[data-next]').click();
  const main = page.locator('main[data-screen="round"]');
  await expect(main).toHaveAttribute('data-seed', data.seed);
  await expect(page.locator('.card.is-retired')).toHaveCount(0);
  await expect(page.locator('[data-display]')).toHaveCount(0);
  await card(page, answerAt).click();
  await expect(main).toHaveAttribute('data-solved', '');
  expect(await lastAttempt(page)).toMatchObject({ outcome: 'help', wrong: [round.choices[i].rule], help: ['how'], demo: ['how'] });
});

test('320px: no sideways scroll on any level, through the hint; R7 holds on every [data-math] with the chips shown', async ({ page }) => {
  test.setTimeout(120000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 568 });
  for (const level of balance.levels) {
    const { round } = await devAt(page, level.id, 1);
    for (const i of wrongOf(round).slice(0, level.options === 3 ? 1 : 2)) await card(page, i).click();
    await expect(page.locator('[data-hint]')).toHaveCount(1);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, level.id).toBeLessThanOrEqual(0);
    await expectMathLeftToRight(page);
  }
});

test('R6: cubes in rows of five from the bottom, left to right; the cover stretches over the places of the unknown, one piece per row', async ({ page }) => {
  // 4 + ? = 7: four cubes, the cover over places 5 to 7 (one on the first row, two on the second).
  const { round } = await devAt(page, 'missing-right', 11);
  expect(round.equation).toEqual({ left: [4, '+', '?'], right: [7] });
  const right = page.locator('.bl-pan[data-pan="right"] .bl-cube');
  const [r1, r2, r6] = await Promise.all([right.nth(0).boundingBox(), right.nth(1).boundingBox(), right.nth(5).boundingBox()]);
  expect(r1.x).toBeLessThan(r2.x);
  expect(Math.abs(r6.x - r1.x)).toBeLessThan(1);
  expect(r6.y).toBeLessThan(r1.y);
  const lids = page.locator('.bl-pan[data-pan="left"] .bl-lid:not(.bl-bridge)');
  await expect(lids).toHaveCount(2);
  await expect(page.locator('.bl-pan[data-pan="left"] .bl-bridge')).toHaveCount(1);
  await expect(page.locator('.bl-pan[data-pan="left"] .bl-lid .cover[data-mark="?"]')).toHaveCount(1);
  const [lid1, lid2] = [await lids.nth(0).boundingBox(), await lids.nth(1).boundingBox()];
  const cube = await page.locator('.bl-pan[data-pan="left"] .bl-cube').first().boundingBox();
  expect(lid1.width).toBeCloseTo(cube.width, 0);
  expect(lid2.width).toBeGreaterThan(cube.width * 2);
  await expect(page.locator('.bl-pan[data-pan="right"] .bl-cube').first()).toHaveCSS('background-color', 'rgb(14, 58, 138)');
  // The balance's frame has no role colour (R6, design 6.8).
  await expect(page.locator('.bl-beam')).toHaveCSS('background-color', 'rgb(122, 111, 92)');
  // Each known number is its own pile: 2 + 6, the 6 from the next row up, at the left edge.
  const same = await devAt(page, 'same', 1);
  const a = same.round.picture[0].count;
  const left = stack(page, 'left').locator('.bl-cube');
  const [one, two] = [await left.nth(0).boundingBox(), await left.nth(a).boundingBox()];
  expect(Math.abs(two.x - one.x)).toBeLessThan(1);
  expect(two.y).toBeLessThan(one.y - one.height / 2);
});

test('a cover over a run of places has the dome\'s corners at its ends, from its height, and covers each place (design 6.6)', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  // 3 + ? = 10: a piece over two places and one over five; ? = 6 + 4: pieces in the shape of 6 and 4;
  // the turned rows: one piece over four dots.
  for (const [level, seed] of [['missing-right', 1], ['missing-reversed', 2], ['turn', 4]]) {
    await devAt(page, level, seed);
    const problems = await page.evaluate(() => {
      const out = [];
      const numbers = (s) => (s.match(/[\d.]+/g) ?? []).map(Number);
      const pieces = [...document.querySelectorAll('[data-area="picture"] .bl-lid:not(.bl-bridge)')];
      for (const lid of pieces) {
        // The dome app.css draws for a cover of this height (--cover-h), as the equation's and ten-frame's.
        const probe = document.body.appendChild(document.createElement('div'));
        probe.style.cssText = `position: absolute; width: 10px; height: 10px; --cover-h: ${getComputedStyle(lid).height}`;
        const dome = probe.appendChild(document.createElement('span'));
        dome.className = 'cover';
        const [want, got] = [numbers(getComputedStyle(dome).borderRadius), numbers(getComputedStyle(lid.firstElementChild).borderRadius)];
        probe.remove();
        if (want.length !== got.length || want.some((n, i) => Math.abs(n - got[i]) > 0.05)) out.push(`corners ${got} instead of ${want}`);
      }
      // Every place under the cover: near its top and bottom edges, a quarter in from either side,
      // is the cover itself (hit testing follows the rounded corners), not the box around it.
      for (const place of document.querySelectorAll('[data-area="picture"] .bl-stage [data-role="unknown"]')) {
        const c = place.getBoundingClientRect();
        for (const [fx, fy] of [[0.25, 0.2], [0.75, 0.2], [0.25, 0.85], [0.75, 0.85], [0.5, 0.1]]) {
          const hit = document.elementFromPoint(c.left + fx * c.width, c.top + fy * c.height);
          if (!hit?.matches('.cover')) out.push(`a place at ${Math.round(c.left)},${Math.round(c.top)}, ${fx},${fy}: ${hit?.className}`);
        }
      }
      return out;
    });
    expect(problems, level).toEqual([]);
  }
});

test('a session of 8 rounds ends on the solved pictures', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await playAt(page, 'missing-left');
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
  await expect(page.locator('main[data-screen="end"] .bl-stage.is-thumb')).toHaveCount(8);
  expect((await stored(page)).child.attempts.every((a) => a.outcome === 'first')).toBe(true);
});
