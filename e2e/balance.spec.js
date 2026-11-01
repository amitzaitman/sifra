// The balance game through the real shell (architecture 4.7): a first try, every wrong rule's
// display and its removal, the help ladder to the tour's last digit, the stored outcome, a round
// after "show me how", reduced motion, demos, the symbols picture, 320px, R6 and R7, a session.
import { RULES } from '../data/errors.js';
import * as balance from '../games/balance/game.js';
import { rng } from '../shell/rng.js';
import {
  test, expect, INDEX, NOW, expectCalm, expectMathLeftToRight, expectThumbsDrawn, handSeen, ladderAt, look, readsLeftToRight, roundOf, seedStore, storeWith, stored,
  watchHand,
} from './helpers.js';

const MAGENTA = 'rgb(214, 51, 108)';
const PART_EDGE = 'rgb(158, 108, 0)';
const YELLOW = 'rgb(255, 194, 51)';
/** --role-part-2, the second of two known parts (design 3) */
const LIGHT = 'rgb(255, 237, 184)';
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
  await look(page);
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
  await look(page);
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
// 13 + 5 = ? + 12 (both-sides-symbols 9): slip.near's 5, where equal.add-all's 30 needs 9 rows. ? = 6 + 4 twice:
// the slip's 11 over the answer (missing-reversed 10) and the jumps' 9 under it (148; decisions.md 2026-11-01).
const DISPLAYS = [
  ['same', 1], ['missing-right', 11], ['missing-right', 3], ['missing-reversed', 10], ['missing-reversed', 148], ['missing-reversed', 129], ['missing-symbols-20', 31],
  ['both-sides', 1], ['both-sides-symbols', 9], ['turn', 1], ['true-false', 1], ['relational', 1],
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
        // overflow, balance, and a slip's count-up: ghosts on the unknown's pan, the beam tipped.
        expect(['overflow', 'balance', 'count-up'], where).toContain(display);
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
  expect([...seen].sort()).toEqual(Object.keys(balance.rules).sort());
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

test('a later miss unlocks the cards when its display ends; the beam goes back with the hint on it, unlocked (design 7.1-7.2)', async ({ page }) => {
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
  // The display has ended (it is leaving), the hint is on the returning picture, and the return
  // runs with the cards open.
  expect(at).toEqual({ leaving: 1, hint: 1 });
  await expect(page.locator('[data-hint]')).toHaveCount(1);
  await expect(page.locator('[data-display]')).toHaveCount(0);
  await expect(page.locator('.bl-scene')).toHaveAttribute('data-tilt', 'level');
});

test('a display\'s pans and the hint\'s pans swing with the real ones: the ghosts and the cover\'s outline stay on their places (8 = 3 + ?)', async ({ page }) => {
  const { round } = await devAt(page, 'missing-reversed', 8);
  expect(round.equation).toEqual({ left: [8], right: [3, '+', '?'] });
  const at = (value) => round.choices.findIndex((c) => c.value === value);
  // The moment a display is drawn, and the moment the cards unlock after the second miss: every
  // animation in the picture paused, each transition the same time into it (pans that move
  // together are then together), and how far a layer's right pan is from the real one.
  await page.evaluate(() => {
    const scene = document.querySelector('.bl-scene');
    const apart = (t) => {
      const all = scene.getAnimations({ subtree: true });
      for (const a of all) {
        a.pause();
        if (a instanceof CSSTransition) a.currentTime = t;
      }
      const box = (sel) => document.querySelector(sel)?.getBoundingClientRect();
      const gap = (a, b) => (a && b ? Math.round(Math.hypot(a.x - b.x, a.y - b.y)) : null);
      const real = box('.bl-scene > .bl-pan[data-pan="right"]');
      const out = {
        display: gap(box('[data-display]:not(.is-leaving) .bl-pan[data-pan="right"]'), real),
        hint: gap(box('[data-hint] .bl-pan[data-pan="right"]'), real),
        // The outline is a cube scaled to .78 in the first place of the cover's outline.
        dash: gap(box('[data-hint] .bl-dash'), box('.bl-scene > .bl-pan[data-pan="right"] .bl-lid.is-outline')),
        moving: all.filter((a) => a instanceof CSSTransition && a.transitionProperty === 'transform').length,
      };
      for (const a of all) a.play();
      return out;
    };
    new MutationObserver((_, watch) => {
      if (!scene.querySelector('[data-display]')) return;
      watch.disconnect();
      window['atDisplay'] = apart(260);
    }).observe(scene, { childList: true });
    const row = document.querySelector('[data-choices]');
    let locks = 0;
    new MutationObserver((_, watch) => {
      if (row.hasAttribute('data-locked')) return void (locks += 1);
      if (locks < 2) return;
      watch.disconnect();
      window['atUnlock'] = apart(20);
    }).observe(row, { attributes: true, attributeFilter: ['data-locked'] });
  });
  // The first miss (11, balance): ghosts land, then the beam tilts; the display's pans go with it.
  await card(page, at(11)).click();
  const shown = await (await page.waitForFunction(() => window['atDisplay'])).jsonValue();
  expect(shown.moving, 'the beam and pans are tilting').toBeGreaterThan(0);
  expect(shown.display).toBe(0);
  await unlocked(page);
  // The second miss (8): the display leaves and the beam swings back; the hint is drawn on the
  // way, its pans and the cover's outline swinging with the real ones.
  await card(page, at(8)).click();
  const back = await (await page.waitForFunction(() => window['atUnlock'], null, { timeout: 10000 })).jsonValue();
  expect(back.moving, 'the beam and pans are swinging back').toBeGreaterThan(0);
  expect(back.hint).toBe(0);
  expect(back.dash).toBeLessThanOrEqual(5);
});

for (const level of ['both-sides', 'turn']) {
  test(`${level}: the right card the moment the cards unlock after the second miss; the hint the shell logged is on screen at the tap (design 7.2)`, async ({ page }) => {
    const { round, answerAt } = await devAt(page, level, 1);
    // Misses whose display tilts the beam, so the return is a real motion, where there are two.
    const tilting = wrongOf(round).filter((i) => RULES[round.choices[i].rule].display === 'balance');
    const [first, second] = tilting.length >= 2 ? tilting : wrongOf(round);
    await card(page, first).click();
    await unlocked(page);
    // The right card is tapped the moment the cards unlock after the second miss, while the picture goes back.
    await page.evaluate((i) => {
      const row = document.querySelector('[data-choices]');
      new MutationObserver((_, watch) => {
        if (row.hasAttribute('data-locked')) return;
        watch.disconnect();
        window['atTap'] = { leaving: document.querySelectorAll('[data-display].is-leaving').length, hint: document.querySelectorAll('[data-hint]').length };
        row.querySelector(`button[data-index="${i}"]`)?.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
      }).observe(row, { attributes: true, attributeFilter: ['data-locked'] });
    }, answerAt);
    await card(page, second).click();
    await expect(page.locator('[data-next]')).toBeVisible();
    expect(await page.evaluate(() => window['atTap'])).toEqual({ leaving: 1, hint: 1 });
    await expect(page.locator('[data-hint]')).toHaveCount(1);
  });
}

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
  // Solved, the chip's '?' reads the unknown's count in its colour, as the row does (design 6.9, 7.3; hunt 2 #3).
  await expect(page.locator('.bl-chip')).toHaveText([`${round.equation.left[0]}+${round.answer}`, String(round.equation.right[0])]);
  await expect(page.locator('.bl-chip .bl-q')).toHaveCSS('color', MAGENTA);
  expect(await lastAttempt(page)).toMatchObject({ outcome: 'shown', wrong: wrong.map((i) => round.choices[i].rule), help: ['hint', 'tour'] });
});

test('same-as: four piles on the cards, each in its card at 320px; the help ladder to the tour, counting on to the answer (decisions.md 2026-10-31)', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const { round, answerAt } = await playAt(page, 'same');
  await expect(page.locator('.bl-scene')).toHaveAttribute('data-tilt', 'left');
  await expect(page.locator('[data-area="equation"] .eq > *')).toHaveCount(0);
  expect(round.choices).toHaveLength(4);
  for (const [i, { value }] of round.choices.entries()) {
    await expect(card(page, i).locator('.bl-pile i')).toHaveCount(value);
    await expect(card(page, i)).toHaveAttribute('aria-label', String(value));
    // The pile's rows of five inside the card's 4px padding, as card dots are (design 6.5).
    const [box, pile] = [await card(page, i).boundingBox(), await card(page, i).locator('.bl-pile').boundingBox()];
    expect(pile.x, `pile ${value}`).toBeGreaterThanOrEqual(box.x + 4 - 0.5);
    expect(pile.x + pile.width, `pile ${value}`).toBeLessThanOrEqual(box.x + box.width - 4 + 0.5);
    const cubes = await card(page, i).locator('.bl-pile i').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().y));
    expect(new Set(cubes.slice(0, 5).map(Math.round)).size, 'five in a row').toBe(1);
  }
  const wrong = wrongOf(round);
  await card(page, wrong[0]).click();
  await unlocked(page);
  await expect(page.locator(`[data-display="${RULES[round.choices[wrong[0]].rule].display}"]`)).toBeVisible();
  await expect(page.locator('[data-hint]')).toHaveCount(0);
  await card(page, wrong[1]).click();
  await expect(page.locator('[data-hint]')).toBeVisible();
  await expect(page.locator('.bl-chip')).toHaveText([String(round.answer), '?']);
  await unlocked(page);
  await card(page, wrong[2]).click();
  await unlocked(page);
  await expect(page.locator('[data-tour]').last()).toHaveText(String(round.answer));
  await expect(page.locator('.bl-scene')).toHaveAttribute('data-tilt', 'level');
  await card(page, answerAt).click();
  await expect(page.locator('[data-next]')).toBeVisible();
  // Solved, both chips read the answer, the right one in the unknown's colour (hunt 2 #3).
  await expect(page.locator('.bl-chip')).toHaveText([String(round.answer), String(round.answer)]);
  await expect(page.locator('.bl-chip[data-pan="right"] .bl-q')).toHaveCSS('color', MAGENTA);
  expect(await lastAttempt(page)).toMatchObject({ outcome: 'shown', options: 4, help: ['hint', 'tour'] });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
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
  await expectCardOnPans(page, round.answer);
  // The true card's exercise is written in the equation row (R5), left to right.
  await expect(page.locator('[data-area="equation"] .eq')).toHaveText([...round.answer.left, '=', ...round.answer.right].join(''));
  expect(await readsLeftToRight(page.locator('[data-area="equation"] .eq'))).toBe('');
});

/** The true card on the balance once solved: a lone number is its side's whole, a sum its parts, the second light. */
async function expectCardOnPans(page, card) {
  for (const side of ['left', 'right']) {
    const tokens = card[side];
    await expect(stack(page, side).locator(`.bl-cube[data-role="${tokens.length === 1 ? 'whole' : 'part'}"]`), side).toHaveCount(total(tokens));
    await expect(stack(page, side).locator('.bl-cube[data-second]'), side).toHaveCount(tokens.length === 1 ? 0 : tokens[2]);
  }
}

/** The form of a card: 'standard' (5 + 2 = 7), 'reversed' (7 = 5 + 2) or 'same' (7 = 7). */
const formOf = (card) => ({ 'n+n=n': 'standard', 'n=n+n': 'reversed', 'n=n': 'same' })[[...card.left, '=', ...card.right].map((t) => (typeof t === 'number' ? 'n' : t)).join('')];

test('judging: the true card in each form (5 + 2 = 7, 7 = 5 + 2, 7 = 7) is the one that solves the round, next to cards of the other forms', async ({ page }) => {
  const level = balance.levels.find((l) => l.id === 'true-false');
  for (const form of ['standard', 'reversed', 'same']) {
    let seed = 1;
    while (formOf(balance.makeRound(level, rng(seed)).answer) !== form) seed += 1;
    const { round, answerAt } = await devAt(page, 'true-false', seed);
    // Every form is on the cards: two standard, one reversed, one without an operation.
    expect(round.choices.map((c) => formOf(c.value)).sort(), form).toEqual(['reversed', 'same', 'standard', 'standard']);
    const wrong = wrongOf(round);
    await card(page, wrong[0]).click();
    await expect(page.locator('[data-display] .bl-ghost'), form).toHaveCount(total(round.choices[wrong[0]].value.left) + total(round.choices[wrong[0]].value.right));
    await unlocked(page);
    await card(page, answerAt).click();
    await expect(page.locator('main[data-screen="round"]'), form).toHaveAttribute('data-solved', '');
    await expect(page.locator('.bl-scene')).toHaveAttribute('data-tilt', 'level');
    await expectCardOnPans(page, round.answer);
    await expect(page.locator('[data-area="equation"] .eq')).toHaveText([...round.answer.left, '=', ...round.answer.right].join(''));
  }
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

test('the turned row in two colours: turned, the colours change sides (owner decision 2026-10-14)', async ({ page }) => {
  const { round } = await devAt(page, 'turn', 1);
  const [a, , b] = round.equation.left;
  // The left row a + b, then the right row's b: drawn in that order.
  const dots = page.locator('.bl-set > .bl-dot[data-role="part"]');
  await expect(dots).toHaveCount(a + 2 * b);
  for (let i = 0; i < a + 2 * b; i++) await expect(dots.nth(i)).toHaveCSS('background-color', i < a ? YELLOW : LIGHT);
  // First row: yellow on the left, light on the right. Second row: light on the left, the cover where a lands.
  const [yellow, light, turned, lid] = [dots.nth(0), dots.nth(a), dots.nth(a + b), page.locator('.bl-set > .bl-lid')].map((l) => l.boundingBox());
  const [y, l, t, c] = await Promise.all([yellow, light, turned, lid]);
  expect(y.x).toBeLessThan(l.x);
  expect(t.x).toBeLessThan(c.x);
  // The turning copy carries the colours: b's dots are light, and they land on the second row's b.
  await expect(page.locator('.bl-turning:not([data-hint]) > .bl-twin[data-second]')).toHaveCount(b);
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
    const cubes = stack(page, 'left').locator('.bl-cube');
    await expect(cubes.nth(a - 1)).toHaveCSS('background-color', YELLOW);
    await expect(cubes.nth(a)).toHaveCSS('background-color', LIGHT);
    const wrong = wrongOf(round).filter((i) => round.choices[i].rule !== 'equal.compensate-wrong');
    await card(page, wrong[0]).click();
    await unlocked(page);
    await card(page, wrong[1]).click();
    await unlocked(page);
    await expect(stack(page, 'left'), `seed ${seed}`).toHaveAttribute('data-groups', `${c} ${round.answer}`);
    // The cubes that change group stay in place and take its colour: c yellow on each pan, in the same places.
    await expect(cubes.nth(c - 1)).toHaveCSS('background-color', YELLOW);
    await expect(cubes.nth(c)).toHaveCSS('background-color', LIGHT);
    // The cards unlock while the beam still swings back (the return is not awaited at step 2): the
    // pans move in opposite directions, so their gap passes through every value on the way. Wait
    // until the scene and both real pans have stopped, then compare the rows once.
    await expect(page.locator('.bl-scene')).toHaveAttribute('data-tilt', 'level');
    await expect.poll(() => page.locator('.bl-scene').evaluate((scene) => [scene, ...scene.querySelectorAll(':scope > .bl-pan')]
      .flatMap((el) => el.getAnimations({ subtree: el !== scene })).length)).toBe(0);
    const theirs = stack(page, 'right').locator('.bl-cube').nth(c - 1);
    const [mine, other] = await Promise.all([cubes.nth(c - 1).boundingBox(), theirs.boundingBox()]);
    expect(Math.abs(mine.y - other.y), `seed ${seed}`).toBeLessThan(1);
    // The second group, now the answer's size, is ringed in the part's colour; the cover in magenta.
    const part = page.locator('[data-hint] .bl-pan[data-pan="left"] .bl-ring.is-part');
    await expect(part).not.toHaveCount(0);
    await expect(part.first()).toHaveCSS('border-top-color', PART_EDGE);
    await expect(page.locator('[data-hint] .bl-pan[data-pan="right"] .bl-ring:not(.is-part)').first()).toHaveCSS('border-top-color', MAGENTA);
  }
});

test('relational: the next tap puts the cubes the wrong way moved back at once, colours too (design 7.2)', async ({ page }) => {
  const { round } = await devAt(page, 'relational', 1);
  const wrong = wrongOf(round);
  const moved = wrong.find((i) => round.choices[i].rule === 'equal.compensate-wrong');
  await card(page, moved).click();
  await unlocked(page);
  // What the real cubes are doing the moment the next display is drawn.
  await page.evaluate(() => {
    const scene = document.querySelector('.bl-scene');
    new MutationObserver((_, watch) => {
      if (!scene.querySelector(':scope > [data-display]')) return;
      watch.disconnect();
      const cubes = [...scene.querySelectorAll(':scope > .bl-pan .bl-cube')];
      window['atDisplay'] = cubes.flatMap((c) => c.getAnimations()).filter((a) => a instanceof CSSTransition && a.transitionProperty === 'background-color').length;
    }).observe(scene, { childList: true });
  });
  await card(page, wrong.find((i) => i !== moved)).click();
  const fading = await (await page.waitForFunction(() => window['atDisplay'] !== undefined && { n: window['atDisplay'] })).jsonValue();
  expect(fading.n, 'no cube fades back while the next display is drawn').toBe(0);
});

test('? = a + b: the fixed cover on the empty pan, its outline over the sum\'s places in rows of five; the tour counts on over what was under it, a + 1 to the answer', async ({ page }) => {
  const { round, answerAt } = await devAt(page, 'missing-reversed', 1);
  expect(round.unknown).toBe('result-left');
  const [a, , b] = round.equation.right;
  // At rest the fixed cover alone; from the hint its outline, a piece per row of the sum's places.
  const outline = page.locator('.bl-pan[data-pan="left"] .bl-lid.is-outline:not(.bl-bridge)');
  await expect(page.locator('.bl-pan[data-pan="left"] .bl-lid.is-fixed')).toBeVisible();
  await expect(outline).toHaveCount(Math.ceil((a + b) / 5));
  for (const piece of await outline.all()) await expect(piece).toBeHidden();
  const wrong = wrongOf(round);
  for (const [n, i] of wrong.entries()) {
    await card(page, i).click();
    await unlocked(page);
    if (n === 1) {
      await expect(page.locator('.bl-pan[data-pan="left"] .bl-lid.is-fixed')).toBeHidden();
      await expect(outline.first()).toBeVisible();
    }
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

// Level 1 has four piles since 2026-10-31 (decisions.md, "מקום התשובה"); the 3-option ladder is the ten-frame's level 1.
test('reduced motion on the piles (same-as): the first miss shows its display\'s final state, the second the hint, the third the tour', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { round } = await devAt(page, 'same', 5);
  const [i, j, k] = wrongOf(round);
  await card(page, i).click();
  await expect(page.locator(`[data-display="${RULES[round.choices[i].rule].display}"]`)).toBeVisible();
  await expect(page.locator('[data-hint]')).toHaveCount(0);
  await card(page, j).click();
  await expect(page.locator('[data-hint]')).toHaveCount(1);
  await expect(page.locator('[data-display]')).toHaveCount(0);
  await card(page, k).click();
  await expect(page.locator('[data-tour]').last()).toHaveText(String(round.answer));
});

/**
 * R9 (the hunt of 2026-10-31): the demo on screen shows how, as a third miss does: the hand touches the pans left to
 * right (the turned rows: the cover), steps off, and the hint and the tour are drawn before it taps the answer; a
 * judging round starts at the hint. The tour's last digit is the answer; no digit is under the hand.
 * @param {import('@playwright/test').Page} page
 */
async function expectDemoShows(page) {
  const { round } = await roundOf(page);
  await expect(page.locator('main[data-screen="demo"]')).toHaveAttribute('data-solved', '', { timeout: 15000 });
  await expect(page.locator('[data-next]')).toBeVisible();
  const { covered, taps } = await handSeen(page);
  const answer = taps.at(-1);
  expect(answer.hint && answer.tour, 'the hint and the tour before the hand taps the answer').toBe(true);
  await expect(page.locator('[data-hint]')).toHaveCount(1);
  expect(covered, 'tour digits under the hand').toEqual([]);
  if (round.model === 'cards') expect(taps).toHaveLength(1);
  else await expect(page.locator('[data-tour]').last()).toHaveText(String(round.answer));
  if (round.model === 'balance') {
    expect(taps).toHaveLength(3);
    expect(taps[0].left, 'the left pan, then the right').toBeLessThan(taps[1].left);
  }
}

for (const level of ['same', 'missing-right', 'both-sides', 'true-false']) {
  test(`a demo level (${level}) runs its demo first: the pans, the hint and the tour, the hand, the closed picture, nothing written`, async ({ page }) => {
    await watchHand(page, { fromStart: true });
    await playAt(page, level, { demoSeen: [] });
    await expect(page.locator('main[data-screen="demo"] [data-hand]')).toBeVisible();
    await expectDemoShows(page);
    await expect(page.locator('.bl-scene')).toHaveAttribute('data-tilt', 'level');
    expect((await stored(page)).child.attempts).toEqual([]);
    await look(page);
    // The closed picture writes no '?': the hint's chip reads the unknown's count (hunt 2 #3).
    await expect(page.locator('[data-next]')).toBeVisible();
    await expect(page.locator('.bl-chip', { hasText: '?' })).toHaveCount(0);
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
  await watchHand(page);
  await page.locator('[data-how]').click();
  await expect(page.locator('main[data-screen="demo"]')).toBeVisible();
  await expectDemoShows(page);
  await look(page);
  await page.locator('[data-next]').click();
  const main = page.locator('main[data-screen="round"]');
  await expect(main).toHaveAttribute('data-seed', data.seed);
  await expect(page.locator('.card.is-retired')).toHaveCount(0);
  await expect(page.locator('[data-display]')).toHaveCount(0);
  await look(page);
  await card(page, answerAt).click();
  await expect(main).toHaveAttribute('data-solved', '');
  // The attempt is written once the closing has run, by "הַבָּא" (3.9).
  await expect(page.locator('[data-next]')).toBeVisible();
  expect(await lastAttempt(page)).toMatchObject({ outcome: 'help', wrong: [round.choices[i].rule], help: ['how'], demo: ['how'] });
});

for (const level of ['turn', 'missing-symbols', 'relational']) {
  test(`"show me how" at ${level}: the hand, then the hint and the tour before the answer (R9)`, async ({ page }) => {
    await devAt(page, level, 1);
    await watchHand(page);
    await page.locator('[data-how]').click();
    await expect(page.locator('main[data-screen="demo"]')).toBeVisible();
    await expectDemoShows(page);
  });
}

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

/**
 * The tour checks' screens: two phones held upright, and two on their side, where the balance's picture is 240px tall
 * (design 5, bug hunt #4).
 * @type {[number, number][]}
 */
const SCREENS = [[320, 568], [360, 568], [568, 320], [844, 390]];
/**
 * Scrolls the picture's panel to the middle of the screen: on a phone on its side (320px tall) the cards' tap leaves
 * it partly below the screen, and elementsFromPoint finds only what is on screen.
 * @param {import('@playwright/test').Page} page
 */
const inView = (page) => page.locator('[data-area="picture"]').evaluate((p) => p.scrollIntoView({ block: 'center' }));
/**
 * In the page: every two numbers of the tour in one row (their text boxes share more than half their height) whose
 * digits, as drawn (condensed), overlap or come closer than 0.5px (a turned phone left 13141516 run together, bug
 * hunt #11).
 * @returns {string[]}
 */
function tourOverlaps() {
  const boxes = [...document.querySelectorAll('[data-tour]')].map((d) => {
    const range = document.createRange();
    range.selectNodeContents(d);
    return { n: d.getAttribute('data-tour'), b: range.getBoundingClientRect() };
  });
  const out = [];
  for (const [i, { n, b }] of boxes.entries()) {
    for (const { n: m, b: c } of boxes.slice(i + 1)) {
      const y = Math.min(b.bottom, c.bottom) - Math.max(b.top, c.top);
      const x = Math.min(b.right, c.right) - Math.max(b.left, c.left);
      if (y > Math.min(b.height, c.height) / 2 && x > -0.5) out.push(`${n} and ${m}: ${x > 0 ? `${x.toFixed(1)}px over each other` : `${(-x).toFixed(1)}px apart`}`);
    }
  }
  return out;
}

/**
 * What is wrong with the tour's last number n, read in the page (design 7.2, 7.3): it is clearly bigger
 * than the number before it (1.1 times at least: the CSS grows it 1.3, pinned in tests/balance.test.js,
 * but line boxes are whole pixels, 22 against 17 here, so the ratio reads 1.28-1.29 and a pixel of
 * rounding in another engine moves it by 0.05) and at least 2px clear of it, it covers none of it, nothing covers it (it
 * stays inside its cube, where no ring goes, or is drawn over the ring), its cube is drawn no
 * wider than the one before it, +1px (an outline of the number in the cube's colour counts as
 * cube), and a cube after it in its row shows whole: the number and any outline end before that
 * cube, which is on top at both its ends (only the ring may touch its edge).
 * @param {number} n
 * @returns {string[]}
 */
function lastNumberProblems(n) {
  const out = [];
  const r = (x) => Math.round(x * 10) / 10;
  const text = (node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    return range.getBoundingClientRect();
  };
  const cubeAt = (node) => {
    const box = node.getBoundingClientRect();
    return document.elementsFromPoint(box.left + box.width / 2, box.top + box.height / 2).find((e) => e.matches('.bl-scene > .bl-pan .bl-cube'));
  };
  // The element on top at each end of a text, with `css` deciding what takes a point.
  const atEnds = (css, box, inset) => {
    const style = document.head.appendChild(document.createElement('style'));
    style.textContent = css;
    const found = [box.left + inset, box.right - inset].map((x) => document.elementFromPoint(x, box.top + box.height / 2));
    style.remove();
    return found;
  };
  // What is drawn takes a point; a hollow ring and a lifted cover's box do not.
  const drawn = '[data-game] .bl-lid { pointer-events: none !important; } [data-game] .bl-layer .bl-stack > :not(.bl-ring) { pointer-events: auto !important; }';
  for (const digit of document.querySelectorAll(`[data-tour="${n}"]`)) {
    const cube = cubeAt(digit);
    const pan = cube.closest('.bl-pan');
    const before = [...document.querySelectorAll(`[data-tour="${n - 1}"]`)].find((d) => cubeAt(d).closest('.bl-pan') === pan);
    const at = `${pan.getAttribute('data-pan')} pan`;
    const [t, p, c] = [text(digit), text(before), cube.getBoundingClientRect()];
    if (t.height / p.height < 1.1) out.push(`${at}: ${n} is ${r(t.height / p.height)} times ${n - 1}`);
    const apart = Math.max(t.left - p.right, p.left - t.right, t.top - p.bottom, p.top - t.bottom);
    if (apart < 2) out.push(`${at}: ${n} is ${r(apart)}px from ${n - 1}`);
    if (atEnds(drawn, p, 0.5).some((e) => !before.contains(e))) out.push(`${at}: ${n - 1} is covered`);
    const inCube = t.left >= c.left - 0.5 && t.right <= c.right + 0.5;
    if (!inCube && atEnds('[data-game] * { pointer-events: auto !important; }', t, 1).some((e) => !digit.contains(e))) out.push(`${at}: ${n} is covered`);
    // What is drawn counts as its cube: a box under the number (the white disc on a known cube),
    // and an outline in the cube's own colour around the number's text (each text-shadow's offset
    // plus its blur), which reads as cube where it passes the cube's edge.
    const own = digit.getBoundingClientRect();
    const style = getComputedStyle(digit);
    const painted = style.backgroundColor !== 'rgba(0, 0, 0, 0)' || style.boxShadow !== 'none';
    const fill = getComputedStyle(cube).backgroundColor;
    const shadows = [...style.textShadow.matchAll(/(rgba?\([^)]*\)) (-?[\d.]+)px (-?[\d.]+)px(?: ([\d.]+)px)?/g)];
    const reach = (list) => Math.max(0, ...list.map((m) => Math.abs(Number(m[2])) + Number(m[4] ?? 0)));
    const outline = reach(shadows.filter((m) => m[1] === fill));
    const boxes = [c, ...(painted ? [own] : []), ...(outline ? [{ left: t.left - outline, right: t.right + outline }] : [])];
    const wide = Math.max(...boxes.map((b) => b.right)) - Math.min(...boxes.map((b) => b.left));
    const next = cubeAt(before).getBoundingClientRect().width;
    if (wide > next + 1) out.push(`${at}: ${n}'s cube is drawn ${r(wide)}px wide, ${n - 1}'s ${r(next)}px`);
    // The next place in its row: in ? + 5, the 5's first cube, as wide as its twins (compare.size).
    const place = (node, key) => Number(node.style.getPropertyValue(key));
    const after = [...cube.parentElement.querySelectorAll('.bl-cube')].find((e) => place(e, '--r') === place(cube, '--r') && place(e, '--c') === place(cube, '--c') + 1);
    if (after) {
      const a = after.getBoundingClientRect();
      const end = t.right + reach(shadows);
      if (end > a.left) out.push(`${at}: ${n} ends ${r(end - a.left)}px into the cube after it, outline included`);
      if (atEnds(drawn, a, 0.5).some((e) => e !== after)) out.push(`${at}: the cube after ${n} is covered`);
    }
  }
  return out;
}

test('the tour\'s last number: bigger than the one before it, clear of it and of the cube after it, over the ring; its cube no bigger than the others, upright and sideways (design 5, 7.2, 7.3; bug hunt #4)', async ({ page }) => {
  test.setTimeout(180000);
  // The tour's end state, drawn at once.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Two digits: 6 + 11 = ? + 5, 12 + 3 = ? + 2 and ? + 2 = 14 count the unknown to 12 or 13, the
  // number before it beside it in one row and a cube of the known part after it; 16 + 3 = ? + 8
  // ends on 11 at the start of a row, a cube of 8 after it; 1 + ? = 13 counts to 12 at the end
  // of its pan; ? = 12 + 4 counts on to 16 at the start of a row. Known cubes (judging, a white
  // disc under each number): 6 + 4 = 10 and 1 + 8 = 9, on both pans.
  const rounds = [['both-sides-symbols', 2], ['both-sides-symbols', 34], ['both-sides-symbols', 30], ['missing-symbols-20', 1071],
    ['missing-symbols-20', 360], ['missing-symbols-20', 545], ['true-false', 2], ['true-false', 3]];
  for (const [width, height] of SCREENS) {
    await page.setViewportSize({ width, height });
    for (const [level, seed] of rounds) {
      const where = `${width}×${height} ${level} ${seed}`;
      const { round } = await devAt(page, level, seed);
      const last = round.model === 'cards' ? total(round.answer.right) : round.answer;
      for (const i of wrongOf(round)) {
        await card(page, i).click();
        await unlocked(page);
      }
      await expect(page.locator('[data-tour]').last(), where).toHaveText(String(last));
      await expect(page.locator('[data-hint] .bl-ring.is-tour'), where).not.toHaveCount(0);
      await inView(page);
      await expect.poll(() => page.evaluate(lastNumberProblems, last), where).toEqual([]);
    }
  }
});

/**
 * What is wrong with each two-digit tour number (design 4, 7.3), read in the page: at 14px at
 * least, its digits' box (as drawn) is inside its cube with 1px of the cube's colour each side
 * on the unknown (--sx leaves at least 2px, so this has a pixel to spare), and inside a known cube's
 * 2px edge with 0.5px of white; its ink, measured from its font, is inside the cube from top to
 * bottom too (the last one grows 1.3 in height): on a known cube within 0.5px of its 2px edge, where
 * the digits are clipped (clip-path), on the unknown 1px inside.
 * @returns {string[]}
 */
function twoDigitProblems() {
  const out = [];
  const ctx = document.createElement('canvas').getContext('2d');
  const r = (x) => Math.round(x * 10) / 10;
  for (const digit of document.querySelectorAll('[data-tour]')) {
    const text = digit.textContent;
    if (text.length < 2) continue;
    const box = digit.getBoundingClientRect();
    const cube = document.elementsFromPoint(box.left + box.width / 2, box.top + box.height / 2).find((e) => e.matches('.bl-scene > .bl-pan .bl-cube'));
    const known = cube.getAttribute('data-role') !== 'unknown';
    const c = cube.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(digit);
    const t = range.getBoundingClientRect();
    const s = getComputedStyle(digit.querySelector('*') ?? digit);
    if (parseFloat(s.fontSize) < 14) out.push(`${text}: ${s.fontSize}`);
    // Measured at 200px, where whole-pixel metrics are precise: k turns them into pixels as drawn
    // (the text box is the font's ascent and descent, scaled with the digits).
    ctx.font = `${s.fontWeight} 200px ${s.fontFamily}`;
    const m = ctx.measureText(text);
    const k = t.height / (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent);
    const base = t.top + k * m.fontBoundingBoxAscent;
    const [side, high] = known ? [2.5, 1.5] : [1, 1];
    const room = Math.min(t.left - c.left, c.right - t.right);
    if (room < side) out.push(`${text} on a${known ? ' known' : 'n unknown'} cube: ${r(room)}px from its side, not ${side}`);
    const top = Math.min(base - k * m.actualBoundingBoxAscent - c.top, c.bottom - base - k * m.actualBoundingBoxDescent);
    if (top < high) out.push(`${text} on a${known ? ' known' : 'n unknown'} cube: its ink ${r(top)}px from its top or bottom, not ${high}`);
  }
  return out;
}

test('two-digit tour numbers stay inside their cube, condensed, at 14px at least; the last grows in height only, on the unknown and on a known cube, upright and sideways (design 4, 5, 7.3; bug hunt #4)', async ({ page }) => {
  test.setTimeout(180000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // On the unknown: 6 + 11 = ? + 5 (10 to 12), 12 + 3 = ? + 2, ? + 2 = 14, 16 + 3 = ? + 8, 1 + ? = 13,
  // ? = 12 + 4 (13 to 16). On known cubes, 10 last: 6 + 4 = 10 and 3 + 7 = 10 (both pans), and same-as 3 + 7.
  const rounds = [['both-sides-symbols', 2], ['both-sides-symbols', 34], ['both-sides-symbols', 30], ['missing-symbols-20', 1071],
    ['missing-symbols-20', 360], ['missing-symbols-20', 545], ['true-false', 2], ['true-false', 4], ['same', 4]];
  for (const [width, height] of SCREENS) {
    await page.setViewportSize({ width, height });
    for (const [level, seed] of rounds) {
      const { round } = await devAt(page, level, seed);
      for (const i of wrongOf(round)) {
        await card(page, i).click();
        await unlocked(page);
      }
      const where = `${width}×${height} ${level} ${seed}`;
      await expect(page.locator('[data-tour]').last(), where).toHaveText(/^\d\d$/);
      await inView(page);
      expect(await page.evaluate(twoDigitProblems), where).toEqual([]);
    }
  }
});

/** How far inside a cube's edge the ring overlap test looks (see ringOverlaps). */
const ringInset = (browserName) => (browserName === 'webkit' ? 2 : 0.75);

/**
 * Where a ring paints over a cube or a cover (design 6.8, 7.1), read in the page: along each shown
 * cube and cover, 0.75px inside its edge, every point where it is drawn (hit testing follows
 * rounded corners and clip-path) must have no ring above it, unless the thing is inside that ring
 * piece's own box. A ring over two rows is a piece per row: neither piece may cover a cube of the
 * other's row, of its own group or another (a covered cube would look smaller and lighter).
 * @param {number} [inset] how far inside the edge: 0.75 in Chromium; WebKit places the ring's links and edges
 *   a pixel or so differently (CI: a link over a cube's edge), so there the cube's inner 2px are tested
 * @returns {string[]}
 */
function ringOverlaps(inset = 0.75) {
  const out = [];
  const style = document.head.appendChild(document.createElement('style'));
  style.textContent = '[data-game] :is(.bl-ring, .bl-ring-link) { pointer-events: auto !important; } [data-game] .bl-scene > .bl-pan .bl-cube, [data-game] .bl-scene > .bl-pan .cover { pointer-events: auto !important; }';
  const inside = (b, x, y) => x > b.left && x < b.right && y > b.top && y < b.bottom;
  const things = [...document.querySelectorAll('.bl-scene > .bl-pan > .bl-stack > .bl-cube, .bl-scene > .bl-pan > .bl-stack > .bl-lid:not(.bl-bridge) > .cover:not(.is-lifted)')]
    .filter((n) => getComputedStyle(n).opacity !== '0');
  for (const thing of things) {
    const b = thing.getBoundingClientRect();
    const [cx, cy] = [b.left + b.width / 2, b.top + b.height / 2];
    const points = [];
    for (let t = 0; t <= 1; t += 1 / 16) {
      const [x, y] = [b.left + inset + t * (b.width - 2 * inset), b.top + inset + t * (b.height - 2 * inset)];
      points.push([x, b.top + inset], [x, b.bottom - inset], [b.left + inset, y], [b.right - inset, y]);
    }
    for (const [x, y] of points) {
      const hits = document.elementsFromPoint(x, y);
      const at = hits.indexOf(thing);
      if (at < 0) continue;
      for (const ring of hits.slice(0, at).filter((h) => h.matches('.bl-ring, .bl-ring-link'))) {
        if (inside(ring.getBoundingClientRect(), cx, cy)) continue;
        const pan = thing.closest('.bl-pan').getAttribute('data-pan');
        out.push(`${pan} pan: a ${ring.className.replace('bl-ring ', '')} ring over ${thing.className} ${thing.getAttribute('data-role') ?? ''}`.trim());
      }
    }
  }
  style.remove();
  return [...new Set(out)];
}

test('a ring never paints over a cube or cover next to it, of another group or of its own next row: flash, jumps, hints and tours (design 6.8)', async ({ page, browserName }) => {
  test.setTimeout(120000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // ? + 3 = 10: the 3 under the fixed cover (flash), the 7 counted next to the 3 (tour); ? = 6 + 4 with
  // 9: the missed cube next to the counted ones (jumps); 10 + 3 = 11 + ?: the hint's rings next to
  // the other group, then the tour. Rings over two rows of one group: the tours of same, missing-left
  // and missing-symbols-20, and flashes of a whole and of a part of 6 to 9.
  const states = [['missing-left', 4, ['given.part']], ['missing-left', 4, ['given.part', 'given.whole', 'op.other']],
    ['missing-reversed', 148, ['count.start-included']], ['relational', 1, ['equal.copy', 'equal.compensate-wrong']],
    ['relational', 1, ['equal.copy', 'equal.compensate-wrong', 'equal.add-to-equal']],
    ['same', 1, 'tour'], ['missing-left', 1, 'tour'], ['missing-symbols-20', 360, 'tour'],
    ['missing-right', 3, ['given.whole']], ['missing-symbols', 235, ['given.part']]];
  for (const width of [320, 360]) {
    await page.setViewportSize({ width, height: 568 });
    for (const [level, seed, rules] of states) {
      const { round } = await devAt(page, level, seed);
      for (const i of rules === 'tour' ? wrongOf(round) : rules.map((rule) => round.choices.findIndex((c) => c.rule === rule))) {
        await card(page, i).click();
        await unlocked(page);
      }
      const where = `${width}px ${level} ${seed} ${[rules].flat().join(', ')}`;
      await expect(page.locator('.bl-scene .bl-ring'), where).not.toHaveCount(0);
      expect(await page.evaluate(ringOverlaps, ringInset(browserName)), where).toEqual([]);
    }
  }
});

/**
 * Whether a layer's ring pieces in a pan read as one outline, read from a screenshot: from a point
 * on the first piece's line, the ring's colour reaches a point on every other piece's line.
 * @param {import('@playwright/test').Page} page
 * @param {string} layer '[data-display]' or '[data-hint]'
 * @param {'left' | 'right'} side
 * @param {number[]} rgb the ring's colour
 * @returns {Promise<string>} '' when joined
 */
async function ringJoined(page, layer, side, rgb) {
  const sel = `${layer} .bl-pan[data-pan="${side}"] :is(.bl-ring, .bl-ring-link)`;
  const boxes = await page.locator(sel).evaluateAll((els) => els.map((e) => ({ link: e.classList.contains('bl-ring-link'), ...e.getBoundingClientRect().toJSON() })));
  const pieces = boxes.filter((b) => !b.link);
  if (pieces.length < 2) return `${pieces.length} piece`;
  const clip = { x: Math.min(...boxes.map((b) => b.left)) - 2, y: Math.min(...boxes.map((b) => b.top)) - 2 };
  Object.assign(clip, { width: Math.max(...boxes.map((b) => b.right)) + 2 - clip.x, height: Math.max(...boxes.map((b) => b.bottom)) + 2 - clip.y });
  const png = (await page.screenshot({ clip })).toString('base64');
  return page.evaluate(async ({ data, clip, pieces, rgb }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const [w, h] = [img.width, img.height];
    const ctx = Object.assign(document.createElement('canvas'), { width: w, height: h }).getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, w, h).data;
    const k = w / clip.width;
    const ring = (x, y) => x >= 0 && y >= 0 && x < w && y < h && Math.abs(d[(y * w + x) * 4] - rgb[0]) + Math.abs(d[(y * w + x) * 4 + 1] - rgb[1]) + Math.abs(d[(y * w + x) * 4 + 2] - rgb[2]) < 90;
    // A point on each piece's line: the middle of a side, 2.5px in from its outer edge.
    const seed = (b) => [[b.left + b.width / 2, b.top + 2.5], [b.left + 2.5, b.top + b.height / 2], [b.right - 2.5, b.top + b.height / 2], [b.left + b.width / 2, b.bottom - 2.5]]
      .map(([x, y]) => [Math.round((x - clip.x) * k), Math.round((y - clip.y) * k)]).find(([x, y]) => ring(x, y));
    const seeds = pieces.map(seed);
    if (seeds.some((s) => !s)) return 'a piece without its line';
    const seen = new Uint8Array(w * h);
    const queue = [seeds[0]];
    seen[seeds[0][1] * w + seeds[0][0]] = 1;
    while (queue.length) {
      const [x, y] = queue.pop();
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (ring(nx, ny) && !seen[ny * w + nx]) {
          seen[ny * w + nx] = 1;
          queue.push([nx, ny]);
        }
      }
    }
    const apart = seeds.filter(([x, y]) => !seen[y * w + x]).length;
    return apart ? `${apart} of ${pieces.length} pieces apart` : '';
  }, { data: png, clip, pieces, rgb });
}

test('a ring round a group whose rows share no column is one outline: the hint of 8 + 4 = 9 + ?, the tour of 2 + ? = 6 (design 6.8, 7.2)', async ({ page, browserName }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const [width, height] of [[320, 568], [390, 844]]) {
    await page.setViewportSize({ width, height });
    // The hint moves a cube: 9 + 3 on the left, the 3 on places 9 to 11 (one, then two on the next
    // row); the cover's outline on the same places on the right.
    let { round } = await devAt(page, 'relational', 15);
    expect(round.equation).toEqual({ left: [8, '+', 4], right: [9, '+', '?'] });
    for (const i of wrongOf(round).slice(0, 2)) {
      await card(page, i).click();
      await unlocked(page);
    }
    await expect(page.locator('[data-hint]')).toHaveCount(1);
    expect(await ringJoined(page, '[data-hint]', 'left', [158, 108, 0]), `${width}px 8 + 4 = 9 + ?, the hint's ring round the 3`).toBe('');
    expect(await ringJoined(page, '[data-hint]', 'right', [214, 51, 108]), `${width}px 8 + 4 = 9 + ?, the hint's ring round the outline`).toBe('');
    expect(await page.evaluate(ringOverlaps, ringInset(browserName)), `${width}px 8 + 4 = 9 + ?, the hint`).toEqual([]);
    ({ round } = await devAt(page, 'missing-right', 2));
    expect(round.equation).toEqual({ left: [2, '+', '?'], right: [6] });
    for (const i of wrongOf(round)) {
      await card(page, i).click();
      await unlocked(page);
    }
    await expect(page.locator('[data-tour]').last()).toHaveText('4');
    expect(await ringJoined(page, '[data-hint]', 'left', [214, 51, 108]), `${width}px 2 + ? = 6, the tour`).toBe('');
    expect(await page.evaluate(ringOverlaps, ringInset(browserName)), `${width}px 2 + ? = 6, the tour`).toEqual([]);
  }
});

/**
 * How close each ring in a pan comes to the inside of its bowl's 3px rim, where the bowl is beside
 * it (design 3, 7.1: magenta, or a ring, and --frame keep a 3px --halo between them).
 * @returns {string[]}
 */
function ringsOffBowl() {
  const out = [];
  for (const ring of document.querySelectorAll('.bl-scene .bl-ring')) {
    const side = ring.closest('.bl-pan').getAttribute('data-pan');
    const b = document.querySelector(`.bl-scene > .bl-pan[data-pan="${side}"] .bl-bowl`).getBoundingClientRect();
    const r = ring.getBoundingClientRect();
    if (r.bottom <= b.top) continue;
    const gaps = { bottom: b.bottom - 3 - r.bottom, left: r.left - (b.left + 3), right: b.right - 3 - r.right };
    for (const [edge, gap] of Object.entries(gaps)) {
      if (gap < 2.5) out.push(`${side} pan: a ${ring.className.replace('bl-ring ', '')} ring ${Math.round(gap * 10) / 10}px off the bowl's ${edge} rim`);
    }
  }
  return out;
}

test('a ring round the bottom row keeps a 3px --halo off the bowl\'s rim, and a tilted pan stays clear of the pole (design 3, 6.8, 7.1)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // 3 + 5 = ?: the tour's ring over the first row, kept when solved; flashes of a bottom row; a tilted
  // display (1 + 8 = ? + 4 with 1).
  for (const [width, height] of [[320, 568], [360, 640], [390, 844]]) {
    await page.setViewportSize({ width, height });
    for (const [level, seed, rules] of [['same', 1, 'tour'], ['same', 4, 1], ['missing-right', 1, 1]]) {
      const { round } = await devAt(page, level, seed);
      const wrong = wrongOf(round);
      for (const i of rules === 'tour' ? wrong : wrong.slice(0, rules)) {
        await card(page, i).click();
        await unlocked(page);
      }
      const where = `${width}px ${level} ${seed}`;
      await expect(page.locator('.bl-scene .bl-ring').first(), where).toBeVisible();
      expect(await page.evaluate(ringsOffBowl), where).toEqual([]);
      if (rules === 'tour') {
        await card(page, round.choices.findIndex((c) => c.rule === null)).click();
        await expect(page.locator('[data-next]')).toBeVisible();
        expect(await page.evaluate(ringsOffBowl), `${where}, solved`).toEqual([]);
      }
    }
    const { round } = await devAt(page, 'both-sides-symbols', 3);
    await page.locator('[data-show-picture]').click();
    await card(page, round.choices.findIndex((c) => c.rule === 'equal.copy')).click();
    await unlocked(page);
    await expect(page.locator('.bl-scene')).not.toHaveAttribute('data-tilt', 'level');
    const gaps = await page.evaluate(() => {
      const pole = document.querySelector('.bl-pole').getBoundingClientRect();
      const [l, r] = [...document.querySelectorAll('.bl-scene > .bl-pan .bl-bowl')].map((b) => b.getBoundingClientRect());
      return [pole.left - l.right, r.left - pole.right];
    });
    for (const gap of gaps) expect(gap, `${width}px: a tilted bowl and the pole`).toBeGreaterThanOrEqual(2);
  }
});

/**
 * What is wrong with each ring with 0 on a pan (design 7.1): its 0's ink keeps 2.5px or more of
 * white inside the ring's line on every side, and the ring with its halo stays off the cubes beside
 * and below it and inside the bowl's rim.
 * @returns {string[]}
 */
function zeroRingProblems() {
  const out = [];
  const ctx = document.createElement('canvas').getContext('2d');
  for (const z of document.querySelectorAll('.bl-scene .bl-zero')) {
    const b = z.getBoundingClientRect();
    const s = getComputedStyle(z);
    const range = document.createRange();
    range.selectNodeContents(z);
    const t = range.getBoundingClientRect();
    ctx.font = `${s.fontWeight} 200px ${s.fontFamily}`;
    const m = ctx.measureText('0');
    const [kx, ky] = [t.width / m.width, t.height / (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)];
    const base = t.top + ky * m.fontBoundingBoxAscent;
    const line = parseFloat(s.borderTopWidth);
    const room = Math.min(base - ky * m.actualBoundingBoxAscent - b.top, b.bottom - base - ky * m.actualBoundingBoxDescent,
      t.left - kx * m.actualBoundingBoxLeft - b.left, b.right - t.left - kx * m.actualBoundingBoxRight) - line;
    if (room < 2.5) out.push(`${z.className}: ${Math.round(room * 10) / 10}px between the 0 and its ring`);
    // It stands on an empty place as a cube would: its hole is white, and the pan's string stops at its edge.
    if (s.backgroundColor !== 'rgb(255, 255, 255)') out.push(`${z.className}: its hole is ${s.backgroundColor}, not white`);
    const halo = Math.max(0, ...s.boxShadow.split(/,(?![^(]*\))/).filter((e) => e && e !== 'none' && !e.includes('inset'))
      .map((e) => parseFloat(e.replace(/rgba?\([^)]*\)/, '').trim().split(/\s+/)[3]) || 0));
    const pan = z.closest('.bl-pan').getAttribute('data-pan');
    const reach = { left: b.left - halo, right: b.right + halo, top: b.top - halo, bottom: b.bottom + halo };
    for (const cube of document.querySelectorAll(`.bl-scene > .bl-pan[data-pan="${pan}"] > .bl-stack > .bl-cube`)) {
      const c = cube.getBoundingClientRect();
      const over = Math.min(reach.right - c.left, c.right - reach.left, reach.bottom - c.top, c.bottom - reach.top);
      if (over > 0.25) out.push(`${z.className}: ${Math.round(over * 10) / 10}px over a cube`);
    }
    const bowl = document.querySelector(`.bl-scene > .bl-pan[data-pan="${pan}"] .bl-bowl`).getBoundingClientRect();
    const rim = Math.min(reach.left - bowl.left, bowl.right - reach.right, bowl.bottom - reach.bottom) - 3;
    if (rim < -0.25) out.push(`${z.className}: ${Math.round(-rim * 10) / 10}px over the bowl's rim`);
  }
  return out;
}

test('a ring with 0 on a pan is wider than its place: its 0 has room inside it, its hole is white over the pan\'s string, and it keeps off the cubes and the rim (design 7.1)', async ({ page }) => {
  test.setTimeout(90000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // 8 + ? = 8 (the place in the second row), 2 + ? = 2 and 4 + ? = 4 (the bottom row, at its end),
  // 5 + ? = 5 and 9 + ? = 9 (where the pan's string passes the place).
  for (const [width, height] of [[320, 568], [360, 568], [390, 844]]) {
    await page.setViewportSize({ width, height });
    for (const seed of [3, 7, 19, 65, 53]) {
      const { round } = await devAt(page, 'missing-right', seed);
      expect(round.answer, `seed ${seed}`).toBe(0);
      const where = `${width}px ${JSON.stringify(round.equation.left)}`;
      const plate = round.choices.findIndex((c) => c.rule === 'zero.counted-as-one');
      await card(page, plate).click();
      await unlocked(page);
      await expect(page.locator('.bl-zero.is-wrong')).toBeVisible();
      expect(await page.evaluate(zeroRingProblems), `${where}, card 1`).toEqual([]);
      for (const i of wrongOf(round).filter((i) => i !== plate)) {
        await card(page, i).click();
        await unlocked(page);
      }
      await expect(page.locator('.bl-zero.is-tour')).toBeVisible();
      expect(await page.evaluate(zeroRingProblems), `${where}, the tour`).toEqual([]);
      await card(page, round.choices.findIndex((c) => c.rule === null)).click();
      await expect(page.locator('[data-next]')).toBeVisible();
      expect(await page.evaluate(zeroRingProblems), `${where}, solved`).toEqual([]);
    }
  }
});

test('small part cubes stay yellow: where an overflow or balance display needs 6-8 rows, a part\'s edge thins with the cube (design 3)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // 13 + ? = 14 with 27 (eight rows), 1 + 15 = ? + 8 with 24, 7 + 13 = ? + 5 with 25.
  for (const width of [320, 360]) {
    await page.setViewportSize({ width, height: 568 });
    for (const [level, seed, value] of [['missing-symbols-20', 4471, 27], ['both-sides-symbols', 1, 24], ['both-sides-symbols', 4, 25]]) {
      const { round } = await devAt(page, level, seed);
      await page.locator('[data-show-picture]').click();
      await card(page, round.choices.findIndex((c) => c.value === value)).click();
      await unlocked(page);
      const shares = await page.locator('.bl-scene > .bl-pan > .bl-stack').evaluateAll((stacks) => stacks.flatMap((st) => [...st.querySelectorAll('.bl-cube[data-role="part"]')].map((p) => {
        const b = p.getBoundingClientRect();
        const inset = getComputedStyle(p).boxShadow.split(/,(?![^(]*\))/).find((e) => e.includes('inset'));
        const edge = inset ? parseFloat(inset.replace(/rgba?\([^)]*\)/, '').trim().split(/\s+/)[3]) : 0;
        return { what: `${b.width.toFixed(1)}px, its edge ${edge.toFixed(2)}px`, share: Math.max(0, b.width - 2 * edge) ** 2 / b.width ** 2 };
      })));
      expect(shares.length).toBeGreaterThan(0);
      for (const { what, share } of shares) expect(share, `${width}px ${level} ${seed} with ${value}: a part cube ${what}`).toBeGreaterThanOrEqual(0.4);
    }
  }
});

test('a display draws within the rows it gives the scene, 8 at most (design 6.8): the largest card of each display on each level', async ({ page }) => {
  test.setTimeout(180000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Per level and display, the seed of 1-200 with the largest wrong card (a judging card: its larger
  // side), from the rounds alone; the rows are read from what the page drew (each cube's, ghost's
  // and mark's --r), not from displayRows.
  const size = (v) => (typeof v === 'number' ? v : Math.max(total(v.left), total(v.right)));
  /** @type {Map<string, [string, number, any]>} */
  const largest = new Map();
  for (const level of balance.levels.filter((l) => l.model !== 'set')) {
    for (let seed = 1; seed <= 200; seed++) {
      for (const { value, rule } of balance.makeRound(level, rng(seed)).choices) {
        const key = `${level.id} ${rule && RULES[rule].display}`;
        if (rule && !(largest.has(key) && size(largest.get(key)[2]) >= size(value))) largest.set(key, [level.id, seed, value]);
      }
    }
  }
  expect(largest.size).toBeGreaterThan(20);
  for (const [key, [level, seed, value]] of largest) {
    const { round } = await devAt(page, level, seed);
    await card(page, round.choices.findIndex((c) => JSON.stringify(c.value) === JSON.stringify(value))).click();
    await unlocked(page);
    const { rows, drawn } = await page.locator('.bl-scene').evaluate((scene) => ({
      rows: Number(scene.style.getPropertyValue('--rows')),
      drawn: Math.max(...[...scene.querySelectorAll('.bl-cube, .bl-mark')].map((n) => Number(n.style.getPropertyValue('--r')) + 1)),
    }));
    const where = `${key}, seed ${seed}, ${JSON.stringify(value)}`;
    expect(drawn, where).toBeLessThanOrEqual(rows);
    expect(rows, where).toBeLessThanOrEqual(8);
  }
});

/**
 * Where the hint's dashed outline of a missing cube leaves the cover's dome (design 6.6, 7.3): the
 * outer edge of each dash, as drawn (scaled, with its corner radii), stays half a pixel or more
 * inside the dome as app.css draws it (top corners half the height across and 80% down, bottom
 * corners a fifth), so no shoulder of the dome is bitten.
 * @returns {string[]}
 */
function dashesOutOfDome() {
  const out = [];
  const domes = [...document.querySelectorAll('.bl-scene > .bl-pan .bl-lid:not(.bl-bridge) > .cover')].map((c) => c.getBoundingClientRect());
  /** @type {(d: DOMRect, x: number, y: number, m: number) => boolean} inside the dome shrunk by m */
  const inDome = (d, x, y, m) => {
    const [l, t, r, b] = [d.left + m, d.top + m, d.right - m, d.bottom - m];
    if (x < l || x > r || y < t || y > b) return false;
    const top = y < (t + b) / 2;
    const [rx, ry] = top ? [Math.min(d.width, d.height) / 2 - m, d.height * 0.8 - m] : [Math.min(d.width / 5, d.height / 5) - m, d.height / 5 - m];
    const [cx, cy] = [x < (l + r) / 2 ? l + rx : r - rx, top ? t + ry : b - ry];
    const corner = (x < (l + r) / 2 ? x < cx : x > cx) && (top ? y < cy : y > cy);
    return !corner || ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  };
  for (const dash of document.querySelectorAll('[data-hint] .bl-dash')) {
    const b = dash.getBoundingClientRect();
    const dome = domes.find((d) => b.left + b.width / 2 > d.left && b.left + b.width / 2 < d.right && b.top + b.height / 2 > d.top && b.top + b.height / 2 < d.bottom);
    if (!dome) continue;
    const s = getComputedStyle(dash);
    const k = b.width / /** @type {HTMLElement} */ (dash).offsetWidth;
    const radius = (v) => {
      const [h, w = h] = v.split(' ');
      const len = (x) => (x.endsWith('%') ? (parseFloat(x) / 100) * /** @type {HTMLElement} */ (dash).offsetWidth : parseFloat(x)) * k;
      return [len(h), len(w)];
    };
    const corners = [[s.borderTopLeftRadius, -1, -1], [s.borderTopRightRadius, 1, -1], [s.borderBottomRightRadius, 1, 1], [s.borderBottomLeftRadius, -1, 1]];
    let bad = 0;
    for (const [v, sx, sy] of corners) {
      const [rx, ry] = radius(v);
      const [cx, cy] = [sx < 0 ? b.left + rx : b.right - rx, sy < 0 ? b.top + ry : b.bottom - ry];
      for (let a = 0; a <= 90; a += 5) {
        const t = (a * Math.PI) / 180;
        if (!inDome(dome, cx + sx * rx * Math.cos(t), cy + sy * ry * Math.sin(t), 0.5)) bad += 1;
      }
    }
    if (bad) out.push(`a dash at ${Math.round(b.left)},${Math.round(b.top)}: ${bad} points of its edge out of the dome`);
  }
  return out;
}

test('the hint\'s dashed outline of the missing cubes stays inside the cover\'s dome, its ends rounded as the dome\'s shoulders (design 6.6, 7.3)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // 6 + ? = 7 and 13 + ? = 14: a piece one place wide; 2 + ? = 6: a piece of one and a piece of three.
  for (const [width, height] of [[320, 568], [360, 640], [390, 844]]) {
    await page.setViewportSize({ width, height });
    for (const [level, seed] of [['missing-symbols', 235], ['missing-symbols-20', 4471], ['missing-right', 2]]) {
      const { round } = await devAt(page, level, seed);
      if (round.look === 'symbols') await page.locator('[data-show-picture]').click();
      for (const i of wrongOf(round).slice(0, 2)) {
        await card(page, i).click();
        await unlocked(page);
      }
      await expect(page.locator('[data-hint] .bl-dash').first()).toBeVisible();
      expect(await page.evaluate(dashesOutOfDome), `${width}px ${level} ${seed}`).toEqual([]);
    }
  }
});

test('ghost cubes show their dashed edge on all four sides alike, also small (design 7.1)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // 24 ghosts of 1 + 8 + 4 + 9 (cube about 11px at 320) and 27 of op.other (about 9.5px), and full size.
  for (const [width, height] of [[320, 568], [390, 844]]) {
    await page.setViewportSize({ width, height });
    for (const [level, seed, rule] of [['both-sides-symbols', 1, 'equal.add-all'], ['missing-symbols-20', 4471, 'op.other'], ['missing-right', 1, 'op.other']]) {
      const { round } = await devAt(page, level, seed);
      if (round.look === 'symbols') await page.locator('[data-show-picture]').click();
      await card(page, round.choices.findIndex((c) => c.rule === rule)).click();
      await unlocked(page);
      const boxes = await page.locator('[data-display] .bl-ghost').evaluateAll((els) => els.map((g) => g.getBoundingClientRect().toJSON()));
      expect(boxes.length).toBeGreaterThan(0);
      const png = (await page.screenshot()).toString('base64');
      // The middle of each side, on the 2px edge: the edge's colour, --role-added-edge (11, 111, 166).
      const open = await page.evaluate(async ({ data, boxes }) => {
        const img = new Image();
        img.src = `data:image/png;base64,${data}`;
        await img.decode();
        const ctx = Object.assign(document.createElement('canvas'), { width: img.width, height: img.height }).getContext('2d');
        ctx.drawImage(img, 0, 0);
        const k = img.width / innerWidth;
        const edge = (x, y) => {
          const p = ctx.getImageData(Math.floor(x * k), Math.floor(y * k), 1, 1).data;
          // The ghost's own fill (154, 213, 244) is 323 away and white 477: 150 is about halfway to the nearer, and a
          // dash's edge pixel, half covered, measured 79 from the edge's colour at 360px (90 was too close).
          return Math.abs(p[0] - 11) + Math.abs(p[1] - 111) + Math.abs(p[2] - 166) < 150;
        };
        return boxes.flatMap((b) => {
          const [cx, cy] = [b.x + b.width / 2, b.y + b.height / 2];
          const sides = { top: [cx, b.y + 1], bottom: [cx, b.y + b.height - 1], left: [b.x + 1, cy], right: [b.x + b.width - 1, cy] };
          return Object.entries(sides).filter(([, [x, y]]) => !edge(x, y)).map(([side]) => `a ${b.width.toFixed(1)}px ghost at ${Math.round(b.x)},${Math.round(b.y)}: no dash on its ${side}`);
        });
      }, { data: png, boxes });
      expect(open, `${width}px ${level} ${seed} ${rule}`).toEqual([]);
    }
  }
});

/**
 * What is wrong with the jumps' arcs, read in the page (design 7.1: dashed arcs show the hops): each
 * arc is drawn over everything at its ends and its top (its legs on two marks' tops, its top in a
 * row above), and its top stays under the ink of the digits of the marks above it.
 * @returns {string[]}
 */
function arcProblems() {
  const out = [];
  const style = document.head.appendChild(document.createElement('style'));
  style.textContent = '[data-game] .bl-scene * { pointer-events: auto !important; }';
  const ctx = document.createElement('canvas').getContext('2d');
  /** The bottom of a mark's digit ink, from its font measured at 200px. */
  const inkBottom = (mark) => {
    const range = document.createRange();
    range.selectNodeContents(mark);
    const t = range.getBoundingClientRect();
    const s = getComputedStyle(mark);
    ctx.font = `${s.fontWeight} 200px ${s.fontFamily}`;
    const m = ctx.measureText(mark.textContent);
    const k = t.height / (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent);
    return { left: t.left, right: t.right, bottom: t.top + k * (m.fontBoundingBoxAscent + m.actualBoundingBoxDescent) };
  };
  const marks = [...document.querySelectorAll('[data-display="jumps"] .bl-mark')];
  for (const arc of document.querySelectorAll('[data-display="jumps"] .bl-arc')) {
    const b = arc.getBoundingClientRect();
    for (const [what, x, y] of [['start', b.left + 2, b.bottom - 1], ['end', b.right - 2, b.bottom - 1], ['top', b.left + b.width / 2, b.top + 1]]) {
      const hit = document.elementFromPoint(x, y);
      if (hit !== arc) out.push(`an arc at ${Math.round(b.left)},${Math.round(b.top)}: its ${what} under ${hit?.className}`);
    }
    for (const mark of marks) {
      const ink = inkBottom(mark);
      if (ink.right > b.left && ink.left < b.right && ink.bottom < b.bottom - 1 && ink.bottom > b.top) {
        out.push(`an arc at ${Math.round(b.left)},${Math.round(b.top)} over the ${mark.textContent} above it`);
      }
    }
  }
  style.remove();
  return out;
}

test('the jumps: each arc hops from one mark\'s top to the next, drawn over the marks, under the digits of a row above (design 7.1)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // ? = 6 + 4 (one row), ? = 4 + 6 (an arc under the missed cube's ring), ? = 2 + 15 (three rows).
  for (const width of [320, 360]) {
    await page.setViewportSize({ width, height: 568 });
    for (const [level, seed] of [['missing-reversed', 148], ['missing-reversed', 175], ['missing-symbols-20', 2428]]) {
      const { round } = await devAt(page, level, seed);
      await card(page, round.choices.findIndex((c) => c.rule === 'count.start-included')).click();
      await unlocked(page);
      await expect(page.locator('[data-display="jumps"] .bl-arc').first()).toBeVisible();
      expect(await page.evaluate(arcProblems), `${width}px ${level} ${seed}`).toEqual([]);
    }
  }
});

/**
 * Where a ring of a jumps layer paints over a mark next to it (a ring round a mark's own place is its
 * ring), read in the page as ringOverlaps reads cubes.
 * @returns {string[]}
 */
function ringOverMarks() {
  const out = [];
  const style = document.head.appendChild(document.createElement('style'));
  style.textContent = '[data-game] [data-display] :is(.bl-ring, .bl-ring-link, .bl-mark) { pointer-events: auto !important; }';
  const inside = (b, x, y) => x > b.left && x < b.right && y > b.top && y < b.bottom;
  for (const mark of document.querySelectorAll('[data-display="jumps"] .bl-mark')) {
    const b = mark.getBoundingClientRect();
    const [cx, cy] = [b.left + b.width / 2, b.top + b.height / 2];
    for (let t = 0; t <= 1; t += 1 / 16) {
      const [x, y] = [b.left + 1 + t * (b.width - 2), b.top + 1 + t * (b.height - 2)];
      for (const [px, py] of [[x, b.top + 1], [x, b.bottom - 1], [b.left + 1, y], [b.right - 1, y]]) {
        const hits = document.elementsFromPoint(px, py);
        const at = hits.indexOf(mark);
        if (at < 0) continue;
        for (const ring of hits.slice(0, at).filter((h) => h.matches('.bl-ring, .bl-ring-link'))) {
          if (!inside(ring.getBoundingClientRect(), cx, cy)) out.push(`a ring over the mark ${mark.textContent}`);
        }
      }
    }
  }
  style.remove();
  return [...new Set(out)];
}

test('the jumps on a missing part: 1 on the known part\'s last cube, then over the unknown\'s places to the whole; that cube blinks and keeps a ring (design 7.3, decisions.md 2026-10-31)', async ({ page, browserName }) => {
  test.setTimeout(120000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Level 6, where op.other and equal.add-all need more than 8 rows: 13 + ? = 19 (card 7), ? + 13 = 18 (6),
  // 19 = 15 + ? (5, the right pan) and ? + 19 = 20 (2: the start and one place).
  for (const [width, height] of [[320, 568], [390, 844]]) {
    await page.setViewportSize({ width, height });
    for (const seed of [10, 31, 45, 1]) {
      const { round } = await devAt(page, 'missing-symbols-20', seed);
      const i = round.choices.findIndex((c) => c.rule === 'count.start-included');
      const where = `${width}px ${round.equation.left.join(' ')} = ${round.equation.right.join(' ')} (seed ${seed})`;
      expect(i, where).toBeGreaterThanOrEqual(0);
      const { value } = round.choices[i];
      expect(value, where).toBe(round.answer + 1);
      await card(page, i).click();
      await unlocked(page);
      const side = round.helpPicture.find((g) => g.role === 'unknown').side;
      const marks = page.locator(`[data-display="jumps"] .bl-pan[data-pan="${side}"] .bl-mark`);
      await expect(marks, where).toHaveText(Array.from({ length: value }, (_, j) => String(j + 1)));
      await expect(page.locator('[data-display="jumps"] .bl-mark'), `${where}: on the unknown's pan only`).toHaveCount(value);
      await expect(page.locator(`.bl-scene > .bl-pan[data-pan="${side}"] .bl-lid > .cover:not(.is-lifted)`), `${where}: the cover lifted`).toHaveCount(0);
      const at = await page.evaluate((side) => {
        const centre = (n) => { const b = n.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; };
        const stack = document.querySelector(`.bl-scene > .bl-pan[data-pan="${side}"] > .bl-stack`);
        const part = [...stack.querySelectorAll('.bl-cube[data-role="part"]')].at(-1);
        const places = [part, ...stack.querySelectorAll('.bl-cube[data-role="unknown"]')].map(centre);
        const marks = [...document.querySelectorAll(`[data-display="jumps"] .bl-pan[data-pan="${side}"] .bl-mark`)].map(centre);
        const ring = [...document.querySelectorAll(`[data-display="jumps"] .bl-pan[data-pan="${side}"] .bl-ring.is-wrong`)].map((r) => r.getBoundingClientRect().toJSON());
        return { off: marks.map(([x, y], j) => Math.hypot(x - places[j][0], y - places[j][1])), flash: part.classList.contains('is-flash'), ring, start: part.getBoundingClientRect().toJSON(),
          arcs: document.querySelectorAll('[data-display="jumps"] .bl-arc').length };
      }, side);
      // Each mark on its place: the first on the known part's last cube, then one on each of the unknown's places.
      expect(Math.max(...at.off), `${where}: a mark off its place, px`).toBeLessThan(1);
      expect(at.flash, `${where}: the cube counted as 1 blinks`).toBe(true);
      expect(at.ring.length, `${where}: one ring`).toBe(1);
      const [r, c] = [at.ring[0], at.start];
      expect(r.left < c.left && r.right > c.right && r.top < c.top && r.bottom > c.bottom, `${where}: the ring round that cube`).toBe(true);
      expect(at.arcs, `${where}: arcs`).toBeGreaterThan(0);
      expect(await page.evaluate(arcProblems), where).toEqual([]);
      expect(await page.evaluate(ringOverlaps, ringInset(browserName)), where).toEqual([]);
      expect(await page.evaluate(ringOverMarks), where).toEqual([]);
      await expect(page.locator('.bl-scene'), `${where}: the beam stays`).toHaveAttribute('data-tilt', 'level');
    }
  }
});

// A jump's marks (design 7.1) are 14px digits in a ring of the cube's size, 17.7-18.5px at 320 and 360px on a short
// screen: a number of two digits (12 to 15) was 19.1px wide there, past the 13.7-14.5px inside the ring's 2px edge, and
// 0.5px off centre. Its digits are condensed across (--sx) as the tour's are on a known cube (design 7.3). Measured in
// Chromium (Pixel 7), the digits' box is now 12.0px wide and 0px off centre in those rings (16.0px in the 22px ring of
// 360px, 19.0px in the 25.1px ring of 390px, where the digits already fitted). The test asks for the hole, which leaves
// 1.7px or more, and 1px of centring, which leaves 1px.
test('the jumps\' marks on small cubes: at least 15px, their digits inside the ring, the arcs over them (design 7.1; hunt 2 #14)', async ({ page, browserName }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // ? + 19 = 20 (level 6, seed 1): the rest rows hold the dome's, 6 rows, so a cube is 12.7px at 320x568; the marks
  // keep 15px, a cube and most of the gap, so the 14px digits stay off their ring.
  for (const [width, height] of [[320, 568], [568, 320], [844, 390]]) {
    await page.setViewportSize({ width, height });
    const { round } = await devAt(page, 'missing-symbols-20', 1);
    const where = `${width}x${height} ${round.equation.left.join(' ')} = ${round.equation.right.join(' ')}`;
    const i = round.choices.findIndex((c) => c.rule === 'count.start-included');
    expect(i, where).toBeGreaterThanOrEqual(0);
    await card(page, i).click();
    await unlocked(page);
    await inView(page);
    const marks = await page.locator('[data-display="jumps"] .bl-mark').evaluateAll((els) => els.map((m) => {
      const b = m.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(m);
      const ink = range.getBoundingClientRect();
      const cube = document.querySelector('.bl-scene > .bl-pan > .bl-stack > .bl-cube').getBoundingClientRect().width;
      return { text: m.textContent, width: b.width, height: b.height, ink: ink.width, centre: Math.abs(ink.left + ink.right - b.left - b.right) / 2, cube };
    }));
    expect(marks.length, where).toBe(round.choices[i].value);
    expect(marks[0].cube, `${where}: a small cube`).toBeLessThan(14);
    for (const m of marks) {
      expect(m.width, `${where} mark ${m.text}`).toBeGreaterThanOrEqual(14.9);
      expect(Math.abs(m.height - m.width), `${where} mark ${m.text} round`).toBeLessThan(0.1);
      expect(m.ink, `${where} mark ${m.text}: its digits inside its 2px ring`).toBeLessThanOrEqual(m.width - 4);
      expect(m.centre, `${where} mark ${m.text}: centred`).toBeLessThan(0.75);
    }
    expect(await page.evaluate(arcProblems), where).toEqual([]);
    expect(await page.evaluate(ringOverMarks), where).toEqual([]);
    expect(await page.evaluate(ringOverlaps, ringInset(browserName)), where).toEqual([]);
  }
});

test('the jumps: the digits of a two-digit mark are condensed inside its ring and centred; a one-digit mark is left as it is (design 4, 7.1)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const [width, height] of [[320, 568], [360, 568], [390, 844]]) {
    await page.setViewportSize({ width, height });
    // ? = 12 + 4: the marks 12 to 15; ? = 3 + 10: the marks 3 to 12, where only 10, 11 and 12 have two digits.
    for (const [seed, two] of [[1660, ['12', '13', '14', '15']], [1386, ['10', '11', '12']]]) {
      const { round } = await devAt(page, 'missing-symbols-20', seed);
      await card(page, round.choices.findIndex((c) => c.rule === 'count.start-included')).click();
      await unlocked(page);
      await expect(page.locator('[data-display="jumps"] .bl-mark').last()).toBeVisible();
      await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => null))));
      const marks = await page.evaluate(() => [...document.querySelectorAll('[data-display="jumps"] .bl-mark')].map((mark) => {
        const [b, range] = [mark.getBoundingClientRect(), document.createRange()];
        range.selectNodeContents(mark);
        const t = range.getBoundingClientRect();
        return { text: mark.textContent, ring: b.width, off: t.left + t.width / 2 - (b.left + b.width / 2), wide: t.width, fitted: Boolean(mark.querySelector('.bl-fit')) };
      }));
      const here = `${width}px ? = ${round.equation.right.join(' ')} (seed ${seed})`;
      expect(marks.filter((m) => m.text.length === 2).map((m) => m.text), `${here}: the two-digit marks`).toEqual(two);
      for (const m of marks) {
        if (m.text.length === 2) {
          expect(m.wide, `${here}: the ${m.text}'s digits, inside the ring's 2px edge, px`).toBeLessThanOrEqual(m.ring - 4);
          expect(Math.abs(m.off), `${here}: the ${m.text}'s digits off centre, px`).toBeLessThanOrEqual(1);
        }
        expect(m.fitted, `${here}: the ${m.text} is condensed only with two digits`).toBe(m.text.length === 2);
      }
    }
  }
});

test('R6: cubes in rows of five from the bottom, left to right; the cover is one dome on the known cubes, its size the same in every round; from the hint its outline is over the unknown\'s places, one piece per row', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // The fixed cover (owner decisions 2026-10-18 and 2026-10-19): two cubes and their gap wide, as
  // tall; beside the top row's cubes while two places are left there, else on them in the middle,
  // and in the middle of an empty pan; it stands on the pan or on cubes, never over nothing:
  // ? + 4 = 7, 8 + ? = 8 (nothing under it), ? = 6 + 2, 4 + ? = 7, 1 + ? = 7, 2 + ? = 6.
  for (const [level, seed] of [['missing-left', 11], ['missing-right', 3], ['missing-reversed', 145], ['missing-right', 11], ['missing-right', 6], ['missing-right', 2]]) {
    const { round } = await devAt(page, level, seed);
    const where = `${level} ${seed}`;
    const fixed = stack(page, 'left').locator('.bl-lid.is-fixed');
    await expect(fixed, where).toBeVisible();
    await expect(fixed.locator('.cover[data-mark="?"]'), where).toHaveCount(1);
    const anyCubes = stack(page, 'right').locator('.bl-cube');
    const [dome, pile, c0, c1] = [await fixed.boundingBox(), await stack(page, 'left').boundingBox(), await anyCubes.nth(0).boundingBox(), await anyCubes.nth(1).boundingBox()];
    expect(Math.abs(dome.width - (c1.x - c0.x + c0.width)), `${where}: two cubes and their gap wide`).toBeLessThan(1);
    expect(Math.abs(dome.height - dome.width), `${where}: as tall as wide`).toBeLessThan(1);
    const known = await Promise.all((await stack(page, 'left').locator('.bl-cube:not([data-role="unknown"])').all()).map((c) => c.boundingBox()));
    expect(known.length).toBe(round.picture.filter((g) => g.side === 'left' && g.role !== 'unknown').reduce((n, g) => n + g.count, 0));
    const bottom = dome.y + dome.height;
    for (const c of known) {
      const apart = c.x >= dome.x + dome.width - 0.5 || c.x + c.width <= dome.x + 0.5 || c.y >= bottom - 0.5 || c.y + c.height <= dome.y + 0.5;
      expect(apart, `${where}: over a cube`).toBe(true);
    }
    // Both its ends stand on the pan, or on a cube 3px under it.
    const onPan = Math.abs(bottom - (pile.y + pile.height)) < 1;
    for (const x of [dome.x + 2, dome.x + dome.width - 2]) {
      const under = known.some((c) => x >= c.x && x <= c.x + c.width && Math.abs(c.y - 3 - bottom) < 1);
      expect(onPan || under, `${where}: its end at ${Math.round(x)} stands on nothing`).toBe(true);
    }
    // Beside its row's cubes, 3px off them; in the middle of the pan when none is in its row.
    const row = known.filter((c) => Math.abs(c.y + c.height - bottom) < 1);
    if (row.length) expect(Math.abs(dome.x - (Math.max(...row.map((c) => c.x + c.width)) + 3)), `${where}: beside its row's cubes`).toBeLessThan(1);
    else expect(Math.abs(dome.x + dome.width / 2 - (pile.x + pile.width / 2)), `${where}: in the middle of the pan`).toBeLessThan(1);
  }
  // 4 + ? = 7: four cubes, the fixed cover on them; from the hint, the outline over places 5 to 7
  // (one on the first row, two on the second).
  const { round } = await devAt(page, 'missing-right', 11);
  expect(round.equation).toEqual({ left: [4, '+', '?'], right: [7] });
  const right = page.locator('.bl-pan[data-pan="right"] .bl-cube');
  const [r1, r2, r6] = await Promise.all([right.nth(0).boundingBox(), right.nth(1).boundingBox(), right.nth(5).boundingBox()]);
  expect(r1.x).toBeLessThan(r2.x);
  expect(Math.abs(r6.x - r1.x)).toBeLessThan(1);
  expect(r6.y).toBeLessThan(r1.y);
  const lids = page.locator('.bl-pan[data-pan="left"] .bl-lid.is-outline:not(.bl-bridge)');
  await expect(lids).toHaveCount(2);
  for (const lid of await lids.all()) await expect(lid).toBeHidden();
  for (const i of wrongOf(round).slice(0, 2)) {
    await card(page, i).click();
    await unlocked(page);
  }
  await expect(page.locator('.bl-pan[data-pan="left"] .bl-lid.is-fixed')).toBeHidden();
  await expect(lids.first()).toBeVisible();
  // The pieces share no column: one bridge across, and its tab down into the first piece.
  await expect(page.locator('.bl-pan[data-pan="left"] .bl-bridge.is-across')).toHaveCount(1);
  await expect(page.locator('.bl-pan[data-pan="left"] .bl-bridge.is-tab')).toHaveCount(1);
  await expect(page.locator('.bl-pan[data-pan="left"] .bl-lid.is-outline .cover[data-mark="?"]')).toHaveCount(1);
  const [lid1, lid2] = [await lids.nth(0).boundingBox(), await lids.nth(1).boundingBox()];
  const cube = await page.locator('.bl-pan[data-pan="left"] .bl-cube').first().boundingBox();
  expect(lid1.width).toBeCloseTo(cube.width, 0);
  expect(lid2.width).toBeGreaterThan(cube.width * 2);
  await expect(page.locator('.bl-pan[data-pan="right"] .bl-cube').first()).toHaveCSS('background-color', 'rgb(14, 58, 138)');
  // The balance's frame has no role colour (R6, design 6.8).
  await expect(page.locator('.bl-beam')).toHaveCSS('background-color', 'rgb(122, 111, 92)');
});

test('the cards\' dots: only on level 2, the balance\'s first with numbers; from level 3 the digits alone (cardDots, owner decision 2026-10-19)', async ({ page }) => {
  // The pans show each number in rows of five; dots under the cards would let ? = 6 + 2 be answered
  // by matching the right pan's shape to card 8's.
  for (const [level, seed, dots] of [['missing-right', 1, true], ['missing-left', 1, false], ['missing-reversed', 145, false], ['both-sides', 1, false], ['turn', 1, false], ['relational', 1, false]]) {
    const { round } = await devAt(page, level, seed);
    await expect(page.locator('[data-choices] .card-dots'), level).toHaveCount(dots ? round.choices.length : 0);
    await expect(page.locator('[data-choices] .card-number'), level).toHaveCount(round.choices.length);
  }
});

test('two known numbers on a pan: one pile in rows of five, the second number in the part\'s light shade (owner decision 2026-10-14, "צבע שני")', async ({ page }) => {
  // same-as: a + b on the left pan; its cubes fill places 0 to a + b - 1, a's yellow, b's light.
  for (const seed of [1, 2, 3]) {
    const { round } = await devAt(page, 'same', seed);
    const [a, b] = round.picture.filter((g) => g.role === 'part').map((g) => g.count);
    const cubes = stack(page, 'left').locator('.bl-cube');
    await expect(cubes).toHaveCount(a + b);
    // The cubes come in one after another (up to 0.53 s); a box read on the way is off its place.
    await page.evaluate(() => Promise.all(document.getAnimations().map((x) => x.finished.catch(() => null))));
    const boxes = await Promise.all((await cubes.all()).map((c) => c.boundingBox()));
    for (let i = 0; i < a + b; i++) {
      // Rows of five from the bottom: the i-th cube is in column i % 5 of row i / 5.
      expect(Math.abs(boxes[i].x - boxes[i % 5].x), `seed ${seed} cube ${i}`).toBeLessThan(1);
      expect(Math.abs(boxes[i].y - boxes[5 * Math.floor(i / 5)].y), `seed ${seed} cube ${i}`).toBeLessThan(1);
      await expect(cubes.nth(i)).toHaveCSS('background-color', i < a ? YELLOW : LIGHT);
    }
  }
  // ? = a + b: a yellow and b light on the right pan, in one pile; from the hint the cover's outline
  // on the left over the places of the sum, in the same rows of five (design 6.8: the pans compare
  // row by row).
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { round } = await devAt(page, 'missing-reversed', 10);
  expect(round.unknown).toBe('result-left');
  const [a, , b] = round.equation.right;
  const right = stack(page, 'right').locator('.bl-cube');
  await expect(stack(page, 'right').locator('.bl-cube[data-second]')).toHaveCount(b);
  await expect(right.nth(a - 1)).toHaveCSS('background-color', YELLOW);
  await expect(right.nth(a)).toHaveCSS('background-color', LIGHT);
  for (const i of wrongOf(round).slice(0, 2)) {
    await card(page, i).click();
    await unlocked(page);
  }
  const lids = stack(page, 'left').locator('.bl-lid.is-outline:not(.bl-bridge)');
  await expect(lids).toHaveCount(Math.ceil((a + b) / 5));
  await expect(lids.first()).toBeVisible();
  // The outline's first piece spans the first row, as the right pan's first five cubes do.
  const [lid, c0, c1] = [await lids.first().boundingBox(), await right.nth(0).boundingBox(), await right.nth(1).boundingBox()];
  expect(Math.abs(lid.width - ((Math.min(5, a + b) - 1) * (c1.x - c0.x) + c0.width))).toBeLessThan(2);
});

/**
 * A cover over two rows that share no column, read in the page and from a screenshot: its bridge
 * leaves white over every cube under it, and from the upper piece the cover's magenta reaches the
 * lower piece (design 6.6: the pieces are joined).
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string[]>}
 */
async function coverAcross(page) {
  const { bar, cubes, pieces } = await page.evaluate(() => {
    const stack = document.querySelector('.bl-scene > .bl-pan[data-pan="left"] > .bl-stack');
    const box = (e) => e.getBoundingClientRect().toJSON();
    return { bar: box(stack.querySelector('.bl-bridge.is-across')), cubes: [...stack.querySelectorAll('.bl-cube:not([data-role="unknown"])')].map(box),
      pieces: [...stack.querySelectorAll('.bl-lid.is-outline:not(.bl-bridge)')].map(box) };
  });
  const out = [];
  for (const c of cubes) {
    if (c.right <= bar.left || c.left >= bar.right || c.bottom < bar.bottom) continue;
    if (c.top - bar.bottom < 1.5) out.push(`${Math.round((c.top - bar.bottom) * 10) / 10}px between the bridge and a cube under it`);
  }
  const all = [bar, ...pieces];
  const clip = { x: Math.min(...all.map((b) => b.left)) - 2, y: Math.min(...all.map((b) => b.top)) - 2 };
  Object.assign(clip, { width: Math.max(...all.map((b) => b.right)) + 2 - clip.x, height: Math.max(...all.map((b) => b.bottom)) + 2 - clip.y });
  // The hint's dashed places lie over the pieces, and a seed below a '?' is on a dash's edge (WebKit
  // blends it white): hidden for the read, so only the cover's shapes show.
  const dashes = await page.addStyleTag({ content: '[data-hint] .bl-dash { visibility: hidden !important; }' });
  const png = (await page.screenshot({ clip })).toString('base64');
  await dashes.evaluate((s) => s.remove());
  const apart = await page.evaluate(async ({ data, clip, pieces }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const [w, h] = [img.width, img.height];
    const ctx = Object.assign(document.createElement('canvas'), { width: w, height: h }).getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, w, h).data;
    const k = w / clip.width;
    const magenta = (x, y) => x >= 0 && y >= 0 && x < w && y < h && Math.abs(d[(y * w + x) * 4] - 214) + Math.abs(d[(y * w + x) * 4 + 1] - 51) + Math.abs(d[(y * w + x) * 4 + 2] - 108) < 90;
    // A point in each piece, 2px above its bottom, under its '?'.
    const seeds = pieces.map((b) => [Math.round((b.left + b.width / 2 - clip.x) * k), Math.round((b.bottom - 2 - clip.y) * k)]);
    const seen = new Uint8Array(w * h);
    const queue = [seeds[0]];
    seen[seeds[0][1] * w + seeds[0][0]] = 1;
    while (queue.length) {
      const [x, y] = queue.pop();
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (magenta(nx, ny) && !seen[ny * w + nx]) {
          seen[ny * w + nx] = 1;
          queue.push([nx, ny]);
        }
      }
    }
    return seeds.filter(([x, y]) => !seen[y * w + x]).length;
  }, { data: png, clip, pieces });
  if (apart) out.push(`${apart} of ${pieces.length} pieces apart from the first`);
  return out;
}

test('a cover\'s outline over two rows that share no column: its bridge runs 2px clear of the cubes under it and reaches the lower piece (design 6.6)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // 2 + ? = 6 and 4 + ? = 7, from the hint: the bridge passes over the 2 or the 4.
  for (const [width, height] of [[320, 568], [360, 640], [390, 844]]) {
    await page.setViewportSize({ width, height });
    for (const seed of [2, 11]) {
      const { round } = await devAt(page, 'missing-right', seed);
      for (const i of wrongOf(round).slice(0, 2)) {
        await card(page, i).click();
        await unlocked(page);
      }
      await expect(page.locator('.bl-scene > .bl-pan[data-pan="left"] .bl-bridge.is-across')).toBeVisible();
      expect(await coverAcross(page), `${width}px ${JSON.stringify(round.equation.left)}`).toEqual([]);
    }
  }
});

test('home thumbs: the fixed cover, the same dome as on the pans, and never its outline (design 6.6)', async ({ context }) => {
  // The next step's thumb at two levels; the outline shows only with the hint, which a thumb never has.
  for (const [level, width] of [['missing-right', 390], ['both-sides-symbols', 320]]) {
    const tab = await context.newPage();
    await tab.setViewportSize({ width, height: 844 });
    await seedStore(tab, storeWith({ games: { balance: ladderAt(level) } }));
    await tab.clock.install({ time: NOW });
    await tab.goto(`${INDEX}#/`);
    const thumb = tab.locator('[data-thumb][data-game="balance"]').first();
    const fixed = thumb.locator('.bl-lid.is-fixed');
    await expect(fixed).toHaveCount(1);
    await expect(fixed.locator('.cover')).toBeVisible();
    for (const piece of await thumb.locator('.bl-lid.is-outline').all()) await expect(piece).toBeHidden();
    const [dome, c0, c1] = [await fixed.boundingBox(), await thumb.locator('.bl-cube').nth(0).boundingBox(), await thumb.locator('.bl-cube').nth(1).boundingBox()];
    // Scaled with the thumb: still two cubes and their gap wide, as tall.
    expect(Math.abs(dome.width - (c1.x - c0.x + c0.width)), `${level} at ${width}px`).toBeLessThan(0.5);
    expect(Math.abs(dome.height - dome.width), `${level} at ${width}px`).toBeLessThan(0.5);
    await tab.close();
  }
});

test('a cover has the dome\'s corners from its height: the fixed one, and each piece of its outline, which covers each place (design 6.6)', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // 3 + ? = 10: the fixed cover, then an outline piece over two places and one over five; ? = 6 + 4:
  // the fixed cover, then two pieces of five; the turned rows: one piece over four dots, at rest.
  for (const [level, seed] of [['missing-right', 1], ['missing-reversed', 10], ['turn', 4]]) {
    const { round } = await devAt(page, level, seed);
    const turned = level === 'turn';
    /** @type {() => Promise<string[]>} the shown covers' corners, and the places under the shown outline */
    const problems = () => page.evaluate((outline) => {
      const out = [];
      const numbers = (s) => (s.match(/[\d.]+/g) ?? []).map(Number);
      const pieces = [...document.querySelectorAll('[data-area="picture"] .bl-lid:not(.bl-bridge)')].filter((lid) => getComputedStyle(lid).visibility !== 'hidden');
      if (!pieces.length) out.push('no cover shown');
      for (const lid of pieces) {
        // The dome app.css draws for a cover of this height (--cover-h), as the equation's and ten-frame's.
        const probe = document.body.appendChild(document.createElement('div'));
        probe.style.cssText = `position: absolute; width: 10px; height: 10px; --cover-h: ${getComputedStyle(lid).height}`;
        const dome = probe.appendChild(document.createElement('span'));
        dome.className = 'cover';
        const [want, got] = [numbers(getComputedStyle(dome).borderRadius), numbers(getComputedStyle(lid.firstElementChild).borderRadius)];
        probe.remove();
        if (want.length !== got.length || want.some((n, i) => Math.abs(n - got[i]) > 0.05)) out.push(`${lid.className}: corners ${got} instead of ${want}`);
      }
      // Every place under the outline: near its top and bottom edges, a quarter in from either side,
      // is the cover itself (hit testing follows the rounded corners), not the box around it.
      if (!outline) return out;
      for (const place of document.querySelectorAll('[data-area="picture"] .bl-stage [data-role="unknown"]')) {
        const c = place.getBoundingClientRect();
        for (const [fx, fy] of [[0.25, 0.2], [0.75, 0.2], [0.25, 0.85], [0.75, 0.85], [0.5, 0.1]]) {
          const hit = document.elementFromPoint(c.left + fx * c.width, c.top + fy * c.height);
          if (!hit?.matches('.cover')) out.push(`a place at ${Math.round(c.left)},${Math.round(c.top)}, ${fx},${fy}: ${hit?.className}`);
        }
      }
      return out;
    }, turned);
    if (!turned) {
      await expect(page.locator('[data-area="picture"] .bl-lid.is-fixed')).toBeVisible();
      expect(await problems(), `${level}, the fixed cover`).toEqual([]);
      for (const i of wrongOf(round).slice(0, 2)) {
        await card(page, i).click();
        await unlocked(page);
      }
      await expect(page.locator('[data-area="picture"] .bl-lid.is-outline').first()).toBeVisible();
    }
    expect(await problems(), turned ? level : `${level}, the outline`).toEqual([]);
  }
});

/** In the page: the size of a cube on the real pans, px. */
const cubeSize = (page) => page.locator('.bl-scene > .bl-pan > .bl-stack > .bl-cube').first().evaluate((c) => c.getBoundingClientRect().width);
/** Opens a #/dev round; in symbols look the picture is asked for, so it is drawn. */
async function picturedAt(page, level, seed) {
  const opened = await devAt(page, level, seed);
  if (opened.round.look === 'symbols') await page.locator('[data-show-picture]').click();
  await expect(page.locator('.bl-scene')).toBeVisible();
  return opened;
}

test('a phone on its side: the balance\'s picture is as tall as on a 320px phone held upright, so cubes, digits, marks and chips keep their sizes (design 5, 6.8; bug hunt #4)', async ({ page }) => {
  test.setTimeout(180000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const [width, height] of [[568, 320], [844, 390]]) {
    await page.setViewportSize({ width, height });
    const where = (what) => `${width}×${height} ${what}`;
    // 4 rows at rest: 13 + 5 = ? + 12 (level 8), 10 + 3 = 11 + ? (level 11), 19 = 3 + ? (level 6, a tour to 16). The cubes
    // as large at rest, with the hint and in the tour; every tour number inside its cube, none run into the next.
    for (const [level, seed] of [['both-sides-symbols', 9], ['relational', 1], ['missing-symbols-20', 9]]) {
      const at = (what) => where(`${level} ${seed}: ${what}`);
      const { round } = await picturedAt(page, level, seed);
      expect(await cubeSize(page), at('a cube at rest, px')).toBeGreaterThanOrEqual(17.5);
      expect(await page.evaluate(() => document.scrollingElement.scrollWidth - innerWidth), at('no sideways scroll')).toBeLessThanOrEqual(0);
      const wrong = wrongOf(round);
      for (const [k, i] of wrong.entries()) {
        await card(page, i).click();
        await unlocked(page);
        if (k !== wrong.length - 2) continue;
        await expect(page.locator('[data-hint]'), at('the hint')).toHaveCount(1);
        expect(await cubeSize(page), at('a cube with the hint, px')).toBeGreaterThanOrEqual(17.5);
      }
      await expect(page.locator('[data-hint] .bl-ring.is-tour'), at('the tour')).not.toHaveCount(0);
      expect(await cubeSize(page), at('a cube in the tour, px')).toBeGreaterThanOrEqual(17.5);
      const fits = await page.evaluate(() => [...document.querySelectorAll('.bl-stack > .bl-cube > .bl-digit > .bl-fit')].map((f) => {
        const [d, c] = [f.getBoundingClientRect(), f.closest('.bl-cube').getBoundingClientRect()];
        return d.left >= c.left - 0.5 && d.right <= c.right + 0.5;
      }));
      if (level === 'missing-symbols-20') expect(fits.length, at('two-digit numbers in the tour')).toBeGreaterThan(0);
      expect(fits.every(Boolean), at('each inside its cube')).toBe(true);
      expect(await page.evaluate(tourOverlaps), at('tour numbers run together')).toEqual([]);
      expect(await page.evaluate(() => document.scrollingElement.scrollWidth - innerWidth), at('no sideways scroll in the tour')).toBeLessThanOrEqual(0);
    }
    // 10 + ? = 18's 28 (overflow): 8 rows of ghosts, 9.4px or more.
    const big = await picturedAt(page, 'missing-symbols-20', 25);
    await card(page, big.round.choices.findIndex((c) => c.value === 28)).click();
    await unlocked(page);
    const ghost = await page.locator('[data-display="overflow"] .bl-ghost').first().evaluate((g) => g.getBoundingClientRect().width);
    expect(ghost, where('a ghost at 8 rows, px')).toBeGreaterThanOrEqual(9.4);
    // ? = 8 + 11's 18 (jumps): marks 8 to 18 the cube's size, their digits inside the ring.
    const jumps = await picturedAt(page, 'missing-symbols-20', 30);
    await card(page, jumps.round.choices.findIndex((c) => c.rule === 'count.start-included')).click();
    await unlocked(page);
    const marks = await page.evaluate(() => [...document.querySelectorAll('[data-display="jumps"] .bl-mark')].map((m) => {
      const [b, fit] = [m.getBoundingClientRect(), m.querySelector('.bl-fit')];
      const f = fit?.getBoundingClientRect();
      return { size: b.width, inside: !f || (f.left >= b.left + 1 && f.right <= b.right - 1) };
    }));
    expect(Math.min(...marks.map((m) => m.size)), where('a jump mark, px')).toBeGreaterThanOrEqual(17.5);
    expect(marks.every((m) => m.inside), where('digits inside the marks')).toBe(true);
    // 13 + ? = 19 after two misses: the chips under the pans keep 5px off the pole.
    const chips = await picturedAt(page, 'missing-symbols-20', 10);
    for (const i of wrongOf(chips.round).slice(0, 2)) {
      await card(page, i).click();
      await unlocked(page);
    }
    const clear = await page.evaluate(() => {
      const pole = document.querySelector('.bl-scene > .bl-pole').getBoundingClientRect();
      return [...document.querySelectorAll('[data-hint] .bl-chip')].map((c) => {
        const b = c.getBoundingClientRect();
        return c.dataset.pan === 'left' ? pole.left - b.right : b.left - pole.right;
      });
    });
    expect(clear.length, where('two chips')).toBe(2);
    expect(Math.min(...clear), where('a chip off the pole, px')).toBeGreaterThanOrEqual(5 - 0.5);
  }
});

/** Plays the session on screen to its end screen, each round on a first try. */
async function playToEnd(page) {
  for (let n = 0; n < 20; n++) {
    const screen = page.locator('main[data-screen]');
    await expect(screen).toHaveAttribute('data-screen', /^(round|demo|end)$/);
    const name = await screen.getAttribute('data-screen');
    if (name === 'end') return;
    if (name === 'round') {
      await look(page);
      const { answerAt } = await roundOf(page);
      await card(page, answerAt).click();
    }
    await expect(page.locator('[data-next]')).toBeVisible();
    await look(page);
    await page.locator('[data-next]').click();
  }
}
/** In the page: every balance thumb's stage inside its card, by 1px. */
const thumbsInside = (page) => page.evaluate(() => [...document.querySelectorAll('.thumb[data-game="balance"]')].every((t) => {
  const [b, s] = [t.getBoundingClientRect(), t.querySelector('.bl-stage').getBoundingClientRect()];
  return s.left >= b.left - 1 && s.right <= b.right + 1 && s.top >= b.top - 1 && s.bottom <= b.bottom + 1;
}));

test('a turned phone: the thumbs keep inside their cards, and a tour\'s squeezed numbers are measured again (design 5; bug hunt #11)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 568, height: 320 });
  await page.clock.install({ time: NOW });
  await page.goto(`${INDEX}#/`);
  await expectThumbsDrawn(page);
  await page.setViewportSize({ width: 320, height: 568 });
  await expect.poll(() => thumbsInside(page)).toBe(true);
  // 19 = 3 + ?'s tour at 390×844, then turned: each two-digit number inside its smaller cube, and back to 1 turned back.
  await page.setViewportSize({ width: 390, height: 844 });
  const { round } = await picturedAt(page, 'missing-symbols-20', 9);
  for (const i of wrongOf(round)) {
    await card(page, i).click();
    await unlocked(page);
  }
  await expect(page.locator('[data-tour]').last()).toHaveText(String(round.answer));
  const squeezed = () => page.evaluate(() => [...document.querySelectorAll('.bl-stack > .bl-cube > .bl-digit')].filter((d) => d.querySelector('.bl-fit')).map((d) => {
    const [f, c] = [d.querySelector('.bl-fit').getBoundingClientRect(), d.closest('.bl-cube').getBoundingClientRect()];
    return { sx: d.style.getPropertyValue('--sx'), room: c.width - 3 - f.width };
  }));
  expect((await squeezed()).every((d) => d.sx === '1.000')).toBe(true);
  await page.setViewportSize({ width: 844, height: 390 });
  await expect.poll(async () => Math.min(...(await squeezed()).map((d) => d.room))).toBeGreaterThanOrEqual(0);
  expect(await page.evaluate(tourOverlaps), 'turned: tour numbers run together').toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => (await squeezed()).every((d) => d.sx === '1.000')).toBe(true);
  expect(await page.evaluate(tourOverlaps), 'turned back: tour numbers run together').toEqual([]);
});

test('a turned phone: an end screen played sideways keeps its eight thumbs inside their cards (design 5; bug hunt #11)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 568, height: 320 });
  await playAt(page, 'missing-left');
  await playToEnd(page);
  await expect(page.locator('main[data-screen="end"] .bl-stage.is-thumb')).toHaveCount(8);
  expect(await thumbsInside(page), '568×320').toBe(true);
  // Turned: each card 138px wide, its stage scaled for a 262px card; turned back, 262px again.
  await page.setViewportSize({ width: 320, height: 568 });
  await expect.poll(() => thumbsInside(page), '320×568').toBe(true);
  await page.setViewportSize({ width: 568, height: 320 });
  await expect.poll(() => thumbsInside(page), '568×320 again').toBe(true);
});

test('a session of 8 rounds ends on the solved pictures', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await playAt(page, 'missing-left');
  await playToEnd(page);
  await expect(page.locator('main[data-screen="end"] .end-thumbs > [data-thumb][data-solved]')).toHaveCount(8);
  await expect(page.locator('main[data-screen="end"] .bl-stage.is-thumb')).toHaveCount(8);
  await expectThumbsDrawn(page);
  expect((await stored(page)).child.attempts.every((a) => a.outcome === 'first')).toBe(true);
});
