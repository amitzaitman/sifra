// Shared Playwright helpers (architecture 4.5). The reading and touch-target checks come from
// AlefBet's e2e helpers; rounds are rebuilt in Node from the screen's data attributes.
import { expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { rng } from '../shell/rng.js';
import { WINDOW } from '../shell/taps.js';

export const FIXTURE = '/e2e/fixture.html';
export const INDEX = '/index.html';
/** "Today" in the tests, in the config's time zone (Asia/Jerusalem). */
export const NOW = new Date('2026-10-14T10:00:00+03:00');
export const TODAY = '2026-10-14';
export const YESTERDAY = '2026-10-13';
export const CHILD = 'c0000test';

/**
 * A game module by id: a registered game, else a fixture.
 * @param {string} id
 * @returns {Promise<Game>}
 */
export async function gameOf(id) {
  for (const dir of ['games', 'tests/fixtures']) {
    const url = new URL(`../${dir}/${id}/game.js`, import.meta.url);
    if (existsSync(url)) return import(url.href);
  }
  throw new Error(`no game ${id}`);
}

/**
 * The child looks before the next tap. The shell drops a tap that comes within 300 ms of a new
 * screen or of "הַבָּא" appearing (design 6.9, shell/taps.js), and a test taps faster than any
 * child, so after such a change it moves the page's clock past the window. Nothing waits: the
 * clock (installed before goto) stamps the events, and only the stamps move.
 * @param {import('@playwright/test').Page} page
 */
export const look = (page) => page.clock.runFor(WINDOW);

/** The games of games/registry.js, imported in Node. */
export async function registered() {
  return Object.values(await import('../games/registry.js'));
}

/**
 * The round on screen, rebuilt in Node from data-game, data-level, data-seed and data-structure
 * (or data-ask), with the index of the answer card.
 * @param {import('@playwright/test').Page} page
 */
export async function roundOf(page) {
  const data = await page.locator('main[data-screen="round"], main[data-screen="demo"]').evaluate((el) => ({ ...el.dataset }));
  const game = await gameOf(data.game);
  const level = { ...game.levels[Number(data.level) - 1], ...(data.structure && { structure: data.structure }), ...(data.ask && { ask: data.ask }) };
  const round = game.makeRound(level, rng(Number(data.seed)));
  const answerAt = round.choices.findIndex((c) => isDeepStrictEqual(c.value, round.answer));
  return { data, game, level, round, answerAt };
}

/**
 * The stored value (the `sifra` key), and the current child.
 * @param {import('@playwright/test').Page} page
 */
export async function stored(page) {
  const data = await page.evaluate(() => JSON.parse(localStorage.getItem('sifra') ?? 'null'));
  return { data, child: data?.children[data.current] };
}

/**
 * A stored value with one child: the given fields over an empty child.
 * @param {Record<string, any>} child
 */
export function storeWith(child) {
  const empty = { created: '2026-10-01', sessions: 0, games: {}, skills: {}, attempts: [], events: [] };
  return { schema: 1, current: CHILD, children: { [CHILD]: { ...empty, ...child } } };
}

/** A ladder out of its fast climb at a level whose demo was seen. */
export const ladderAt = (level, over = {}) =>
  ({ level, fast: null, streak: 0, window: [], passed: [], at: {}, demoSeen: [level], demoDue: null, ...over });

/** A skill's review state. */
export const skillState = (over = {}) => ({ last: null, passedDay: null, box: 0, due: null, reviewDays: [], lastReviewFirst: null, ...over });

/**
 * Puts a value in storage before the page's scripts run, once per tab (a reload keeps what the
 * app wrote).
 * @param {import('@playwright/test').Page} page
 * @param {object} value
 */
export async function seedStore(page, value) {
  await page.addInitScript((v) => {
    if (sessionStorage.getItem('seeded')) return;
    localStorage.setItem('sifra', JSON.stringify(v));
    sessionStorage.setItem('seeded', '1');
  }, value);
}

/**
 * Every element at least min x min CSS pixels.
 * @param {import('@playwright/test').Locator} locator
 * @param {number} [min]
 */
export async function expectTouchTargets(locator, min = 64) {
  for (const target of await locator.all()) {
    const box = await target.boundingBox();
    const name = await target.evaluate((el) => el.outerHTML.slice(0, 80));
    expect(box.width, name).toBeGreaterThanOrEqual(min);
    expect(box.height, name).toBeGreaterThanOrEqual(min);
  }
}

/**
 * '' when the characters of an element appear left to right in source order on each line, and
 * lines go down; else what went wrong (R7, measured per character with Range).
 * @param {import('@playwright/test').Locator} locator
 * @returns {Promise<string>}
 */
export function readsLeftToRight(locator) {
  return locator.evaluate((root) => {
    const chars = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = /** @type {Text} */ (walker.currentNode);
      for (let i = 0; i < node.data.length; i++) {
        if (!node.data[i].trim()) continue;
        const range = document.createRange();
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const r = range.getBoundingClientRect();
        if (r.width || r.height) chars.push({ c: node.data[i], x: r.left + r.width / 2, y: r.top + r.height / 2, h: r.height });
      }
    }
    for (let i = 1; i < chars.length; i++) {
      const [a, b] = [chars[i - 1], chars[i]];
      if (b.y < a.y - a.h / 2) return `"${b.c}" is on a line above "${a.c}"`;
      if (b.y - a.y <= a.h / 2 && b.x <= a.x) return `"${a.c}" then "${b.c}" read right to left`;
    }
    return '';
  });
}

/**
 * R7 on every [data-math] element: the dir attribute, computed ltr, characters left to right.
 * @param {import('@playwright/test').Page} page
 */
export async function expectMathLeftToRight(page) {
  for (const math of await page.locator('[data-math]').all()) {
    const what = await math.evaluate((el) => el.outerHTML.slice(0, 80));
    expect(await math.evaluate((el) => el.getAttribute('dir')), what).toBe('ltr');
    expect(await math.evaluate((el) => getComputedStyle(el).direction), what).toBe('ltr');
    expect(await readsLeftToRight(math), what).toBe('');
  }
}

/**
 * The screen at rest (R10): running animations only on [data-role] elements, and no delay
 * above 0.3 s outside [data-demo]. The cards unlock when a display ends, while the hint's one
 * pulse may still run (design 7.2: the hint does not lock), so finite animations in [data-hint]
 * and [data-display] are waited out first; an infinite one is not, and fails.
 * @param {import('@playwright/test').Page} page
 */
export async function expectCalm(page) {
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity && /** @type {KeyframeEffect} */ (a.effect)?.target?.closest('[data-hint], [data-display]'))
    .map((a) => a.finished.catch(() => null))));
  const problems = await page.evaluate(() => {
    const out = [];
    for (const a of document.getAnimations()) {
      const target = /** @type {KeyframeEffect} */ (a.effect)?.target;
      if (a.playState === 'running' && !target?.closest('[data-role]')) out.push(`moving: ${target?.outerHTML.slice(0, 60)}`);
    }
    const seconds = (list) => Math.max(0, ...list.split(',').map((t) => (t.trim().endsWith('ms') ? parseFloat(t) / 1000 : parseFloat(t))));
    for (const el of document.querySelectorAll('*')) {
      if (el.closest('[data-demo]')) continue;
      const style = getComputedStyle(el);
      const delay = Math.max(seconds(style.animationDelay), seconds(style.transitionDelay));
      if (delay > 0.3) out.push(`delay ${delay}s: ${el.outerHTML.slice(0, 60)}`);
    }
    return out;
  });
  expect(problems).toEqual([]);
}

/**
 * R6 [browser]: every [data-role] element shows its role token in background-color or fill
 * (removed: a hollow outline in its colour; a second known part, [data-second], the part's light
 * shade --role-part-2, design 3); only one cover kind.
 * @param {import('@playwright/test').Page} page
 */
export async function expectRoleColours(page) {
  const problems = await page.evaluate(() => {
    const probe = document.createElement('span');
    document.body.append(probe);
    const rgb = (token) => {
      probe.style.color = `var(${token})`;
      return getComputedStyle(probe).color;
    };
    const out = [];
    for (const el of document.querySelectorAll('[data-role]')) {
      const role = el.getAttribute('data-role');
      const want = rgb(role === 'part' && el.hasAttribute('data-second') ? '--role-part-2' : `--role-${role}`);
      const s = getComputedStyle(el);
      const ok = role === 'removed'
        ? [s.borderTopColor, s.outlineColor, s.stroke].includes(want)
        : [s.backgroundColor, s.fill].includes(want);
      if (!ok) out.push(`${role}: ${el.outerHTML.slice(0, 60)} has ${s.backgroundColor} / ${s.fill}, not ${want}`);
    }
    for (const el of document.querySelectorAll('[class*="cover"]')) {
      if (![...el.classList].every((c) => !c.includes('cover') || c === 'cover')) out.push(`another cover: ${el.className}`);
    }
    probe.remove();
    return out;
  });
  expect(problems).toEqual([]);
}
