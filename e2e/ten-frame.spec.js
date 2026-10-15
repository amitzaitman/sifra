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
    // Nothing under the cover (level 2, about one round in ten): the closing rings the empty place with 0.
    if (round.answer === 0) await expect(page.locator('[data-area="picture"] .tf-ring.is-zero')).toBeVisible();
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
    expect(await first.locator('*').count() + await page.locator('.is-flashed').count(), 'the display draws or marks something').toBeGreaterThan(0);
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
    expect(await shown.locator('*').count() + await page.locator('.is-flashed').count(), 'the display draws or marks something').toBeGreaterThan(0);
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

test('making ten with the empty cells bracketed, card 10 first: the tray\'s ring leaves the bracket whole and passes under its small \'?\' (design 6.6, 7.3)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const [width, height] of [[320, 568], [390, 844]]) {
    await page.setViewportSize({ width, height });
    // The run starts in the top row (the dome on the tray's top edge), and in the lower row.
    for (const part of [1, 4, 8, 9]) {
      const { round } = await devAt(page, 'ten-empty', (r) => r.equation.left[0] === part);
      await card(page, round.choices.findIndex((c) => c.rule === 'given.whole')).click();
      await unlocked(page);
      await expect(page.locator('[data-display="flash"] .tf-ring.is-tray')).toBeVisible();
      const problems = await page.evaluate(() => {
        const out = [];
        const ring = document.querySelector('[data-display] .tf-ring.is-tray');
        const r = ring.getBoundingClientRect();
        const s = getComputedStyle(ring);
        const inset = Math.max(0, ...s.boxShadow.split(/,(?![^(]*\))/).filter((e) => e.includes('inset')).map((e) => parseFloat(e.replace(/rgba?\([^)]*\)/, '').trim().split(/\s+/)[3])));
        const inner = parseFloat(s.borderTopWidth) + inset;
        // The bracket's line, 3px wide: the ring's border and inner halo stay outside it.
        const b = document.querySelector('[data-area="picture"] .tf-bracket .tf-line').getBoundingClientRect();
        for (const [edge, gap] of [['left', b.left - 1.5 - (r.left + inner)], ['top', b.top - 1.5 - (r.top + inner)],
          ['right', r.right - inner - (b.right + 1.5)], ['bottom', r.bottom - inner - (b.bottom + 1.5)]]) {
          if (gap < 0) out.push(`the ring's inner halo ${Math.round(-gap * 10) / 10}px over the bracket's ${edge} line`);
        }
        // Where the ring's border crosses the dome, the dome is on top.
        const dome = document.querySelector('[data-area="picture"] .tf-lid.is-small .cover');
        const d = dome.getBoundingClientRect();
        const style = document.head.appendChild(document.createElement('style'));
        style.textContent = '[data-game] .tf-ring { pointer-events: auto !important; }';
        const y = r.top + parseFloat(s.borderTopWidth) / 2;
        const hit = y > d.top && y < d.bottom ? document.elementFromPoint(d.left + d.width / 2, y) : dome;
        if (hit !== dome) out.push(`the dome under ${hit?.getAttribute('class')}`);
        style.remove();
        // Nothing of the dome or its 3px halo on a counter in the row it stands in (9 + ?: the ninth).
        for (const disc of document.querySelectorAll('[data-area="picture"] .tf-disc[data-role="part"]')) {
          const c = disc.getBoundingClientRect();
          const [x, y, r] = [c.left + c.width / 2, c.top + c.height / 2, c.width / 2];
          if (y < d.top + d.height / 2) continue;
          const near = Math.hypot(Math.max(d.left - 3 - x, 0, x - d.right - 3), Math.max(d.top - 3 - y, 0, y - d.bottom - 3));
          if (near < r) out.push(`the dome ${Math.round((r - near) * 10) / 10}px over the counter at ${Math.round(c.left)},${Math.round(c.top)}`);
        }
        return out;
      });
      expect(problems, `${width}px, ${part} + ? = 10`).toEqual([]);
    }
  }
});

test('a split frame (levels 1-2): the whole\'s outline and the tour\'s nest, both whole; the tag sits over both; a flashed tag keeps its ring inside (design 7.1, 7.2)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  /** Nothing over the tag's bottom edge: what is drawn there (lines and rings take a point) is the tag. */
  const tagOnTop = () => {
    const style = document.head.appendChild(document.createElement('style'));
    style.textContent = '[data-game] .tf-layer * { pointer-events: auto !important; } [data-game] .tf-svg path { pointer-events: visibleStroke !important; }';
    const tag = document.querySelector('[data-area="picture"] .tf-tag');
    const b = tag.getBoundingClientRect();
    const out = [];
    for (const f of [0.15, 0.5, 0.85]) {
      const hit = document.elementFromPoint(b.left + f * b.width, b.bottom - 1);
      if (hit !== tag && !tag.contains(hit)) out.push(`the tag's bottom at ${f} under ${hit?.getAttribute('class')}`);
    }
    style.remove();
    return out;
  };
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 568 });
    // 1 + ? = 5, 1 + ? = 10, 4 + ? = 8 (the unknown wraps a row without sharing a column).
    for (const [level, ok] of [['split-5', (r) => r.equation.left[0] === 1], ['split-10', (r) => r.equation.left[0] === 1 && r.equation.right[0] === 10],
      ['split-10', (r) => r.equation.left[0] === 4 && r.equation.right[0] === 8]]) {
      const { round, answerAt } = await devAt(page, level, ok);
      const where = `${width}px ${JSON.stringify(round.equation)}`;
      await toTheTour(page, round, answerAt);
      await expect(page.locator('[data-tour]').last()).toHaveText(String(round.answer));
      const [whole, tour] = await Promise.all(['.tf-line-whole', '.tf-line-unknown'].map((c) => page.locator(`[data-area="picture"] ${c} .tf-line`).evaluate((p) => ({ box: p.getBoundingClientRect().toJSON(), d: p.getAttribute('d') }))));
      // The run is one group: one outline, also where it wraps a row.
      expect(tour.d.split('M').length - 1, `${where}: one outline round the unknown`).toBe(1);
      // The tour's line (3px) and its halo (9px) stay inside the whole's line on every side.
      const [w, t] = [whole.box, tour.box];
      for (const [side, gap] of [['left', t.left - 4.5 - (w.left + 1.5)], ['top', t.top - 4.5 - (w.top + 1.5)],
        ['right', w.right - 1.5 - (t.right + 4.5)], ['bottom', w.bottom - 1.5 - (t.bottom + 4.5)]]) {
        expect(gap, `${where}: the tour's halo and the whole's line, ${side}`).toBeGreaterThanOrEqual(0.5);
      }
      expect(await page.evaluate(tagOnTop), where).toEqual([]);
    }
    // 10 first: the tag blinks with its ring inside its edge, with and without the hint (3 cards).
    for (const [level, ok] of [['split-10', (r) => r.equation.left[0] === 2 && r.answer > 0], ['split-5', (r) => r.choices.some((c) => c.rule === 'given.whole')]]) {
      const { round } = await devAt(page, level, ok);
      await card(page, round.choices.findIndex((c) => c.rule === 'given.whole')).click();
      await unlocked(page);
      await expect(page.locator('[data-area="picture"] .tf-tag')).toHaveClass(/is-flashed/);
      const reach = await page.evaluate(() => {
        const out = [];
        const tag = document.querySelector('[data-area="picture"] .tf-tag').getBoundingClientRect();
        for (const el of document.querySelectorAll('[data-display] *')) {
          const b = el.getBoundingClientRect();
          const halo = Math.max(0, ...getComputedStyle(el).boxShadow.split(/,(?![^(]*\))/).filter((e) => e && e !== 'none' && !e.includes('inset')).map((e) => parseFloat(e.replace(/rgba?\([^)]*\)/, '').trim().split(/\s+/)[3]) || 0));
          if (b.bottom + halo > tag.bottom && b.top < tag.bottom && b.left < tag.right && b.right > tag.left) out.push(`${el.getAttribute('class')} reaches ${Math.round((b.bottom + halo - tag.bottom) * 10) / 10}px below the tag`);
        }
        return out;
      });
      expect(reach, `${width}px ${level}`).toEqual([]);
      expect(await page.evaluate(tagOnTop), `${width}px ${level}`).toEqual([]);
    }
  }
});

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

test('a session of 8 rounds ends on the solved pictures, and a round after it plays again', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await playAt(page, 'split-10');
  const play = async () => {
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
  };
  await play();
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

/**
 * Pixels of the part's yellow or its edge left beside shown sticks and their bundle, at the
 * screen's own device pixels: a veil that stays on a layer of its own after its motion is snapped
 * apart from its stick, and a device pixel of the stick's edge shows along it.
 * @param {import('@playwright/test').Page} page
 */
async function partPixels(page) {
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => null))));
  const boxes = await page.locator('[data-area="picture"] .tf-bundle, [data-area="picture"] .tf-stick').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
  const [l, t] = [Math.min(...boxes.map((b) => b.left)) - 2, Math.min(...boxes.map((b) => b.top)) - 2];
  const clip = { x: l, y: t, width: Math.max(...boxes.map((b) => b.right)) + 2 - l, height: Math.max(...boxes.map((b) => b.bottom)) + 2 - t };
  const png = (await page.screenshot({ clip })).toString('base64');
  return page.evaluate(async (data) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const ctx = Object.assign(document.createElement('canvas'), { width: img.width, height: img.height }).getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, img.width, img.height).data;
    // Shown sticks are magenta on the panel: every pixel lies on the line between the two. The part
    // (255, 194, 51) and its edge (158, 108, 0) have far less blue than green, and the band's grey
    // (122, 111, 92) has red close to green.
    const [m, p] = [[214, 51, 108], [255, 253, 247]];
    const off = (c) => {
      const v = c.map((x, i) => x - m[i]);
      const dir = p.map((x, i) => x - m[i]);
      const k = Math.max(0, Math.min(1, v.reduce((s, x, i) => s + x * dir[i], 0) / dir.reduce((s, x) => s + x * x, 0)));
      return Math.hypot(...v.map((x, i) => x - k * dir[i]));
    };
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      const c = [d[i], d[i + 1], d[i + 2]];
      if (c[1] > c[2] + 25 && c[0] > c[1] + 15 && off(c) > 25) n += 1;
    }
    return n;
  }, png);
}

test('bundles: shown sticks keep no hairline of the part\'s edge, after the tour and after a first try (motion on)', async ({ page }) => {
  // Where a veil's layer snapped apart from its stick at the Pixel 7's and the iPhone's pixel ratios.
  for (const [width, answer] of [[320, 11], [360, 16]]) {
    await page.setViewportSize({ width, height: 568 });
    const { round, answerAt } = await devAt(page, 'teen-bundle', (r) => r.answer === answer);
    await toTheTour(page, round, answerAt);
    await expect(page.locator('[data-tour]').last()).toHaveText(String(answer));
    expect(await partPixels(page), `${width}px, ${answer}: the tour`).toBe(0);
    // Another seed of the same round, so the page loads afresh.
    let seen = 0;
    const again = await devAt(page, 'teen-bundle', (r) => r.answer === answer && ++seen === 2);
    await card(page, again.answerAt).click();
    await expect(page.locator('[data-next]')).toBeVisible();
    expect(await partPixels(page), `${width}px, ${answer}: solved`).toBe(0);
  }
});

/**
 * What a ring paints over, read in the page (design 7.1: a ring keeps what it marks whole, with its
 * edge and size): every thing drawn whose centre lies in a ring lies wholly in its hole, inside its
 * line and inner halo. A round ring's hole is a circle; a thing in it, the circle round its box.
 * @returns {string[]}
 */
function ringProblems() {
  const out = [];
  const things = [...document.querySelectorAll('[data-area="picture"] :is(.tf-ghost, .tf-place, .tf-disc, .tf-bundle, .tf-band, .tf-stick, .tf-circle, .tf-dot, .tf-lid.is-round > .cover)')]
    .filter((el) => [el, el.parentElement].every((e) => getComputedStyle(e).opacity !== '0'));
  for (const ring of document.querySelectorAll('[data-area="picture"] .tf-ring:not(.is-cell):not(.is-zero)')) {
    const r = ring.getBoundingClientRect();
    const s = getComputedStyle(ring);
    const inset = Math.max(0, ...s.boxShadow.split(/,(?![^(]*\))/).filter((e) => e.includes('inset')).map((e) => parseFloat(e.replace(/rgba?\([^)]*\)/, '').trim().split(/\s+/)[3])));
    const k = parseFloat(s.borderTopWidth) + inset;
    const hole = { left: r.left + k, top: r.top + k, right: r.right - k, bottom: r.bottom - k };
    const round = Math.abs(r.width - r.height) < 1 && (s.borderTopLeftRadius === '50%' || parseFloat(s.borderTopLeftRadius) >= r.width / 2 - 0.5);
    for (const el of things) {
      const b = el.getBoundingClientRect();
      const [x, y] = [b.left + b.width / 2, b.top + b.height / 2];
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
      const over = round
        ? Math.hypot(x - (r.left + r.right) / 2, y - (r.top + r.bottom) / 2) + Math.max(b.width, b.height) / 2 - (hole.right - hole.left) / 2
        : Math.max(hole.left - b.left, b.right - hole.right, hole.top - b.top, b.bottom - hole.bottom);
      if (over > 0.25) out.push(`${ring.className.replace('tf-at ', '')} ${Math.round(over * 10) / 10}px over ${el.className.replace('tf-at ', '')}`);
    }
  }
  return out;
}

test('a ring keeps what it marks whole: ghosts, places, a bundle and its band, sticks, a bond\'s circles and dots (design 7.1)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const value = (r, rule) => r.choices.find((c) => c.rule === rule)?.value;
  // [level, round, cards in order ('tour': every wrong card)]
  const states = [
    ['split-10', (r) => value(r, 'op.other') + r.equation.left[0] <= 10, ['op.other']],
    ['split-10', (r) => value(r, 'slip.near') === r.answer + 1 && r.answer > 0, ['slip.near']],
    ['teen-bundle', () => true, ['pv.ones-only']],
    ['teen-bundle', (r) => value(r, 'slip.near') === r.answer - 1, ['slip.near']],
    ['teen-bundle', (r) => value(r, 'slip.near') === r.answer + 1, ['slip.near']],
    ['teen-bundle', (r) => value(r, 'pv.teen-reversed') > 20, ['pv.teen-reversed']],
    ['teen-symbols', (r) => r.answer === 6, ['given.part']],
    ['teen-symbols', (r) => value(r, 'slip.near') === r.answer - 1, ['slip.near']],
    ['teen-symbols', (r) => value(r, 'slip.near') === r.answer + 1, ['slip.near']],
    ['teen-symbols', (r) => r.answer === 6, 'tour'],
    ['split-bond', () => true, ['given.whole']],
    ['split-bond', () => true, ['given.part']],
    ['split-bond', (r) => value(r, 'slip.near') === r.answer + 1, ['slip.near']],
    ['split-bond', (r) => value(r, 'slip.near') === r.answer - 1 && r.answer > 1, ['slip.near']],
    ['split-bond', (r) => r.answer > 2, 'tour'],
    ['split-pairs', () => true, ['given.whole']],
    ['split-pairs', (r) => r.answer.every((x) => x > 1), 'tour'],
  ];
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 568 });
    for (const [level, ok, cards] of states) {
      await page.goto('about:blank');   // two states may share a round
      const { round, answerAt } = await devAt(page, level, ok);
      if (round.look === 'symbols') await page.locator('[data-show-picture]').click();
      if (cards === 'tour') await toTheTour(page, round, answerAt);
      for (const rule of cards === 'tour' ? [] : cards) {
        await card(page, round.choices.findIndex((c) => c.rule === rule)).click();
        await unlocked(page);
      }
      await expect(page.locator('[data-area="picture"] .tf-ring').first()).toBeVisible();
      expect(await page.evaluate(ringProblems), `${width}px ${level} ${JSON.stringify(round.equation)} ${cards}`).toEqual([]);
    }
    // On a bond the dots stand too close for a ring each: what does not fit is one group in one
    // outline per part, its line halfway between dots, a pixel or more off each (also where the
    // drawing shrinks to hold the ghosts).
    for (const level of ['split-bond', 'split-pairs']) {
      await page.goto('about:blank');
      const { round } = await devAt(page, level, (r) => [value(r, 'op.other')].flat().some((x) => x > 6));
      await card(page, round.choices.findIndex((c) => c.rule === 'op.other')).click();
      await unlocked(page);
      const shown = page.locator('[data-display="overflow"]');
      await expect(shown.locator('.tf-ring')).toHaveCount(0);
      expect(await shown.locator('.tf-svg.tf-line-added').count()).toBeGreaterThan(0);
      const near = await shown.evaluate((root) => {
        const out = [];
        const dots = [...root.querySelectorAll('.tf-ghost')].map((g) => g.getBoundingClientRect());
        for (const path of root.querySelectorAll('.tf-line-added .tf-line')) {
          const line = /** @type {SVGPathElement} */ (path);
          const m = line.getScreenCTM();
          for (let t = 0, len = line.getTotalLength(); t <= len; t += 0.5) {
            const p = line.getPointAtLength(t).matrixTransform(m);
            for (const d of dots) {
              const r = d.width / 2;
              const off = Math.hypot(p.x - (d.left + r), p.y - (d.top + r)) - r - 1.5;
              if (off < 1) out.push(`${Math.round(off * 10) / 10}px off a ghost at ${Math.round(d.left)},${Math.round(d.top)}`);
            }
          }
        }
        return [...new Set(out)];
      });
      expect(near, `${width}px ${level}`).toEqual([]);
    }
  }
});

test('the bond\'s tour at 320px: the outline round the counted dots cuts none of them, draws under the last digit, and stays whole under the circle\'s ring (design 7.2)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 568 });
  // Three dots in one row (the last digit 3 in it); 0 and 8: a row of five and a row of three;
  // 0 and 10, 10 and 0: a grown 10 at the end of a row.
  for (const [level, ok] of [['split-bond', (r) => r.answer === 3], ['split-pairs', (r) => r.answer[0] === 0 && r.answer[1] === 8],
    ['split-pairs', (r) => r.answer[1] === 10], ['split-pairs', (r) => r.answer[0] === 10]]) {
    const { round, answerAt } = await devAt(page, level, ok);
    await page.evaluate(defineInkOf);
    await toTheTour(page, round, answerAt);
    await expect(page.locator('[data-tour]').last(), level).toHaveText(lastTour(round));
    await expect(page.locator('.tf-svg.tf-line-unknown'), level).toHaveCount(round.answer.length === 2 ? round.answer.filter(Boolean).length : 1);
    // A grown 10 on a dot, with its 1.2px outline, stays inside the line round its group.
    const ten = await page.evaluate(() => [...document.querySelectorAll('[data-tour="10"]')].flatMap((el) => {
      const ink = inkOf(el);
      const lines = [...document.querySelectorAll('.tf-line-unknown .tf-line')].map((p) => p.getBoundingClientRect());
      const line = lines.find((l) => (ink.left + ink.right) / 2 > l.left && (ink.left + ink.right) / 2 < l.right && (ink.top + ink.bottom) / 2 > l.top && (ink.top + ink.bottom) / 2 < l.bottom);
      if (!line) return ['a 10 outside every outline'];
      const room = Math.min(ink.left - 1.2 - (line.left + 1.5), line.right - 1.5 - (ink.right + 1.2));
      return room >= 0.5 ? [] : [`the 10 ${Math.round(-room * 10) / 10}px over its group's line`];
    }));
    expect(ten, `${level} ${JSON.stringify(round.answer)}`).toEqual([]);
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
      // The circle's hint ring above the dots: the outline's 3px line stays a pixel off the ring's
      // line, and is drawn over the ring's halo, which would cut it.
      for (const line of document.querySelectorAll('.tf-svg.tf-line-unknown .tf-line')) {
        const b = line.getBoundingClientRect();
        const x = b.left + b.width / 2;
        const ring = [...document.querySelectorAll('[data-hint] .tf-ring')].map((r) => [r, r.getBoundingClientRect()])
          .find(([, r]) => x > r.left && x < r.right && r.bottom <= b.top + 10);
        if (!ring) continue;
        const gap = b.top - 1.5 - ring[1].bottom;
        if (gap < 1) out.push(`the outline's line ${Math.round(gap * 10) / 10}px off the hint ring's line`);
        if (!(ring[0].compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING)) out.push('the hint ring\'s halo is drawn over the outline');
      }
      return out;
    });
    expect(problems, level).toEqual([]);
  }
});

/**
 * What is wrong with each 0 in a ring (design 7.1: an empty group is a ring with 0), read in the
 * page: the 0's ink, measured from its font and scaled as drawn, stays at least 1px inside the
 * ring's hole (inside its border and any inner halo), so nothing of the ring paints over it.
 * @returns {string[]}
 */
function zeroProblems() {
  const out = [];
  const ctx = document.createElement('canvas').getContext('2d');
  const rings = [...document.querySelectorAll('[data-area="picture"] .tf-ring.is-zero')];
  for (const digit of document.querySelectorAll('[data-area="picture"] .tf-digit')) {
    if (digit.textContent !== '0') continue;
    const range = document.createRange();
    range.selectNodeContents(digit);
    const t = range.getBoundingClientRect();
    const s = getComputedStyle(digit);
    // Measured at 200px, where whole-pixel metrics are precise. The text box is the font's ascent
    // and descent, scaled with the digit (the last grows 1.3): k turns 200px metrics into pixels drawn.
    ctx.font = `${s.fontWeight} 200px ${s.fontFamily}`;
    const m = ctx.measureText('0');
    const k = t.height / (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent);
    const base = t.top + k * m.fontBoundingBoxAscent;
    const [w, top, bottom] = [k * (m.actualBoundingBoxLeft + m.actualBoundingBoxRight), base - k * m.actualBoundingBoxAscent, base + k * m.actualBoundingBoxDescent];
    const [x, y] = [t.left + t.width / 2, (top + bottom) / 2];
    const ring = rings.find((r) => {
      const b = r.getBoundingClientRect();
      return x > b.left && x < b.right && y > b.top && y < b.bottom;
    });
    if (!ring) {
      out.push(`a 0 at ${Math.round(x)},${Math.round(y)} has no ring`);
      continue;
    }
    const b = ring.getBoundingClientRect();
    const rs = getComputedStyle(ring);
    const inset = Math.max(0, ...rs.boxShadow.split(/,(?![^(]*\))/).filter((e) => e.includes('inset')).map((e) => parseFloat(e.replace(/rgba?\([^)]*\)/, '').trim().split(/\s+/)[3])));
    const hole = b.width / 2 - parseFloat(rs.borderTopWidth) - inset;
    const [cx, cy] = [b.left + b.width / 2, b.top + b.height / 2];
    const far = Math.max(...[[x - w / 2, y], [x + w / 2, y], [x, top], [x, bottom]].map(([px, py]) => Math.hypot(px - cx, py - cy)));
    if (far > hole - 1) out.push(`a 0 ${Math.round(w)}x${Math.round(bottom - top)}px reaches ${Math.round(far * 10) / 10}px from its ring's centre; the hole is ${Math.round(hole * 10) / 10}px`);
  }
  return out;
}

test('a ring with 0 holds its 0, and no cover is left on it: the tour\'s grown 0 on a bond and on a frame, and the empty-plate display (design 7.1, 7.2)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const rounds = [['split-pairs', (r) => r.answer[0] === 0 && r.answer[1] === 8], ['split-pairs', (r) => r.answer[0] === 7 && r.answer[1] === 0],
    ['split-10', (r) => r.answer === 0], ['ten-empty', (r) => r.answer === 0]];
  for (const width of [320, 360]) {
    await page.setViewportSize({ width, height: 568 });
    for (const [level, ok] of rounds) {
      const { round, answerAt } = await devAt(page, level, ok);
      const where = `${width}px ${level} ${JSON.stringify(round.answer)}`;
      const plate = round.choices.findIndex((c) => c.rule === 'zero.counted-as-one');
      await card(page, plate).click();
      await unlocked(page);
      await expect(page.locator('[data-display="empty-plate"] .tf-ring.is-zero'), where).toBeVisible();
      expect(await page.evaluate(zeroProblems), `${where}, empty-plate`).toEqual([]);
      for (const i of round.choices.keys()) {
        if (i === answerAt || i === plate) continue;
        await card(page, i).click();
        await unlocked(page);
      }
      await expect(page.locator('[data-tour="0"]'), where).toHaveCount(1);
      // A full frame's empty place under the bracket's small '?': it lifts, so the 0 is not over it.
      const under = await page.locator('[data-tour="0"]').evaluate((zero) => {
        const b = zero.getBoundingClientRect();
        const [x, y] = [b.left + b.width / 2, b.top + b.height / 2];
        return [...document.querySelectorAll('[data-area="picture"] .cover:not(.is-lifted)')].map((c) => c.getBoundingClientRect())
          .filter((c) => x > c.left && x < c.right && y > c.top && y < c.bottom).length;
      });
      expect(under, `${where}: covers under the 0`).toBe(0);
      expect(await page.evaluate(zeroProblems), `${where}, the tour`).toEqual([]);
    }
  }
});

test('the bond\'s stems end on the circles: none shows inside the empty part\'s ring, its 0 alone there (empty-plate, design 7.1)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [320, 360]) {
    await page.setViewportSize({ width, height: 568 });
    for (const ok of [(r) => r.answer[0] === 0, (r) => r.answer[1] === 0]) {
      const { round } = await devAt(page, 'split-pairs', ok);
      await card(page, round.choices.findIndex((c) => c.rule === 'zero.counted-as-one')).click();
      await unlocked(page);
      await expect(page.locator('[data-display="empty-plate"] .tf-ring.is-zero')).toBeVisible();
      // Every point of a stem, its round cap (1.5px) included, goes at most 2px into a circle (under
      // its edge), and never into the hole of the ring with 0 (inside its line).
      const problems = await page.evaluate(() => {
        const out = [];
        const round = (el) => {
          const b = el.getBoundingClientRect();
          const s = getComputedStyle(el);
          return { x: b.left + b.width / 2, y: b.top + b.height / 2, r: b.width / 2, line: parseFloat(s.borderTopWidth), at: `${Math.round(b.left)},${Math.round(b.top)}` };
        };
        // How far a stem gets inside each circle and each ring (a negative depth stays outside).
        const depth = (c) => {
          let most = -Infinity;
          for (const path of document.querySelectorAll('[data-area="picture"] .tf-stems .tf-line')) {
            const line = /** @type {SVGPathElement} */ (path);
            const m = line.getScreenCTM();
            for (let s = 0, len = line.getTotalLength(); s <= len; s += len / 400) {
              const p = line.getPointAtLength(s).matrixTransform(m);
              most = Math.max(most, c.r - Math.hypot(p.x - c.x, p.y - c.y) + 1.5);
            }
          }
          return Math.round(most * 10) / 10;
        };
        for (const c of [...document.querySelectorAll('[data-area="picture"] .tf-circle')].map(round)) {
          if (depth(c) > 2) out.push(`a stem ${depth(c)}px into the circle at ${c.at}`);
        }
        for (const c of [...document.querySelectorAll('[data-area="picture"] .tf-ring.is-zero')].map(round)) {
          if (depth(c) > c.line) out.push(`a stem ${depth(c)}px into the ring at ${c.at}, past its ${c.line}px line`);
        }
        return out;
      });
      expect(problems, `${width}px ${JSON.stringify(round.answer)}`).toEqual([]);
    }
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

/**
 * Puts inkOf(el) on the page: the box of an element's text ink, measured from its font at 200px
 * (whole-pixel metrics are precise there) and scaled to the text box as drawn (transforms too).
 */
function defineInkOf() {
  const ctx = document.createElement('canvas').getContext('2d');
  /** @type {any} */ (window).inkOf = (el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const t = range.getBoundingClientRect();
    const s = getComputedStyle(el);
    ctx.font = `${s.fontWeight} 200px ${s.fontFamily}`;
    const m = ctx.measureText(el.textContent);
    // Across by the advance, down by ascent and descent: a number may be condensed as it grows.
    const [kx, ky] = [t.width / m.width, t.height / (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)];
    const base = t.top + ky * m.fontBoundingBoxAscent;
    return { left: t.left - kx * m.actualBoundingBoxLeft, right: t.left + kx * m.actualBoundingBoxRight,
      top: base - ky * m.actualBoundingBoxAscent, bottom: base + ky * m.actualBoundingBoxDescent };
  };
}

test('the bond\'s count-up at 320px: every digit on a white label that holds it, 14px or more, none touching (design 4)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 568 });
  const slip = (r) => r.choices.find((c) => c.rule === 'slip.near');
  // 10 = 5 + ?, card 6: five places and a ghost in a ring; pair cards up to 11: ghosts and two-digit numbers.
  for (const [level, ok, n] of [['split-bond', (r) => r.answer === 5 && slip(r)?.value === 6, 6],
    ['split-pairs', (r) => slip(r) && slip(r).value[0] + slip(r).value[1] === 11 && slip(r).value[0] % 5 !== 0, 11]]) {
    const { round } = await devAt(page, level, ok);
    await page.evaluate(defineInkOf);
    await card(page, round.choices.indexOf(slip(round))).click();
    await unlocked(page);
    const digits = await textBoxes(page.locator('[data-display="count-up"] .tf-digit'));
    expect(digits.map((d) => d.text), level).toEqual(Array.from({ length: n }, (_, j) => String(j + 1)));
    // The dot's dashed edge is the digit's colour: on a label the dashes end before the digit's ink.
    const problems = await page.locator('[data-display="count-up"] .tf-digit').evaluateAll((els) => els.flatMap((el) => {
      const ink = inkOf(el);
      const b = el.getBoundingClientRect();
      const bg = getComputedStyle(el).backgroundColor;
      const holds = ink.left >= b.left && ink.right <= b.right && ink.top >= b.top && ink.bottom <= b.bottom;
      return bg === 'rgb(255, 255, 255)' && holds ? [] : [`"${el.textContent}" on ${bg}${holds ? '' : ', its ink out of its box'}`];
    }));
    expect(problems, level).toEqual([]);
    for (const d of digits) expect(d.size, `${level} "${d.text}"`).toBeGreaterThanOrEqual(14);
    expectApart(digits);
  }
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
  const { round, answerAt } = await devAt(page, 'teen-symbols', (r) => r.answer === 4);
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
  await expect(picture.locator('.tf-tag')).toHaveClass(/is-flashed/);
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
