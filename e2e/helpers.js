// Shared Playwright helpers (architecture 4.5). The reading and touch-target checks come from
// AlefBet's e2e helpers; rounds are rebuilt in Node from the screen's data attributes. Every spec
// imports test and expect from here, so a page that throws or logs an error fails its test.
import { test as base, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { rng } from '../shell/rng.js';
import { WINDOW } from '../shell/taps.js';

/**
 * Playwright's test with one automatic fixture, `errors`: every page of the test's context is
 * watched, and an uncaught error (pageerror) or a console.error in any of them fails the test when
 * it ends (architecture 4.5). The shell logs what it catches (a thumb or a next step that throws,
 * 3.9), so this is where a swallowed error shows. A test whose point is an error lets it through:
 * errors.allow(/its message/).
 */
export const test = base.extend({
  errors: [async ({ context }, use) => {
    /** @type {string[]} */
    const seen = [];
    /** @type {RegExp[]} */
    const allowed = [];
    /** @param {import('@playwright/test').Page} page */
    const watch = (page) => {
      page.on('pageerror', (e) => seen.push(`pageerror at ${page.url()}: ${e.stack ?? e.message}`));
      page.on('console', (m) => { if (m.type() === 'error') seen.push(`console.error at ${page.url()}: ${m.text()} (${m.location().url})`); });
    };
    context.pages().forEach(watch);
    context.on('page', watch);
    await use({ allow: (/** @type {RegExp} */ pattern) => { allowed.push(pattern); } });
    expect(seen.filter((text) => !allowed.some((p) => p.test(text))), 'errors in the page').toEqual([]);
  }, { auto: true }],
});
export { expect };

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
 * above 0.3 s outside [data-demo]. A story's event (architecture 2.4) runs from the mount with
 * the cards live, so it is waited out first, until no [data-event] is left. The cards unlock when
 * a display ends, while the hint's one pulse may still run (design 7.2: the hint does not lock),
 * and while a story's picture comes back from a display (level 3's first miss, decisions.md
 * 2026-10-31), so finite animations in the picture, [data-hint] and [data-display] are waited out
 * too, and in [data-choices] a card's own 100 ms transition (app.css .btn: a pressed card, the
 * shown card's ring); an infinite one is not, and fails.
 * @param {import('@playwright/test').Page} page
 */
export async function expectCalm(page) {
  await expect(page.locator('[data-event]'), 'a story\'s event ends').toHaveCount(0);
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity && /** @type {KeyframeEffect} */ (a.effect)?.target?.closest('[data-area="picture"], [data-hint], [data-display], [data-choices]'))
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
 * Watches the demo's hand (R9, architecture 2.6) from now until a demo screen is solved: on every frame, each tour
 * digit ([data-tour]) under the hand's box, and each card under the hand while it is at rest (no aim), visible, and a
 * hint or a tour is drawn (`onCards`); at each tap, the hand's box, the screen's height, whether a hint and
 * a tour were drawn by then, whether the hand was still on its way (a transition running on it), and the index of
 * the answer card under its tip (null for none). handSeen reads it. Call it once the page is open, before the demo
 * starts; for a demo that runs on load (a demo level), with `fromStart` before the page opens: it is then watched
 * from the page's first script, so a slow machine cannot let the hand's first tap pass before the watch begins.
 * @param {import('@playwright/test').Page} page
 * @param {{ fromStart?: boolean }} [options]
 */
export async function watchHand(page, { fromStart = false } = {}) {
  await (fromStart ? page.addInitScript(handWatch) : page.evaluate(handWatch));
}

/** watchHand's watch, run in the page (see watchHand). */
function handWatch() {
  /** @type {{ covered: string[], onCards: string[], taps: { left: number, top: number, bottom: number, screen: number, hint: boolean, tour: boolean, moving: boolean, card: number | null }[] }} */
  const seen = { covered: [], onCards: [], taps: [] };
  Object.assign(globalThis, { handSeen: seen });
  const demo = () => document.querySelector('main[data-screen="demo"]');
  /** @type {(a: DOMRect, b: DOMRect) => boolean} */
  const over = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  const frame = () => {
    const el = demo()?.querySelector('[data-hand]');
    const hand = el?.getBoundingClientRect();
    for (const digit of hand ? document.querySelectorAll('[data-tour]') : []) {
      const box = digit.getBoundingClientRect();
      if (box.width && box.height && over(hand, box)) seen.covered.push(digit.getAttribute('data-tour') ?? '');
    }
    // At rest (no aim) the hand is hidden or off the cards while the hint or the tour is drawn (hunt 2 #1).
    const resting = el instanceof HTMLElement && !el.style.transform && Number(getComputedStyle(el).opacity) >= 0.05;
    for (const card of resting && document.querySelector('[data-hint], [data-tour]') ? document.querySelectorAll('[data-choices] [data-index]') : []) {
      if (over(hand, card.getBoundingClientRect())) seen.onCards.push(card.getAttribute('data-index') ?? '');
    }
    if (!demo()?.hasAttribute('data-solved')) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  new MutationObserver((records) => {
    for (const { target, oldValue } of records) {
      if (!(target instanceof Element) || !target.matches('[data-hand].is-tapping') || oldValue?.includes('is-tapping')) continue;
      const box = target.getBoundingClientRect();
      // The tip is the middle of the hand's top edge (app.js aim()); the tap's pulse has not scaled it yet.
      const [x, y] = [box.left + box.width / 2, box.top + 1];
      const card = [...document.querySelectorAll('[data-choices] [data-index]')].find((el) => {
        const b = el.getBoundingClientRect();
        return x >= b.left && x <= b.right && y >= b.top && y <= b.bottom;
      });
      seen.taps.push({ left: Math.round(box.left), top: Math.round(box.top), bottom: Math.round(box.bottom), screen: innerHeight,
        hint: Boolean(document.querySelector('[data-hint]')), tour: Boolean(document.querySelector('[data-tour]')),
        moving: target.getAnimations().some((a) => 'transitionProperty' in a), card: card ? Number(card.getAttribute('data-index')) : null });
    }
  }).observe(document, { subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });
}

/**
 * What watchHand saw.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{ covered: string[], onCards: string[], taps: { left: number, top: number, bottom: number, screen: number, hint: boolean, tour: boolean, moving: boolean, card: number | null }[] }>}
 */
export const handSeen = (page) => page.evaluate(() => /** @type {any} */ (globalThis).handSeen);

/**
 * Every thumb on screen is drawn: none left empty, or marked data-broken, by a render that threw
 * (app.js thumb catches it so the screen still opens, architecture 3.9).
 * @param {import('@playwright/test').Page} page
 * @param {string} [where]
 */
export async function expectThumbsDrawn(page, where) {
  await expect(page.locator('[data-thumb]').first(), where).toBeAttached();
  await expect(page.locator('[data-thumb]:is([data-broken], :empty)'), where).toHaveCount(0);
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

/**
 * The dashes of round marks and the ends of arcs, read from the picture's pixels with only `which` shown (design 7.1;
 * hunt 2 #5): a round mark's edge, sampled at 48 angles on the middle of its line, holds 6 runs of its edge colour or
 * more (WebKit's dashed border left a 14-27px circle 1-3, like pie slices); an arc has ink of its colour within 2px of
 * where it takes off and where it lands (a half arc's other end is the top corner by which it leaves or comes into its
 * row). The edge is the mark's border, or its ::before's (the balance's arcs). Also how many marks it read.
 * @param {import('@playwright/test').Page} page
 * @param {string} which a selector of the marks in [data-area="picture"]
 * @returns {Promise<{ out: string[], read: number }>}
 */
export async function dashProblems(page, which) {
  const panel = page.locator('[data-area="picture"]');
  await panel.scrollIntoViewIfNeeded();
  const style = await page.addStyleTag({ content: `[data-dashes] [data-area="picture"] * { visibility: hidden !important; } [data-dashes] [data-area="picture"] :is(${which}) { visibility: visible !important; }` });
  const marks = await panel.evaluate((p, sel) => {
    document.querySelector('main')?.setAttribute('data-dashes', '');
    const P = p.getBoundingClientRect();
    return [...p.querySelectorAll(sel)].map((n) => {
      const b = n.getBoundingClientRect();
      const [own, before] = [getComputedStyle(n), getComputedStyle(n, '::before')];
      const s = parseFloat(before.borderTopWidth) > 0 ? before : own;
      return {
        name: n.className, x: b.left - P.left, y: b.top - P.top, w: b.width, h: b.height, line: parseFloat(s.borderTopWidth),
        rgb: (s.borderTopColor.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number), arc: n.matches('.st-arc, .bl-arc'), half: n.getAttribute('data-half'),
      };
    });
  }, which);
  const png = await panel.screenshot();
  await page.evaluate(() => document.querySelector('main')?.removeAttribute('data-dashes'));
  await style.evaluate((s) => s.remove());
  const width = (await panel.boundingBox())?.width ?? 1;
  const out = await page.evaluate(async ({ b64, marks, width }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = Object.assign(document.createElement('canvas'), { width: img.width, height: img.height });
    const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
    g.drawImage(img, 0, 0);
    const { data } = g.getImageData(0, 0, c.width, c.height);
    const k = img.width / width;
    const found = [];
    for (const m of marks) {
      // A pixel of the edge's colour: the ghosts' fill is about 320 away and white about 480 (the balance's ghost test).
      const ink = (x, y) => {
        const [X, Y] = [Math.floor(x * k), Math.floor(y * k)];
        if (X < 0 || Y < 0 || X >= c.width || Y >= c.height) return false;
        const i = 4 * (Y * c.width + X);
        return Math.abs(data[i] - m.rgb[0]) + Math.abs(data[i + 1] - m.rgb[1]) + Math.abs(data[i + 2] - m.rgb[2]) < 150;
      };
      const near = (x, y) => {
        for (let dy = -2; dy <= 2; dy += 1 / k) for (let dx = -2; dx <= 2; dx += 1 / k) if (dx * dx + dy * dy <= 4 && ink(x + dx, y + dy)) return true;
        return false;
      };
      const at = `${m.name} ${m.w.toFixed(1)}×${m.h.toFixed(1)} at ${Math.round(m.x)},${Math.round(m.y)}`;
      if (m.arc) {
        const [L, bottom] = [m.line, m.y + m.h - 1];
        const ends = m.half === 'out' ? [['take-off', m.x + L / 2, bottom], ['end at the top', m.x + m.w - 1, m.y + L / 2]]
          : m.half === 'in' ? [['start at the top', m.x + 1, m.y + L / 2], ['landing', m.x + m.w - L / 2, bottom]]
            : [['take-off', m.x + L / 2, bottom], ['landing', m.x + m.w - L / 2, bottom]];
        for (const [what, x, y] of ends) if (!near(x, y)) found.push(`${at}: no ink within 2px of its ${what}`);
      } else {
        const r = m.w / 2 - m.line / 2;
        const edge = Array.from({ length: 48 }, (_, i) => ink(m.x + m.w / 2 + r * Math.sin(i * Math.PI / 24), m.y + m.h / 2 - r * Math.cos(i * Math.PI / 24)));
        const runs = edge.filter((v, i) => v && !edge[(i + 47) % 48]).length;
        if (runs < 6) found.push(`${at}: ${runs} dash(es) round its edge, 6 or more wanted`);
      }
    }
    return found;
  }, { b64: png.toString('base64'), marks, width });
  return { out, read: marks.length };
}
