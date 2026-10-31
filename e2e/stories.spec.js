// The stories through the real shell (architecture 4.7, 4.9): the browser's unit and marks against
// scene.js, the glyphs inside their discs and chips and on top, the event that builds the exercise
// (a tap during it is an attempt like any other), R6's role colours, every rule's display on every
// level, and the game spec's list: a first try, three misses to the tour, the 3-option levels, every
// demo, a session to the end screen.
import { RULES } from '../data/errors.js';
import * as stories from '../games/stories/game.js';
import { ROUND, builtAt, layoutScene, len, phasesOf, planScene, storyOf, unitFor } from '../games/stories/scene.js';
import { rng } from '../shell/rng.js';
import { test, expect, INDEX, NOW, expectCalm, expectMathLeftToRight, expectRoleColours, expectThumbsDrawn, ladderAt, look, roundOf, seedStore, storeWith, stored } from './helpers.js';

const MAGENTA = 'rgb(214, 51, 108)';
const number = (id) => stories.levels.findIndex((l) => l.id === id) + 1;
const card = (page, i) => page.locator(`button[data-index="${i}"]`);
// A tour counts up to ten digits, 150 ms each, after its display: the cards may stay locked a few seconds.
const unlocked = (page) => expect(page.locator('[data-choices]')).not.toHaveAttribute('data-locked', { timeout: 10000 });
const lastAttempt = async (page) => (await stored(page)).child.attempts.at(-1);
const wrongOf = (round) => round.choices.flatMap((c, i) => (c.rule ? [i] : []));
const draw = (page) => page.locator('[data-area="picture"] .st-draw');

/**
 * The first seed of a level whose round passes a test (in Node, as the shell deals it).
 * @param {string} id
 * @param {(round: any) => boolean} ok
 * @param {string} [structure] the mixed level's story
 */
function seedOf(id, ok, structure) {
  const level = { ...stories.levels[number(id) - 1], ...(structure && { structure }) };
  for (let seed = 1; seed < 5000; seed++) if (ok(stories.makeRound(level, rng(seed)))) return seed;
  throw new Error(`no ${id} round`);
}
/** @type {(id: string, s: number, k: number, structure?: string) => number} */
const storySeed = (id, s, k, structure) => seedOf(id, (r) => r.story.s === s && r.story.k === k, structure);

let visits = 0;
/**
 * One round of #/dev (nothing stored) at a fixed seed; the mixed level's story after it.
 * @param {import('@playwright/test').Page} page
 * @param {string} id
 * @param {number} seed
 * @param {string} [structure]
 */
async function devAt(page, id, seed, structure) {
  visits += 1;
  if (visits === 1 || !page.url().includes('?')) await page.clock.install({ time: NOW });
  // A new query each time, so the page loads afresh even on the same round.
  await page.goto(`${INDEX}?v=${visits}#/dev/stories/${number(id)}/${seed}${structure ? `/${structure}` : ''}`);
  await expect(page.locator('[data-choices]')).toBeVisible();
  await look(page);
  return roundOf(page);
}

/**
 * Opens a play session with the ladder at a level whose demo was seen (random seeds; the round is
 * rebuilt from the screen).
 * @param {import('@playwright/test').Page} page
 * @param {string} id
 * @param {object} [over]
 */
async function playAt(page, id, over = {}) {
  await seedStore(page, storeWith({ games: { stories: ladderAt(id, over) } }));
  await page.clock.install({ time: NOW });
  await page.goto(`${INDEX}#/play/stories`);
  await expect(page.locator('main[data-screen="round"], main[data-screen="demo"]')).toBeVisible();
  await look(page);
  return roundOf(page);
}

// ---------- Calibration: the browser draws scene.js's numbers (architecture 4.9) ----------

/** The panel's content box at a viewport (app.css .panel, design 5), as tests/stories.test.js has it. */
const clamp = (lo, x, hi) => Math.min(hi, Math.max(lo, x));
const stageOf = ([vw, vh]) => {
  const pad = clamp(8, 0.03 * vw, 16);
  return [Math.min(vw, 592) - 32 - 2 * pad, clamp(200, 0.4 * vh, 380) - 2 * pad];
};

/**
 * The drawing in the page: --u (a probe as wide as it), and each mark's node (data-id) as a box
 * from the drawing's corner. A transformed node (the tour's last digit grows) gives its middle only.
 * @param {import('@playwright/test').Page} page
 */
const drawn = (page) => draw(page).evaluate((d) => {
  const probe = document.createElement('span');
  probe.style.cssText = 'position: absolute; width: var(--u); height: 0;';
  d.append(probe);
  const u = probe.getBoundingClientRect().width;
  probe.remove();
  const o = d.getBoundingClientRect();
  const nodes = [...d.querySelectorAll('[data-id]')].map((el) => {
    const b = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    const moved = s.transform !== 'none' || s.scale !== 'none';
    return { id: el.getAttribute('data-id'), x: b.left - o.left, y: b.top - o.top, w: b.width, h: b.height, moved, balloon: el.getAttribute('data-shape') === 'balloon' };
  });
  return { u, nodes };
});

/**
 * What differs between the page's drawing and scene.js's layout of the same state: the unit by
 * more than 0.25px, a node with no mark or a mark with no node, a box by more than 1px.
 * @param {import('@playwright/test').Page} page
 * @param {any} round
 * @param {any} state planScene's state, as view.js passes it
 * @param {[number, number]} vp
 * @param {string[]} want ids that must be drawn
 */
async function calibrate(page, round, state, vp, want) {
  const L = layoutScene(planScene(round, state), ROUND);
  const [W, H] = stageOf(vp);
  const { u, nodes } = await drawn(page);
  const out = [];
  const node = unitFor(L, W, H);
  if (Math.abs(u - node) > 0.25) out.push(`--u ${u.toFixed(3)} in the page, ${node.toFixed(3)} in Node`);
  const marks = new Map(L.marks.filter((m) => m.kind !== 'qmark').map((m) => [m.id, m]));
  for (const n of nodes) {
    const m = marks.get(n.id);
    if (!m) { out.push(`${n.id}: drawn, not in the layout`); continue; }
    marks.delete(n.id);
    const [x, y, w] = [len(m.box.x, u), len(m.box.y, u), len(m.box.w, u)];
    // A balloon's node is its disc (game.css): as tall as wide; its string hangs below it.
    const h = n.balloon ? w : len(m.box.h, u);
    const off = n.moved
      ? [Math.abs(n.x + n.w / 2 - x - w / 2), Math.abs(n.y + n.h / 2 - y - h / 2)]
      : [n.x - x, n.y - y, n.w - w, n.h - h].map(Math.abs);
    if (Math.max(...off) > 1) out.push(`${n.id}: ${[n.x, n.y, n.w, n.h].map((v) => v.toFixed(1))} in the page, ${[x, y, w, h].map((v) => v.toFixed(1))} in Node`);
  }
  for (const id of marks.keys()) out.push(`${id}: in the layout, not drawn`);
  for (const id of want) if (!nodes.some((n) => n.id === id)) out.push(`${id}: not drawn`);
  return out;
}

// Two rounds, each through rest, op.other's four-row overflow (design 7.3), the hint, the tour and the
// closing: 10 − 9 = ? (a visible run: the wrap and its dome, the outlines; overflow 19 from place 0)
// and 5 + ? = 9 (level 3: the chips, the fixed dome, the whole's outline; overflow 14 from place 5;
// the hint's stretched cover and its dashed places, the fixed dome lifted; the four it hid). Ids that must be drawn in each.
const CALIBRATED = [
  { id: 'take-10', s: 10, k: 9, rest: ['obj-0', 'out-9', 'dome', 'wrap-0'], overflow: ['obj-0', 'ghost-1', 'ghost-18', 'ring-0'], hint: ['wrap-0'], tour: ['digit-0', 'dome'], solved: ['answer', 'digit-0', 'wrap-0'] },
  { id: 'add-change', s: 5, k: 4, rest: ['obj-0', 'lid', 'chip-start', 'chip-whole', 'whole-0'], overflow: ['obj-4', 'ghost-5', 'ghost-18', 'ring-18', 'chip-whole'], hint: ['cover-0', 'chip-start', 'chip-whole'], tour: ['obj-5', 'digit-8'], solved: ['obj-8', 'chip-whole', 'whole-0'] },
];
for (const vp of /** @type {[number, number][]} */ ([[320, 568], [568, 320], [390, 844]])) {
  test(`${vp.join('×')}: --u and every mark where scene.js puts them, at rest, in a four-row overflow, at the hint, in the tour and solved (10 − 9 = ?, 5 + ? = 9)`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: vp[0], height: vp[1] });
    for (const c of CALIBRATED) {
      const { round } = await devAt(page, c.id, storySeed(c.id, c.s, c.k));
      const where = (/** @type {string} */ state) => `${c.id} ${c.s}, ${c.k} ${state}`;
      expect(await calibrate(page, round, 'rest', vp, c.rest), where('at rest')).toEqual([]);
      // op.other first, its display; with reduced motion a later miss skips its display: the hint, then the tour.
      const wrong = wrongOf(round).sort((a, b) => Number(round.choices[b].rule === 'op.other') - Number(round.choices[a].rule === 'op.other'));
      const { value } = round.choices[wrong[0]];
      await card(page, wrong[0]).click();
      await expect(draw(page)).toHaveAttribute('data-display', 'overflow');
      expect(planScene(round, { display: 'overflow', rule: 'op.other', value }).rows, where(`overflow ${value}`)).toBe(4);
      expect(await calibrate(page, round, { display: 'overflow', rule: 'op.other', value }, vp, c.overflow), where(`overflow ${value}`)).toEqual([]);
      await card(page, wrong[1]).click();
      await expect(draw(page)).toHaveAttribute('data-hint', '');
      expect(await calibrate(page, round, { hint: true }, vp, c.hint), where('at the hint')).toEqual([]);
      await card(page, wrong[2]).click();
      await expect(page.locator('[data-tour]')).toHaveText(tourOf(round));
      const tour = tourOf(round).length;
      expect(await calibrate(page, round, { hint: true, tour }, vp, c.tour), where('in the tour')).toEqual([]);
      await card(page, round.choices.findIndex((ch) => !ch.rule)).click();
      await expect(page.locator('[data-next]')).toBeVisible();
      expect(await calibrate(page, round, { hint: true, tour, solved: true }, vp, c.solved), where('solved')).toEqual([]);
    }
  });
}

// ---------- Glyphs: inside their discs and chips, and on top (design 6.10, architecture 4.9) ----------

/**
 * In the drawing: each digit's and chip's text (its Range rect, transforms included) inside its own
 * box, untransformed, by 0.5px (the tour's last digit grows past its disc on purpose: its ink is
 * checked by inkProblems); and each digit, chip, dome and cover '?' topmost where it stands, by
 * elementFromPoint with every painted node taking hits (e2e/ten-frame.spec.js, paintedOver).
 * @param {import('@playwright/test').Page} page
 * @param {string} where
 */
const glyphProblems = (page, where) => draw(page).evaluate((d, at) => {
  const out = [];
  // elementFromPoint looks in the viewport: the drawing in it (a tap on a card may have scrolled the page).
  d.scrollIntoView({ block: 'nearest' });
  const name = (n) => `${at}: ${n.getAttribute('data-id') ?? n.parentElement?.getAttribute('data-id')} "${n.textContent}"`;
  const hidden = (n) => {
    for (let e = n; e && e !== d; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return true;
    }
    return false;
  };
  const probe = document.createElement('span');
  probe.style.cssText = 'position: absolute; width: var(--u); height: 0;';
  d.append(probe);
  const u = probe.getBoundingClientRect().width;
  probe.remove();
  const texts = [...d.querySelectorAll('.st-digit, .st-chip')].filter((n) => !hidden(n));
  for (const el of texts) {
    if (el.classList.contains('is-grow')) continue;
    const range = document.createRange();
    range.selectNodeContents(el);
    const t = range.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    const [w, h, cx, cy] = [parseFloat(s.width), parseFloat(s.height), b.left + b.width / 2, b.top + b.height / 2];
    const over = Math.max(cx - w / 2 - t.left, cy - h / 2 - t.top, t.right - cx - w / 2, t.bottom - cy - h / 2);
    if (over > 0.5) out.push(`${name(el)}: its text ${over.toFixed(2)}px out of its box`);
  }
  // Topmost: while it looks, every node with a fill or text of its own takes hits, a hollow one none.
  const covers = [...d.querySelectorAll('.cover[data-mark="?"]')].filter((n) => !hidden(n));
  const hollow = (n) => {
    const s = getComputedStyle(n);
    return /^(transparent|rgba\(.*,\s*0\))$/.test(s.backgroundColor) && ![...n.childNodes].some((c) => c.nodeType === Node.TEXT_NODE && c.textContent?.trim());
  };
  const misses = [...d.querySelectorAll('*')].filter((n) => hollow(n) || hidden(n));
  const style = document.createElement('style');
  style.textContent = '[data-hit] * { pointer-events: auto !important; } [data-hit] [data-miss] { pointer-events: none !important; }';
  document.head.append(style);
  for (const n of misses) n.setAttribute('data-miss', '');
  d.setAttribute('data-hit', '');
  for (const el of [...texts, ...covers]) {
    const b = el.getBoundingClientRect();
    // A stretched cover's '?' stands on its first place (game.css), a dome's in its middle.
    const x = el.parentElement?.classList.contains('st-piece') ? b.left + u / 2 : b.left + b.width / 2;
    const hit = document.elementFromPoint(x, b.top + b.height / 2);
    if (!el.contains(hit)) out.push(`${name(el)} under ${hit?.getAttribute('data-id') ?? hit?.className}`);
  }
  d.removeAttribute('data-hit');
  for (const n of misses) n.removeAttribute('data-miss');
  style.remove();
  return out;
}, where);

/**
 * The ink of each two-digit number and of the tour's grown last digit on an object, read from the
 * page's pixels (the digit alone, black on white): inside its disc, a rectangle in a circle, its
 * corners 1px clear (design 6.10; tests/stories.test.js holds the same with GLYPH's measured ink).
 * Also the texts it read, so a test can tell that it read the digits it is there for.
 * @param {import('@playwright/test').Page} page
 * @param {string} where
 */
async function inkProblems(page, where) {
  const out = [];
  const read = [];
  const digits = await page.locator('[data-area="picture"] .st-digit:is(.is-two, .is-grow)').all();
  const style = await page.addStyleTag({ content: '[data-ink] [data-area="picture"] { background: #fff !important; } [data-ink] [data-area="picture"] * { visibility: hidden !important; } [data-ink] [data-ink-at] { visibility: visible !important; color: #000 !important; text-shadow: none !important; } [data-ink] [data-ink-at]::before { display: none !important; }' });
  for (const digit of digits) {
    // The clip is in the viewport: the panel in it (a tap on a card may have scrolled the page).
    await digit.scrollIntoViewIfNeeded();
    const geo = await digit.evaluate((n) => {
      n.setAttribute('data-ink-at', '');
      document.querySelector('main')?.setAttribute('data-ink', '');
      const b = n.getBoundingClientRect();
      const s = getComputedStyle(n);
      return { text: n.textContent, cx: b.left + b.width / 2, cy: b.top + b.height / 2, w: parseFloat(s.width), h: parseFloat(s.height) };
    });
    // Room round the disc, so ink that leaves it shows.
    const pad = 8;
    const clip = { x: geo.cx - geo.w / 2 - pad, y: geo.cy - geo.h / 2 - pad, width: geo.w + 2 * pad, height: geo.h + 2 * pad };
    const png = await page.screenshot({ clip });
    await digit.evaluate((n) => {
      n.removeAttribute('data-ink-at');
      document.querySelector('main')?.removeAttribute('data-ink');
    });
    const ink = await page.evaluate(async (b64) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement('canvas');
      [c.width, c.height] = [img.width, img.height];
      const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
      g.drawImage(img, 0, 0);
      const { data } = g.getImageData(0, 0, c.width, c.height);
      let [x0, y0, x1, y1] = [Infinity, Infinity, -1, -1];
      for (let y = 0; y < c.height; y++) {
        for (let x = 0; x < c.width; x++) {
          const i = 4 * (y * c.width + x);
          if (data[i] + data[i + 1] + data[i + 2] < 3 * 128) [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x + 1), Math.max(y1, y + 1)];
        }
      }
      return { x0, y0, x1, y1, w: c.width, h: c.height };
    }, png.toString('base64'));
    read.push(geo.text);
    const at = `${where}: "${geo.text}" on a ${geo.w.toFixed(2)}px disc`;
    if (ink.x1 < 0) { out.push(`${at}: no ink`); continue; }
    const k = ink.w / clip.width;
    // Corners from the disc's middle, in CSS px.
    const xs = [ink.x0 / k - pad - geo.w / 2, ink.x1 / k - pad - geo.w / 2];
    const ys = [ink.y0 / k - pad - geo.h / 2, ink.y1 / k - pad - geo.h / 2];
    const far = Math.max(...xs.flatMap((x) => ys.map((y) => Math.hypot(x, y))));
    if (far > geo.w / 2 - 1) out.push(`${at}: its ink (${(xs[1] - xs[0]).toFixed(1)} × ${(ys[1] - ys[0]).toFixed(1)}) reaches ${far.toFixed(2)}px from the middle, ${(geo.w / 2 - 1).toFixed(2)} allowed`);
  }
  await style.evaluate((s) => s.remove());
  return { out, read };
}

/**
 * A round's wrong cards in the order given, then the answer, each step checked (glyphProblems, and
 * inkProblems at the first miss and in the tour). With reduced motion: the first miss shows its
 * display, a later one the hint, the third the tour. Also the digits whose ink was read, at the
 * first miss and in the tour.
 * @param {import('@playwright/test').Page} page
 * @param {any} round
 * @param {string[]} rules
 */
async function glyphsThrough(page, round, rules) {
  const key = `${round.story.s} ${round.structure === 'change-take' ? '−' : '+'} ${round.story.k}`;
  const out = [...await glyphProblems(page, `${key} at rest`)];
  /** @type {string[][]} */
  const inked = [];
  for (const [m, rule] of rules.entries()) {
    const i = round.choices.findIndex((c) => c.rule === rule);
    await card(page, i).click();
    await unlocked(page);
    if (m === 0) await expect(draw(page)).toHaveAttribute('data-display', RULES[rule].display);
    const where = `${key}, card ${round.choices[i].value} (${rule})`;
    out.push(...await glyphProblems(page, where));
    if (m === 0 || m === 2) {
      const ink = await inkProblems(page, where);
      out.push(...ink.out);
      inked.push(ink.read);
    }
  }
  await card(page, round.choices.findIndex((c) => !c.rule)).click();
  await expect(page.locator('[data-next]')).toBeVisible();
  out.push(...await glyphProblems(page, `${key} solved`));
  return { out, inked };
}

test('568×320, the floor of the digits: 9 + 1 in the basket, the count-up of 11 (u 22.3px) and the tour\'s 10; 6 + ? = 10\'s jumps, chips and covers; 6 − 3\'s jumps back', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 568, height: 320 });
  const problems = [];
  // The narrowest state with digits (architecture 4.9): 10 and 11 on dots of 22.3px.
  const basket = await devAt(page, 'whole-10', storySeed('whole-10', 9, 1));
  expect(basket.round.choices.map((c) => c.rule)).toEqual(['op.other', 'given.part', null, 'slip.near']);
  const nine = await glyphsThrough(page, basket.round, ['slip.near', 'op.other', 'given.part']);
  problems.push(...nine.out);
  // Level 3: the chips 6 and 10, the fixed dome's '?', the jumps from 1 (k + 1 = 5), the stretched cover's '?', the tour on the lifted places.
  const change = await devAt(page, 'add-change', storySeed('add-change', 6, 4));
  const six = await glyphsThrough(page, change.round, ['count.start-included', 'given.whole', 'given.part']);
  problems.push(...six.out);
  // Take: counting back from the last leaver (6, 5, 4), landing on the first outline.
  const take = await devAt(page, 'take-10', seedOf('take-10', (r) => r.story.s === 6 && r.story.k === 3));
  const back = await glyphsThrough(page, take.round, ['count.start-included', 'op.other', 'given.whole']);
  problems.push(...back.out);
  expect(problems).toEqual([]);
  // The ink was read where it is tight: 10 and 11 in the count-up, the tour's grown last digit.
  expect(nine.inked, '9 + 1').toEqual([['10', '11'], ['10']]);
  expect(six.inked, '6 + ? = 10').toEqual([[], ['4']]);
  expect(back.inked, '6 − 3').toEqual([[], ['3']]);
});

// ---------- The event: the story first, then its '?'; the exercise built with it (design 6.10, architecture 2.4) ----------

// The tests hold the event at each phase: its animations start paused, and step() finishes the
// running ones, so the next phase starts, paused too (e2e/fixtures.spec.js's story fixture).
const HOLD = '[data-event] * { animation-play-state: paused !important; }';
const step = (page) => page.evaluate(() => {
  for (const a of document.querySelector('[data-event]')?.getAnimations({ subtree: true }) ?? []) a.finish();
});

/**
 * Cold-loads a hash with every event held (HOLD is in the page before its scripts run).
 * @param {import('@playwright/test').Page} page
 * @param {string} hash
 */
async function holdAt(page, hash) {
  await page.clock.install({ time: NOW });
  await page.addInitScript((css) => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    document.adoptedStyleSheets = [sheet];
  }, HOLD);
  await page.goto(`${INDEX}${hash}`);
  await expect(page.locator('main[data-screen="round"]')).toBeVisible();
  await look(page);
  return roundOf(page);
}

/** The event's phase, the equation row (aria-busy, the tokens shown by index, each box and the row's) and whether the picture has its '?'. */
const now = (page) => page.evaluate(() => {
  const row = /** @type {HTMLElement} */ (document.querySelector('[data-area="equation"] .eq'));
  const box = (el) => { const b = el.getBoundingClientRect(); return [b.x, b.y, b.width, b.height].map((v) => Math.round(v * 10) / 10).join(' '); };
  return {
    phase: document.querySelector('[data-area="picture"] [data-event]')?.getAttribute('data-event') ?? null,
    busy: row.getAttribute('aria-busy'),
    shown: [...row.children].flatMap((t, i) => (getComputedStyle(t).visibility === 'visible' ? [i] : [])),
    boxes: [row, ...row.children].map(box),
    q: document.querySelector('[data-area="picture"] .cover[data-mark="?"]') !== null,
  };
});

// Each kind of event: arrivals (to 5, balloons), the fixed dome then its '?' (reversed: the row grows
// from its right), the morph then the leavers (reversed), the basket's morph alone, the mixed take.
const EVENTS = [
  ['add-5', () => storySeed('add-5', 2, 3)],
  ['add-change', () => seedOf('add-change', (r) => r.eqform === 'reversed')],
  ['take-10', () => seedOf('take-10', (r) => r.eqform === 'reversed' && r.story.verb === 'fly')],
  ['whole-10', () => seedOf('whole-10', (r) => r.eqform === 'reversed')],
  ['mixed-10', () => seedOf('mixed-10', (r) => r.story.verb === 'pop', 'change-take'), 'change-take'],
];
for (const [id, seed, structure] of /** @type {[string, () => number, string?][]} */ (EVENTS)) {
  test(`${id}${structure ? ` (${structure})` : ''}: the exercise is built with the event, in story order, and never moves; its '?' never before the picture's`, async ({ page }) => {
    const { round } = await holdAt(page, `#/dev/stories/${number(id)}/${seed()}${structure ? `/${structure}` : ''}`);
    const tokens = [...round.equation.left, '=', ...round.equation.right];
    const all = tokens.map((_, i) => i);
    const first = await now(page);
    const seen = [];
    let before = /** @type {number[]} */ ([]);
    for (let at = first; at.phase; ) {
      seen.push(at.phase);
      const want = builtAt(round, at.phase) ?? all;
      expect(at, at.phase).toMatchObject({ shown: want, busy: want.length < all.length ? 'true' : null, boxes: first.boxes });
      // In story order: the start's number from the first phase on, and a token once shown stays.
      expect(at.shown, at.phase).toContain(tokens.indexOf(round.story.s));
      expect(at.shown, at.phase).toEqual(expect.arrayContaining(before));
      before = at.shown;
      if (at.shown.includes(tokens.indexOf('?'))) expect(at.q, `${at.phase}: the picture's '?' first`).toBe(true);
      await step(page);
      const was = at.phase;
      await expect.poll(async () => (await now(page)).phase).not.toBe(was);
      at = await now(page);
    }
    // The first phase, the still 'before', has nothing that moves and ends at once; so may the last,
    // where nothing new enters (the basket's). The morph, and each phase that builds a token, are held
    // until step(): every round here has one, so the loop above ran at least once.
    const phases = phasesOf(round).slice(1);
    expect(seen).toEqual(phases.filter((p) => seen.includes(p)));
    const held = phases.filter((p, i) => p === 'event:M' || JSON.stringify(builtAt(round, p)) !== JSON.stringify(builtAt(round, phasesOf(round)[i])));
    expect(held.length, 'a phase that moves').toBeGreaterThan(0);
    expect(seen).toEqual(expect.arrayContaining(held));
    expect(await now(page)).toMatchObject({ phase: null, busy: null, shown: all, boxes: first.boxes, q: true });
  });
}

test('a wrong tap during the event finishes it and is a miss like any other: its display, the row whole; the record lists it', async ({ page }) => {
  await seedStore(page, storeWith({ games: { stories: ladderAt('take-10') } }));
  const { round, answerAt } = await holdAt(page, '#/play/stories');
  expect((await now(page)).phase).toMatch(/^event:/);
  const [i] = wrongOf(round);
  await card(page, i).click();
  await expect(draw(page)).toHaveAttribute('data-display', RULES[round.choices[i].rule].display);
  await expect(page.locator('[data-event]')).toHaveCount(0);
  expect(await now(page)).toMatchObject({ busy: null, shown: [0, 1, 2, 3, 4], q: true });
  await unlocked(page);
  await card(page, answerAt).click();
  await expect(page.locator('[data-next]')).toBeVisible();
  expect(await lastAttempt(page)).toMatchObject({ game: 'stories', levelId: 'take-10', outcome: 'help', wrong: [round.choices[i].rule] });
});

test('a right tap during the event finishes it and solves the round on a first try', async ({ page }) => {
  await seedStore(page, storeWith({ games: { stories: ladderAt('add-10') } }));
  const { round, answerAt } = await holdAt(page, '#/play/stories');
  expect((await now(page)).phase).toMatch(/^event:/);
  await card(page, answerAt).click();
  await expect(page.locator('main[data-screen="round"]')).toHaveAttribute('data-solved', '');
  await expect(page.locator('[data-event]')).toHaveCount(0);
  expect(await now(page)).toMatchObject({ busy: null, shown: [0, 1, 2, 3, 4] });
  await expect(page.locator('.st-chip[data-tone="unknown"]')).toHaveText(String(round.answer));
  await expect(page.locator('[data-next]')).toBeFocused();
  expect(await lastAttempt(page)).toMatchObject({ game: 'stories', levelId: 'add-10', outcome: 'first', wrong: [], answer: round.answer });
});

test('reduced motion: the end of the event at once, the row whole; a tap is taken right after a miss, and the hint comes at once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { round, answerAt } = await playAt(page, 'add-change');
  await expect(page.locator('[data-event]')).toHaveCount(0);
  expect(await now(page)).toMatchObject({ busy: null, shown: [0, 1, 2, 3, 4], q: true });
  await expect(page.locator('.st-lid .cover')).toHaveAttribute('data-mark', '?');
  // The start's chip and the whole's, in reading order (which comes first depends on where the dome stands).
  await expect(page.locator('.st-chip')).toHaveCount(2);
  expect((await page.locator('.st-chip').allTextContents()).sort()).toEqual([String(round.story.s), String(round.story.r)].sort());
  const wrong = wrongOf(round);
  await card(page, wrong[0]).click();
  await card(page, wrong[1]).click();
  await expect(draw(page)).toHaveAttribute('data-hint', '');
  await expect(page.locator('[data-display]')).toHaveCount(0);
  await card(page, answerAt).click();
  await expect(page.locator('[data-next]')).toBeVisible();
  expect(await lastAttempt(page)).toMatchObject({ outcome: 'help', wrong: wrong.slice(0, 2).map((i) => round.choices[i].rule) });
});

// ---------- R6 [browser] (rules.md R6, design 3 and 6.10) ----------

test('R6: the start yellow, add and take alike; arrivals in --role-added with a solid edge; a leaver a hollow --role-removed outline; the basket\'s second part --role-part-2; level 3\'s unknown magenta when solved', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const token = (name) => page.evaluate((t) => {
    const probe = document.createElement('span');
    probe.style.color = `var(${t})`;
    document.body.append(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  }, name);
  const colours = (locator) => locator.evaluateAll((els) => els.map((el) => {
    const s = getComputedStyle(el);
    return { fill: s.backgroundColor, edge: s.boxShadow, border: `${s.borderTopStyle} ${s.borderTopColor}`, opacity: s.opacity };
  }));
  // 4 + 5 = ?: four yellow, five arrived.
  await devAt(page, 'add-10', storySeed('add-10', 4, 5));
  const [part, part2, partEdge, added, addedEdge, removed] = await Promise.all(['--role-part', '--role-part-2', '--role-part-edge', '--role-added', '--role-added-edge', '--role-removed'].map(token));
  expect(await colours(page.locator('.st-obj[data-role="part"]'))).toEqual(Array(4).fill(expect.objectContaining({ fill: part, edge: `${partEdge} 0px 0px 0px 3px inset` })));
  expect(await colours(page.locator('.st-obj[data-role="added"]'))).toEqual(Array(5).fill(expect.objectContaining({ fill: added, edge: `${addedEdge} 0px 0px 0px 3px inset` })));
  await expectRoleColours(page);
  // 5 − 2 = ?: three stay yellow (the colour never tells the operation), two outlines, hollow.
  await devAt(page, 'take-5', storySeed('take-5', 5, 2));
  expect(await colours(page.locator('.st-obj[data-role="part"]'))).toEqual(Array(3).fill(expect.objectContaining({ fill: part })));
  expect(await colours(page.locator('.st-outline[data-role="removed"]'))).toEqual(Array(2).fill(expect.objectContaining({ fill: 'rgba(0, 0, 0, 0)', border: `solid ${removed}` })));
  await expectRoleColours(page);
  // The mixed take: the same.
  await devAt(page, 'mixed-10', storySeed('mixed-10', 8, 3, 'change-take'), 'change-take');
  await expect(page.locator('.st-obj[data-role="part"]')).toHaveCount(5);
  await expect(page.locator('.st-outline[data-role="removed"]')).toHaveCount(3);
  await expectRoleColours(page);
  // 3 + 4 in the basket: the second part in the light shade, with the part's edge.
  await devAt(page, 'whole-10', storySeed('whole-10', 3, 4));
  expect(await colours(page.locator('.st-obj[data-role="part"]:not([data-second])'))).toEqual(Array(3).fill(expect.objectContaining({ fill: part })));
  expect(await colours(page.locator('.st-obj[data-role="part"][data-second]'))).toEqual(Array(4).fill(expect.objectContaining({ fill: part2, edge: `${partEdge} 0px 0px 0px 3px inset` })));
  await expectRoleColours(page);
  // 4 + ? = 7, solved: the dome lifts, the three it hid in magenta; the chips stay.
  const { round, answerAt } = await devAt(page, 'add-change', storySeed('add-change', 4, 3));
  await expect(page.locator('.st-obj[data-role="unknown"]')).toHaveCount(0);
  await card(page, answerAt).click();
  await expect(page.locator('[data-next]')).toBeVisible();
  expect(await colours(page.locator('.st-obj[data-role="unknown"]'))).toEqual(Array(round.answer).fill(expect.objectContaining({ fill: MAGENTA, opacity: '1' })));
  await expect(page.locator('.st-chip')).toHaveCount(2);
  await expectRoleColours(page);
  // No unknown drawn hollow: take-change, where one would be, is not in v1 (pedagogy 6.4).
  expect(stories.levels.some((l) => l.structure === 'change-take' && l.unknown === 'change')).toBe(false);
});

// ---------- The game spec (architecture 4.7) ----------

/**
 * The hint (design 7.3): the start's chip over its first object (add, the basket); the outlines grey
 * (take); on level 3 the stretched cover with the dashed places it hides.
 * @param {import('@playwright/test').Page} page
 * @param {any} round
 */
async function expectHint(page, round) {
  const { kind, s, k } = storyOf(round);
  await expect(draw(page)).toHaveAttribute('data-hint', '');
  if (kind === 'change') {
    await expect(page.locator('.st-dash')).toHaveCount(k);
    await expect(page.locator('.st-piece .cover[data-mark="?"]')).toHaveCount(1);
  } else if (kind === 'take') await expect(page.locator('.st-outline[data-faded]')).toHaveCount(k);
  else await expect(page.locator('.st-chip[data-id="chip-hint"]')).toHaveText(String(s));
}
/** @type {(round: any) => string[]} the tour's digits (R5): on from the start's chip, or from 1 on what stayed or on the change; the last the answer */
const tourOf = (round) => {
  const { kind, s } = storyOf(round);
  const from = kind === 'add' || kind === 'basket' ? s + 1 : 1;
  return Array.from({ length: round.answer - from + 1 }, (_, j) => String(from + j));
};

// Every rule's display on every level (each story of the mixed one), at a round chosen in Node so
// that together they deal every rule and every display: one wrong card per fresh load, its card gone
// with its slot kept, its display drawn where scene.js puts it (on a 3-option level with the hint).
const DEALT = (() => {
  const seen = new Set();
  return stories.levels.flatMap((l) => [l.structure].flat().map((structure) => {
    const level = { ...l, structure };
    let best = { seed: 1, fresh: -1 };
    for (let seed = 1; seed <= 300; seed++) {
      const fresh = stories.makeRound(level, rng(seed)).choices.filter((c) => c.rule && !seen.has(`${structure} ${c.rule}`)).length;
      if (fresh > best.fresh) best = { seed, fresh };
    }
    for (const c of stories.makeRound(level, rng(best.seed)).choices) if (c.rule) seen.add(`${structure} ${c.rule}`);
    return { id: l.id, seed: best.seed, structure: Array.isArray(l.structure) ? structure : undefined };
  }));
})();

test('the rounds of the display tests deal every rule of the game and every display it draws', () => {
  const dealt = DEALT.flatMap(({ id, seed, structure }) => {
    const level = { ...stories.levels[number(id) - 1], ...(structure && { structure }) };
    return stories.makeRound(level, rng(seed)).choices.flatMap((c) => (c.rule ? [c.rule] : []));
  });
  expect([...new Set(dealt)].sort()).toEqual(Object.keys(stories.rules).sort());
  expect([...new Set(dealt.map((rule) => RULES[rule].display))].sort()).toEqual([...stories.displays].sort());
});

for (const { id, seed, structure } of DEALT) {
  test(`${id}${structure ? ` (${structure})` : ''}: each wrong card's display, drawn where scene.js puts it; the card goes with its slot kept`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const vp = /** @type {{ width: number, height: number }} */ (page.viewportSize());
    const level = stories.levels[number(id) - 1];
    const round = stories.makeRound({ ...level, ...(structure && { structure }) }, rng(seed));
    for (const i of wrongOf(round)) {
      await devAt(page, id, seed, structure);
      const { value, rule } = round.choices[i];
      const display = RULES[rule].display;
      const where = `${id} ${JSON.stringify(round.story)}, card ${value} (${rule})`;
      const slot = await card(page, i).boundingBox();
      await card(page, i).click();
      await expect(card(page, i), where).toHaveClass(/is-retired/);
      expect(await card(page, i).boundingBox(), where).toEqual(slot);
      await expect(draw(page), where).toHaveAttribute('data-display', display);
      if (level.options === 3) await expect(draw(page), where).toHaveAttribute('data-hint', '');
      else await expect(draw(page), where).not.toHaveAttribute('data-hint');
      // What each display adds (design 7.3): rings or ghosts; a ring (or a chip's); digits 1 to the value; arcs and the value's digit.
      const has = (sel) => expect(page.locator(`[data-area="picture"] ${sel}`), `${where}: ${sel}`).not.toHaveCount(0);
      if (display === 'overflow') await has(':is(.st-ghost, .st-ring)');
      else if (display === 'flash') await has(':is(.st-ring, .st-chip[data-ring])');
      else if (display === 'count-up') await expect(page.locator('.st-digit'), where).toHaveText(Array.from({ length: value }, (_, j) => String(j + 1)));
      else {
        await has('.st-arc');
        await expect(page.locator('.st-digit', { hasText: new RegExp(`^${value}$`) }), where).toHaveCount(1);
      }
      expect(await calibrate(page, round, { display, rule, value, hint: level.options === 3 }, [vp.width, vp.height], []), where).toEqual([]);
    }
  });
}

for (const id of ['add-10', 'add-change', 'mixed-10']) {
  test(`${id}, a first try: the story, then the answer; the full exercise, the answer in magenta in the picture, "הַבָּא" in the cards' place`, async ({ page }) => {
    const { round, answerAt } = await playAt(page, id);
    const { kind, k } = storyOf(round);
    await expect(page.locator('[data-event]')).toHaveCount(0);
    await expect(page.locator('.st-draw .cover[data-mark="?"]')).toHaveCount(1);
    await expectMathLeftToRight(page);
    await card(page, answerAt).click();
    await expect(page.locator('main[data-screen="round"]')).toHaveAttribute('data-solved', '');
    const answer = page.locator('.eq-answer');
    await expect(answer).toHaveText(String(round.answer));
    await expect(answer).toHaveCSS('color', MAGENTA);
    await expect(page.locator('[data-area="equation"] .eq')).toHaveText(`${round.equation.left.join('')}=${round.equation.right.join('')}`.replace('?', String(round.answer)));
    if (kind === 'change') {
      // The dome lifts; what it hid shows in magenta, the chips stay.
      await expect(page.locator('.st-lid')).toHaveCount(0);
      for (const obj of await page.locator('.st-obj[data-role="unknown"]').all()) await expect(obj).toHaveCSS('opacity', '1');
      await expect(page.locator('.st-obj[data-role="unknown"]')).toHaveCount(round.answer);
    } else {
      // The small dome lifts, and in its place the answer's chip, in magenta; the objects keep their colours.
      await expect(page.locator('.st-dome')).toHaveCount(0);
      await expect(page.locator('.st-chip[data-tone="unknown"]')).toHaveText(String(round.answer));
      await expect(page.locator('.st-chip[data-tone="unknown"]')).toHaveCSS('color', MAGENTA);
      await expect(page.locator(kind === 'take' ? '.st-outline[data-role="removed"]' : '.st-obj[data-role="added"]')).toHaveCount(k);
    }
    await expect(page.locator('[data-next]')).toBeFocused();
    await expect(page.locator('[data-choices]')).toHaveCount(0);
    await expectCalm(page);
    expect(await lastAttempt(page)).toMatchObject({ game: 'stories', levelId: id, outcome: 'first', wrong: [], help: [], answer: round.answer, options: 4 });
  });
}

for (const id of ['add-change', 'take-10', 'mixed-10']) {
  test(`${id}, the help ladder: a display that stays, then the hint, then the tour ends on the answer; outcome shown`, async ({ page }) => {
    const { round, answerAt } = await playAt(page, id);
    const { width, height } = /** @type {{ width: number, height: number }} */ (page.viewportSize());
    /** @type {(state: any) => Promise<string[]>} the picture where scene.js puts it, once nothing moves */
    const placed = async (state) => {
      await expectCalm(page);
      return calibrate(page, round, state, [width, height], []);
    };
    const wrong = wrongOf(round);
    const { value, rule } = round.choices[wrong[0]];
    const slot = await card(page, wrong[0]).boundingBox();
    await card(page, wrong[0]).click();
    await expect(card(page, wrong[0])).toHaveClass(/is-retired/);
    expect(await card(page, wrong[0]).boundingBox()).toEqual(slot);
    await expect(draw(page)).toHaveAttribute('data-display', RULES[rule].display);
    await unlocked(page);
    await expect(page.locator('[data-hint]')).toHaveCount(0);
    expect(await placed({ display: RULES[rule].display, rule, value })).toEqual([]);
    // The display stays to the next tap: a minute changes nothing.
    const html = await page.locator('main').innerHTML();
    await page.clock.runFor(60000);
    expect(await page.locator('main').innerHTML()).toBe(html);
    // The second runs and leaves: the start picture, its '?' down, with the hint (design 7.2).
    await card(page, wrong[1]).click();
    await expectHint(page, round);
    await unlocked(page);
    await expect(page.locator('[data-display]')).toHaveCount(0);
    expect(await placed({ hint: true })).toEqual([]);
    await card(page, wrong[2]).click();
    await unlocked(page);
    await expect(page.locator('button[data-index]:not(.is-retired)')).toHaveCount(1);
    await expect(card(page, answerAt)).toHaveClass(/is-shown/);
    await expect(page.locator('[data-tour]')).toHaveText(tourOf(round));
    expect(await placed({ hint: true, tour: tourOf(round).length })).toEqual([]);
    await expectMathLeftToRight(page);
    await card(page, answerAt).click();
    await expect(page.locator('[data-next]')).toBeVisible();
    expect(await lastAttempt(page)).toMatchObject({ outcome: 'shown', wrong: wrong.map((i) => round.choices[i].rule), help: ['hint', 'tour'] });
  });
}

for (const id of ['add-5', 'take-5', 'whole-5']) {
  test(`${id}, 3 options: dots on the cards; the first miss keeps its display and brings the hint, the second the tour, to the answer`, async ({ page }) => {
    const { round, answerAt } = await playAt(page, id);
    for (const [i, { value }] of round.choices.entries()) await expect(card(page, i).locator('i')).toHaveCount(value);
    const wrong = wrongOf(round);
    await card(page, wrong[0]).click();
    await expectHint(page, round);
    await unlocked(page);
    await expect(page.locator(`[data-display="${RULES[round.choices[wrong[0]].rule].display}"]`)).toBeVisible();
    // The display stays with the hint to the next tap: a minute changes nothing.
    await expectCalm(page);
    const html = await page.locator('main').innerHTML();
    await page.clock.runFor(60000);
    expect(await page.locator('main').innerHTML()).toBe(html);
    await card(page, wrong[1]).click();
    await unlocked(page);
    await expect(page.locator('[data-display]'), 'the second runs and leaves').toHaveCount(0);
    await expect(page.locator('[data-tour]')).toHaveText(tourOf(round));
    await card(page, answerAt).click();
    await expect(page.locator('[data-next]')).toBeVisible();
    expect(await lastAttempt(page)).toMatchObject({ outcome: 'shown', options: 3, help: ['hint', 'tour'] });
  });
}

for (const id of stories.levels.filter((l) => l.demo).map((l) => l.id)) {
  test(`a demo level (${id}) runs its demo first: the story, the hand, the solved picture, nothing written`, async ({ page }) => {
    await playAt(page, id, { demoSeen: [] });
    await expect(page.locator('main[data-screen="demo"] [data-hand]')).toBeVisible();
    await expect(page.locator('main[data-screen="demo"]')).toHaveAttribute('data-solved', '', { timeout: 15000 });
    await expect(page.locator('[data-next]')).toBeVisible();
    await expect(page.locator('[data-tour]').last()).toHaveText(String((await roundOf(page)).round.answer));
    await expect(page.locator('[data-area="picture"] .cover:not(.is-lifted)')).toHaveCount(0);
    expect((await stored(page)).child.attempts).toEqual([]);
    await look(page);
    await page.locator('[data-next]').click();
    await expect(page.locator('main[data-screen="round"]')).toHaveAttribute('data-level', String(number(id)));
  });
}

test('a session of 8 rounds ends on the solved pictures', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await playAt(page, 'take-10');
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
  await expect(page.locator('main[data-screen="end"] .end-thumbs > [data-thumb] .st-stage')).toHaveCount(8);
  await expectThumbsDrawn(page);
  expect((await stored(page)).child.attempts.every((a) => a.outcome === 'first')).toBe(true);
});
