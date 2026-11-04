// The stories through the real shell (architecture 4.7, 4.9): the browser's unit and marks against
// scene.js, the glyphs inside their discs and chips and on top, the event that builds the exercise
// (a tap during it is an attempt like any other), R6's role colours, every rule's display on every
// level, and the game spec's list: a first try, three misses to the tour, the first levels' four cards,
// every demo, a session to the end screen, and a turned phone.
import { RULES } from '../data/errors.js';
import * as stories from '../games/stories/game.js';
import { BALLOON, ROUND, builtAt, layoutScene, len, phasesOf, planScene, storyOf, unitFor } from '../games/stories/scene.js';
import { BEAT } from '../games/stories/view.js';
import { exerciseOf } from '../shell/planner.js';
import { rng } from '../shell/rng.js';
import {
  test, expect, INDEX, NOW, dashProblems, expectCalm, expectHandOnTargets, expectMathLeftToRight, expectRoleColours, expectThumbsDrawn, handSeen, ladderAt, look, roundOf, seedStore,
  storeWith, stored, watchHand,
} from './helpers.js';

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
/**
 * The first seed of a level with this story, and with these rules on its cards where a test needs them:
 * the answer's place varies the cards of one story (lib/place.js, decisions.md 2026-10-31).
 * @type {(id: string, s: number, k: number, structure?: string, rules?: string[]) => number}
 */
const storySeed = (id, s, k, structure, rules = []) => seedOf(id, (r) => r.story.s === s && r.story.k === k && rules.every((rule) => r.choices.some((c) => c.rule === rule)), structure);

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
    return { id: el.getAttribute('data-id'), x: b.left - o.left, y: b.top - o.top, w: b.width, h: b.height, moved, balloon: el.matches('.st-obj[data-shape="balloon"]') };
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
    // A balloon's node is its egg (game.css), BALLOON.h tall; its knot and string hang below it.
    const h = n.balloon ? BALLOON.h * u : len(m.box.h, u);
    const off = n.moved
      ? [Math.abs(n.x + n.w / 2 - x - w / 2), Math.abs(n.y + n.h / 2 - y - h / 2)]
      : [n.x - x, n.y - y, n.w - w, n.h - h].map(Math.abs);
    if (Math.max(...off) > 1) out.push(`${n.id}: ${[n.x, n.y, n.w, n.h].map((v) => v.toFixed(1))} in the page, ${[x, y, w, h].map((v) => v.toFixed(1))} in Node`);
  }
  for (const id of marks.keys()) out.push(`${id}: in the layout, not drawn`);
  for (const id of want) if (!nodes.some((n) => n.id === id)) out.push(`${id}: not drawn`);
  return out;
}

/**
 * Level 3's first miss on a display that lifts the dome runs and comes back, the dome down (decisions.md
 * 2026-10-31): to look at the display, motion goes on and its marks' animations are held, each 1 ms
 * before its end (as drawn, still running, so the view waits). The function returned lets it end:
 * the picture comes back, and reduced motion is on again.
 * @param {import('@playwright/test').Page} page
 * @param {() => Promise<void>} click
 */
async function heldDisplay(page, click) {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const style = await page.addStyleTag({ content: '[data-display] * { animation-play-state: paused !important; }' });
  await click();
  await expect(draw(page)).toHaveAttribute('data-display', /./);
  await draw(page).evaluate((d) => {
    for (const a of d.getAnimations({ subtree: true })) a.currentTime = Number(a.effect?.getComputedTiming().endTime) - 1;
  });
  return async () => {
    await style.evaluate((el) => el.remove());
    await expect(draw(page)).not.toHaveAttribute('data-display');
    await unlocked(page);
    await expectCalm(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
  };
}

/**
 * Level 3 after a first miss's display came back: the fixed dome down, none of the places under it on
 * screen (no ghost, dashed place, digit or arc), no hint (playtest 2026-10-31).
 * @param {import('@playwright/test').Page} page
 * @param {string} where
 */
async function expectDomeBack(page, where) {
  await expect(page.locator('.st-lid .cover[data-mark="?"]'), where).toHaveCount(1);
  await expect(page.locator('.st-lid .cover.is-lifted'), where).toHaveCount(0);
  await expect(page.locator('[data-area="picture"] :is(.st-ghost, .st-place, .st-digit, .st-arc, .st-dash)'), where).toHaveCount(0);
  await expect(page.locator('.st-obj[data-role="unknown"]'), where).toHaveCount(0);
  await expect(draw(page), where).not.toHaveAttribute('data-hint');
}

// Two rounds, each through rest, op.other's four-row overflow (design 7.3), the hint, the tour and the
// closing: 10 − 9 = ? (a visible run: the wrap and its dome, the outlines; overflow 19 from place 0)
// and 5 + ? = 9 (level 3: the chips, the fixed dome, the whole's outline; overflow 14 from place 5;
// the hint's stretched cover and its dashed places, the fixed dome lifted; the four it hid). Ids that must be drawn in each.
const CALIBRATED = [
  { id: 'take-10', s: 10, k: 9, rest: ['obj-0', 'out-9', 'dome', 'wrap-0'], overflow: ['obj-0', 'ghost-1', 'ghost-18', 'ring-0'], hint: ['wrap-0'], tour: ['digit-0', 'dome'], solved: ['answer', 'digit-0', 'wrap-0'] },
  { id: 'add-change', s: 5, k: 4, rest: ['obj-0', 'lid', 'chip-start', 'chip-whole', 'whole-0'], overflow: ['obj-4', 'ghost-5', 'ghost-18', 'ring-18', 'chip-whole'], hint: ['cover-0', 'chip-start', 'chip-whole'], tour: ['obj-5', 'digit-8'], solved: ['obj-8', 'chip-whole', 'whole-0'] },
];
for (const vp of /** @type {[number, number][]} */ ([[320, 568], [568, 320], [844, 390], [390, 844]])) {
  test(`${vp.join('×')}: --u and every mark where scene.js puts them, at rest, in a four-row overflow, at the hint, in the tour and solved (10 − 9 = ?, 5 + ? = 9)`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: vp[0], height: vp[1] });
    for (const c of CALIBRATED) {
      const { round } = await devAt(page, c.id, storySeed(c.id, c.s, c.k, undefined, ['op.other']));
      const where = (/** @type {string} */ state) => `${c.id} ${c.s}, ${c.k} ${state}`;
      expect(await calibrate(page, round, 'rest', vp, c.rest), where('at rest')).toEqual([]);
      // op.other first, its display; with reduced motion a later miss skips its display: the hint, then the tour.
      const wrong = wrongOf(round).sort((a, b) => Number(round.choices[b].rule === 'op.other') - Number(round.choices[a].rule === 'op.other'));
      const { value } = round.choices[wrong[0]];
      // Level 3's comes back once drawn: held to be looked at.
      const release = c.id === 'add-change' ? await heldDisplay(page, () => card(page, wrong[0]).click()) : await card(page, wrong[0]).click();
      await expect(draw(page)).toHaveAttribute('data-display', 'overflow');
      expect(planScene(round, { display: 'overflow', rule: 'op.other', value }).rows, where(`overflow ${value}`)).toBe(4);
      expect(await calibrate(page, round, { display: 'overflow', rule: 'op.other', value }, vp, c.overflow), where(`overflow ${value}`)).toEqual([]);
      if (release) {
        await release();
        await expectDomeBack(page, where('after its overflow'));
        expect(await calibrate(page, round, 'rest', vp, c.rest), where('back at rest')).toEqual([]);
      }
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
 * The room WebKit gets over Chromium for a digit's ink below its box's middle (not above it), px. GLYPH.pad (0.02em)
 * was measured in Chromium, where the ink's middle is within 1px of the box's (-0.96 to +0.58px; a grown digit to
 * +1.35px). WebKit draws the same digits 0.3 to 1.8px lower (+0.17 to +1.52px; a grown digit +1.69px; 1024×1366 and
 * 390×844, 2026-10-31), so no one pad keeps both engines within 1px: one that lifts WebKit's ink 0.6px puts
 * Chromium's 1.6px above. The iPhone draws with Core Text, neither of these: the owner's check on the device looks at
 * the digits' middle (device-checks.md). As ringInset in e2e/balance.spec.js.
 */
const inkLow = () => (test.info().project.name === 'webkit' ? 1 : 0);

/**
 * The ink of each two-digit number and of the tour's grown last digit on an object, read from the
 * page's pixels (the digit alone, black on white): inside its disc, a rectangle in a circle, its
 * corners 1px clear (design 6.10; tests/stories.test.js holds the same with GLYPH's measured ink),
 * and its middle within 1px of the box's, up and down (GLYPH.pad; playtest 2026-10-31); in WebKit up to
 * 2px below (inkLow). Also the texts it read, so a test can tell that it read the digits it is there for.
 * @param {import('@playwright/test').Page} page
 * @param {string} where
 * @param {string} [which] the glyphs to read: by default the wide and the grown digits
 */
async function inkProblems(page, where, which = '.st-digit:is(.is-two, .is-grow)') {
  const out = [];
  const read = [];
  const digits = await page.locator(`[data-area="picture"] ${which}`).all();
  const style = await page.addStyleTag({ content: '[data-ink] [data-area="picture"] { background: #fff !important; } [data-ink] [data-area="picture"] * { visibility: hidden !important; } [data-ink] [data-ink-at] { visibility: visible !important; color: #000 !important; text-shadow: none !important; box-shadow: none !important; background: transparent !important; } [data-ink] [data-ink-at]::before { display: none !important; }' });
  for (const digit of digits) {
    // The clip is in the viewport: the panel in it (a tap on a card may have scrolled the page).
    await digit.scrollIntoViewIfNeeded();
    const geo = await digit.evaluate((n) => {
      n.setAttribute('data-ink-at', '');
      document.querySelector('main')?.setAttribute('data-ink', '');
      const b = n.getBoundingClientRect();
      const s = getComputedStyle(n);
      const scale = s.scale === 'none' ? [1] : s.scale.split(' ').map(Number);
      return { text: n.textContent, cx: b.left + b.width / 2, cy: b.top + b.height / 2, w: parseFloat(s.width), h: parseFloat(s.height), sy: scale.at(-1) ?? 1 };
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
    const chip = geo.w !== geo.h;
    if (!chip && far > geo.w / 2 - 1) out.push(`${at}: its ink (${(xs[1] - xs[0]).toFixed(1)} × ${(ys[1] - ys[0]).toFixed(1)}) reaches ${far.toFixed(2)}px from the middle, ${(geo.w / 2 - 1).toFixed(2)} allowed`);
    // A grown digit grows from its middle, and is drawn at its grown size: an offset grows with it,
    // to 1.35px measured (a 20.2px '6' grown 1.3 at 390×844), so 1.5px there.
    const low = (ys[0] + ys[1]) / 2;
    const room = geo.sy === 1 ? 1 : 1.5;
    if (low < -room || low > room + inkLow()) out.push(`${at}: its ink's middle ${low.toFixed(2)}px ${low > 0 ? 'below' : 'above'} the box's`);
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
    // Level 3's first display comes back once drawn when it lifts the dome: held to be looked at.
    const held = m === 0 && round.unknown === 'change' && RULES[rule].display !== 'flash';
    const release = held ? await heldDisplay(page, () => card(page, i).click()) : await card(page, i).click();
    if (!held) await unlocked(page);
    if (m === 0) await expect(draw(page)).toHaveAttribute('data-display', RULES[rule].display);
    const where = `${key}, card ${round.choices[i].value} (${rule})`;
    out.push(...await glyphProblems(page, where));
    if (m === 0 || m === 2) {
      const ink = await inkProblems(page, where);
      out.push(...ink.out);
      inked.push(ink.read);
    }
    if (release) await release();
  }
  await card(page, round.choices.findIndex((c) => !c.rule)).click();
  await expect(page.locator('[data-next]')).toBeVisible();
  out.push(...await glyphProblems(page, `${key} solved`));
  return { out, inked };
}

for (const vp of /** @type {[number, number][]} */ ([[1024, 1366], [390, 844]])) {
  test(`${vp.join('×')}: every digit's and chip's ink in the middle of its box, within 1px (u up to 64; playtest 2026-10-31)`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: vp[0], height: vp[1] });
    const problems = [];
    const read = [];
    for (const [id, s, k] of /** @type {[string, number, number][]} */ ([['add-10', 4, 5], ['add-change', 3, 6], ['take-5', 5, 2]])) {
      const { round } = await devAt(page, id, storySeed(id, s, k));
      for (const i of wrongOf(round).slice(0, round.choices.length - 1)) {
        await card(page, i).click();
        await unlocked(page);
      }
      await expect(page.locator('[data-tour]').first()).toBeVisible();
      const ink = await inkProblems(page, `${id} ${s}, ${k} in the tour`, ':is(.st-digit, .st-chip)');
      problems.push(...ink.out);
      read.push(...ink.read);
    }
    expect(problems).toEqual([]);
    expect(read.length).toBeGreaterThan(10);
  });
}

test('568×320, the floor of the digits: 9 + 1 in the basket, the count-up of 11 (u 22.3px) and the tour\'s 10; 6 + ? = 10\'s jumps, chips and covers; 6 − 2\'s jumps back', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 568, height: 320 });
  const problems = [];
  // The narrowest state with digits (architecture 4.9): 10 and 11 on dots of 22.3px.
  const basket = await devAt(page, 'whole-10', storySeed('whole-10', 9, 1, undefined, ['op.other', 'given.part', 'slip.near']));
  expect(basket.round.choices.map((c) => c.rule)).toEqual(['op.other', 'given.part', null, 'slip.near']);
  const nine = await glyphsThrough(page, basket.round, ['slip.near', 'op.other', 'given.part']);
  problems.push(...nine.out);
  // Level 3: the chips 6 and 10, the fixed dome's '?', the jumps from 1 (k + 1 = 5), the stretched cover's '?', the tour on the lifted places.
  const change = await devAt(page, 'add-change', storySeed('add-change', 6, 4, undefined, ['count.start-included', 'given.whole', 'given.part']));
  const six = await glyphsThrough(page, change.round, ['count.start-included', 'given.whole', 'given.part']);
  problems.push(...six.out);
  // Take: counting back from the last leaver (6, 5), landing on the first outline.
  const take = await devAt(page, 'take-10', storySeed('take-10', 6, 2, undefined, ['count.start-included', 'op.other', 'given.whole']));
  const back = await glyphsThrough(page, take.round, ['count.start-included', 'op.other', 'given.whole']);
  problems.push(...back.out);
  expect(problems).toEqual([]);
  // The ink was read where it is tight: 10 and 11 in the count-up, the tour's grown last digit.
  expect(nine.inked, '9 + 1').toEqual([['10', '11'], ['10']]);
  expect(six.inked, '6 + ? = 10').toEqual([[], ['4']]);
  expect(back.inked, '6 − 2').toEqual([[], ['4']]);
});

test.describe('dashes at 3 device pixels to the CSS pixel, as an iPhone draws them', () => {
  test.use({ deviceScaleFactor: 3 });
  test('568×320 and 390×844: ghosts, a new place and dashed rings keep their dashes round the edge, and every arc has ink where it takes off and lands (design 7.1; hunt 2 #5)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const problems = [];
    const read = [];
    for (const [w, h] of /** @type {[number, number][]} */ ([[568, 320], [390, 844]])) {
      await page.setViewportSize({ width: w, height: h });
      // 10 − 7's 17: ghosts of 16.4px in the fourth row at 568×320 (two fragments each in WebKit); 2 + 8's 11: the new
      // place after the basket's ten ('11)' in WebKit); 5 + 5's 9: counting on from the 5 across the row break, the
      // half arc out of the first row taking off on the 5 (it started in a gap in WebKit, also at 390×844).
      for (const [id, s, k, rule, which] of /** @type {[string, number, number, string, string][]} */ ([
        ['take-10', 10, 7, 'op.other', '.st-ghost:not([data-inset]), .st-ring[data-dash]'],
        ['whole-10', 2, 8, 'slip.near', '.st-place'],
        ['add-10', 5, 5, 'count.start-included', '.st-arc'],
      ])) {
        const { round } = await devAt(page, id, storySeed(id, s, k, undefined, [rule]));
        await card(page, round.choices.findIndex((c) => c.rule === rule)).click();
        await unlocked(page);
        await expect(draw(page)).toHaveAttribute('data-display', RULES[rule].display);
        const dashes = await dashProblems(page, which);
        problems.push(...dashes.out.map((p) => `${w}×${h} ${id} ${s}, ${k} (${rule}): ${p}`));
        read.push(`${w}×${h} ${id}: ${dashes.read}`);
      }
    }
    expect(problems).toEqual([]);
    // Each case read its marks: ghosts, a place, arcs (a half arc among them).
    expect(read.filter((r) => r.endsWith(': 0'))).toEqual([]);
  });
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
    // Every phase before the end moves, so each is held until step(): the still 'before' too, its start
    // entering in order (playtest 2026-10-31), then the morph, the event and the '?'. The end is held
    // where something enters there (the wrap draws in), and not in the basket, where nothing does.
    expect(seen.filter((p) => p !== 'rest')).toEqual(phasesOf(round).slice(0, -1));
    expect(await now(page)).toMatchObject({ phase: null, busy: null, shown: all, boxes: first.boxes, q: true });
  });
}

// The still 'before' is seen (playtest 2026-10-31): at normal speed the event's next phase starts once
// the start's objects have entered (250 ms) and the picture has held still 0.8 s more (decisions.md 2026-11-03).
for (const [id, s, k, structure] of /** @type {[string, number, number, string?][]} */ ([['add-5', 1, 4], ['add-change', 4, 3], ['take-5', 5, 4], ['mixed-10', 9, 3, 'change-take']])) {
  test(`${id}${structure ? ` (${structure})` : ''}: the start enters first, and the story goes on 1.05 s or more after the picture appears`, async ({ page }) => {
    await page.addInitScript(() => {
      /** @type {Record<string, number>} */
      const t = {};
      Object.assign(window, { phases: t });
      new MutationObserver(() => {
        const phase = document.querySelector('.st-draw')?.getAttribute('data-event');
        if (phase && t[phase] === undefined) t[phase] = Number(document.timeline.currentTime);
      }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-event'] });
    });
    await page.goto(`${INDEX}#/dev/stories/${number(id)}/${storySeed(id, s, k, structure)}${structure ? `/${structure}` : ''}`);
    await expect(page.locator('[data-choices]')).toBeVisible();
    await expect(page.locator('[data-event]')).toHaveCount(0, { timeout: 15000 });
    const t = await page.evaluate(() => /** @type {any} */ (window).phases);
    const next = Object.keys(t).find((p) => p !== 'event:0');
    expect(Object.keys(t)[0]).toBe('event:0');
    // Half a millisecond for the timeline's float arithmetic: CI read 249.968 for a 250 ms entry.
    expect(t[next] - t['event:0'], `${next} after the picture`).toBeGreaterThanOrEqual(1049.5);
  });
}

// The story at its calm pace (decisions.md 2026-11-03): what comes or goes moves one by one, a beat
// apart, each in half a second, and a leaver's outline traces in with it; the morph takes half a second.
/** @type {(page: import('@playwright/test').Page, sel: string) => Promise<{ anim: string | null, delay: string, duration: string }[]>} each node's motion, in place order */
const motions = (page, sel) => page.locator(sel).evaluateAll((els) => els
  .map((el) => ({ el, place: Number(el.getAttribute('data-id')?.split('-')[1] ?? -1) }))
  .sort((a, b) => a.place - b.place)
  .map(({ el }) => ({ anim: el.getAttribute('data-anim'), delay: getComputedStyle(el).animationDelay, duration: getComputedStyle(el).animationDuration })));
/** @type {(n: number, anim: string) => { anim: string, delay: string, duration: string }[]} n motions a beat apart, half a second each */
const beats = (n, anim) => Array.from({ length: n }, (_, j) => ({ anim, delay: `${(j * BEAT) / 1000}s`, duration: '0.5s' }));
/** @type {(page: import('@playwright/test').Page, phase: string) => Promise<void>} steps a held event to a phase */
async function stepTo(page, phase) {
  for (let i = 0; i < 4 && (await now(page)).phase !== phase; i++) {
    const was = (await now(page)).phase;
    await step(page);
    await expect.poll(async () => (await now(page)).phase).not.toBe(was);
  }
  expect((await now(page)).phase).toBe(phase);
}

test('1 + 4: the start holds still 0.8 s once in, then the four arrive one by one, a beat apart, half a second each', async ({ page }) => {
  await holdAt(page, `#/dev/stories/${number('add-5')}/${storySeed('add-5', 1, 4)}`);
  expect(await page.locator('[data-layer="objects"]').evaluate((l) => [l.getAttribute('data-anim'), getComputedStyle(l).animationDuration])).toEqual(['hold', '1.05s']);
  await stepTo(page, 'event:B');
  expect(await page.locator('[data-layer="objects"]').getAttribute('data-anim')).toBeNull();
  expect(await motions(page, '.st-obj[data-anim="from"]')).toEqual(beats(4, 'from'));
});

test('5 − 3, popped: the three go one by one, a beat apart, each outline tracing in with its balloon', async ({ page }) => {
  await holdAt(page, `#/dev/stories/${number('take-5')}/${seedOf('take-5', (r) => r.story.s === 5 && r.story.k === 3 && r.story.verb === 'pop')}`);
  await stepTo(page, 'event:B');
  expect(await motions(page, '.st-obj[data-leaving]')).toEqual(beats(3, 'pop'));
  expect(await motions(page, '.st-outline')).toEqual(beats(3, 'trace'));
});

test('4 + 5: the balloons turn into dots in half a second, each fading over the dot it becomes', async ({ page }) => {
  await holdAt(page, `#/dev/stories/${number('add-10')}/${storySeed('add-10', 4, 5)}`);
  await stepTo(page, 'event:M');
  expect((await motions(page, '.st-obj[data-anim="morph"]')).map((m) => m.duration)).toEqual(Array(4).fill('0.5s'));
  expect((await motions(page, '.st-obj[data-anim="fade"]')).map((m) => m.duration)).toEqual(Array(4).fill('0.5s'));
  expect(await page.locator('[data-layer="objects"] > .st-obj').evaluateAll((els) => els.map((el) => el.getAttribute('data-anim')))).toEqual([...Array(4).fill('morph'), ...Array(4).fill('fade')]);
});

test('take: a leaver of the second row rises half a column right, drawn under what stays', async ({ page }) => {
  const { round } = await holdAt(page, `#/dev/stories/${number('take-10')}/${seedOf('take-10', (r) => r.story.s === 10 && r.story.k === 4 && r.story.verb === 'fly')}`);
  for (let i = 0; i < 4 && (await now(page)).phase !== 'event:B'; i++) {
    const was = (await now(page)).phase;
    await step(page);
    await expect.poll(async () => (await now(page)).phase).not.toBe(was);
  }
  expect((await now(page)).phase).toBe('event:B');
  const layer = await page.locator('[data-layer="objects"]').evaluate((l) => [...l.children].map((n) => ({
    id: n.getAttribute('data-id'), leaving: n.getAttribute('data-leaving'), dx: n.style.getPropertyValue('--txu'),
  })));
  // The leavers first in the layer (painted under the six that stay), the second row's drifting right.
  expect(layer.slice(0, 4).map((n) => n.leaving)).toEqual(Array(4).fill('up'));
  expect(layer.slice(4).every((n) => !n.leaving)).toBe(true);
  expect(layer.filter((n) => n.leaving).map((n) => [n.id, n.dx]).sort()).toEqual([['obj-6', '0.55'], ['obj-7', '0.55'], ['obj-8', '0.55'], ['obj-9', '0.55']]);
  expect(round.story.r).toBe(6);
});

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
  // A balloon is an egg with a white shine (decisions.md 2026-11-03); its knot narrows away from it, and its
  // string is a whole 2px S: no arrow up under it (playtest 2026-10-31). The outline of one that left is an egg too.
  expect(await page.locator('.st-obj[data-shape="balloon"]').evaluateAll((els) => els.map((el) => {
    const [body, shine, knot] = [getComputedStyle(el), getComputedStyle(el, '::before'), getComputedStyle(el, '::after')];
    const path = el.querySelector(':scope > svg.st-string path');
    return { egg: body.borderTopLeftRadius !== body.borderBottomLeftRadius, shine: shine.backgroundColor, clip: knot.clipPath, string: path && getComputedStyle(path).strokeWidth };
  }))).toEqual(Array(3).fill({ egg: true, shine: 'rgb(255, 255, 255)', clip: 'polygon(0px 0px, 100% 0px, 65% 100%, 35% 100%)', string: '2px' }));
  expect(await page.locator('.st-outline[data-shape="balloon"]').evaluateAll((els) => els.map((el) => {
    const s = getComputedStyle(el);
    return s.borderTopLeftRadius !== s.borderBottomLeftRadius;
  }))).toEqual([true, true]);
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
      // Level 3's display that lifts the dome comes back once drawn: held to be looked at, then let go.
      const release = level.unknown === 'change' && display !== 'flash' ? await heldDisplay(page, () => card(page, i).click()) : await card(page, i).click();
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
      if (release) {
        await release();
        await expectDomeBack(page, where);
        expect(await calibrate(page, round, 'rest', [vp.width, vp.height], ['lid']), `${where}: back at rest`).toEqual([]);
      }
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
    const { kind } = storyOf(round);
    const { width, height } = /** @type {{ width: number, height: number }} */ (page.viewportSize());
    /** @type {(state: any) => Promise<string[]>} the picture where scene.js puts it, once nothing moves */
    const placed = async (state) => {
      await expectCalm(page);
      return calibrate(page, round, state, [width, height], []);
    };
    const wrong = wrongOf(round);
    const { value, rule } = round.choices[wrong[0]];
    const slot = await card(page, wrong[0]).boundingBox();
    // On level 3 a display that lifts the dome runs and comes back, the dome down (decisions.md 2026-10-31).
    const lifts = kind === 'change' && RULES[rule].display !== 'flash';
    await card(page, wrong[0]).click();
    await expect(card(page, wrong[0])).toHaveClass(/is-retired/);
    expect(await card(page, wrong[0]).boundingBox()).toEqual(slot);
    if (lifts) await expect(draw(page)).not.toHaveAttribute('data-display');
    else await expect(draw(page)).toHaveAttribute('data-display', RULES[rule].display);
    await unlocked(page);
    await expect(page.locator('[data-hint]')).toHaveCount(0);
    if (lifts) {
      expect(await placed('rest')).toEqual([]);
      await expectDomeBack(page, `${rule} ${value}`);
    } else expect(await placed({ display: RULES[rule].display, rule, value })).toEqual([]);
    // The display, or the picture it came back to, stays to the next tap: a minute changes nothing.
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

test('level 3, step 3: from the display straight to the tour, the cover never coming down between two lifts (playtest 2026-10-31)', async ({ page }) => {
  // 4 + ? = 7: given.part 4, given.whole 7, op.other 11; the third, op.other, lifts the dome.
  const { round, answerAt } = await devAt(page, 'add-change', storySeed('add-change', 4, 3, undefined, ['given.part', 'given.whole', 'op.other']));
  await expect(page.locator('[data-event]')).toHaveCount(0);
  const [a, b, c] = ['given.part', 'given.whole', 'op.other'].map((rule) => round.choices.findIndex((ch) => ch.rule === rule));
  for (const i of [a, b]) {
    await card(page, i).click();
    await unlocked(page);
    await expectCalm(page);
  }
  await expect(page.locator('.st-piece')).not.toHaveCount(0);
  await page.evaluate(() => {
    const w = /** @type {any} */ (window);
    w.drops = 0;
    new MutationObserver((list) => {
      for (const m of list) for (const n of m.addedNodes) if (n instanceof Element && n.matches('.st-piece, .st-lid')) w.drops += 1;
    }).observe(document.querySelector('.st-draw'), { subtree: true, childList: true });
  });
  await card(page, c).click();
  await expect(page.locator('[data-tour]')).toHaveText(tourOf(round));
  await unlocked(page);
  expect(await page.evaluate(() => /** @type {any} */ (window).drops), 'a cover put down after the third miss').toBe(0);
  await card(page, answerAt).click();
  await expect(page.locator('[data-next]')).toBeVisible();
});

// The first level of each skill deals four cards too (decisions.md 2026-10-31, "מקום התשובה"): its real
// errors all fall on one side of the answer, so a slip on the other side moves the answer's card.
for (const id of ['add-5', 'take-5', 'whole-5']) {
  test(`${id}, 4 options: dots on the cards; the first miss keeps its display, the second brings the hint, the third the tour, to the answer`, async ({ page }) => {
    const { round, answerAt } = await playAt(page, id);
    expect(round.choices).toHaveLength(4);
    for (const [i, { value }] of round.choices.entries()) await expect(card(page, i).locator('i')).toHaveCount(value);
    const wrong = wrongOf(round);
    await card(page, wrong[0]).click();
    await unlocked(page);
    await expect(page.locator(`[data-display="${RULES[round.choices[wrong[0]].rule].display}"]`)).toBeVisible();
    await expect(draw(page)).not.toHaveAttribute('data-hint');
    // The display stays to the next tap: a minute changes nothing.
    await expectCalm(page);
    const html = await page.locator('main').innerHTML();
    await page.clock.runFor(60000);
    expect(await page.locator('main').innerHTML()).toBe(html);
    await card(page, wrong[1]).click();
    await expectHint(page, round);
    await unlocked(page);
    await expect(page.locator('[data-display]'), 'the second runs and leaves').toHaveCount(0);
    await card(page, wrong[2]).click();
    await unlocked(page);
    await expect(page.locator('[data-tour]')).toHaveText(tourOf(round));
    await card(page, answerAt).click();
    await expect(page.locator('[data-next]')).toBeVisible();
    expect(await lastAttempt(page)).toMatchObject({ outcome: 'shown', options: 4, help: ['hint', 'tour'] });
  });
}

for (const id of stories.levels.filter((l) => l.demo).map((l) => l.id)) {
  test(`a demo level (${id}) runs its demo first: the story, the hand, the solved picture, nothing written`, async ({ page }) => {
    await watchHand(page, { fromStart: true });
    await playAt(page, id, { demoSeen: [] });
    await expect(page.locator('main[data-screen="demo"] [data-hand]')).toBeVisible();
    await expect(page.locator('main[data-screen="demo"]')).toHaveAttribute('data-solved', '', { timeout: 15000 });
    await expect(page.locator('[data-next]')).toBeVisible();
    await expect(page.locator('[data-tour]').last()).toHaveText(String((await roundOf(page)).round.answer));
    // The hand steps off the picture before the hint and the tour (R9, as in the other games).
    expect((await handSeen(page)).covered, 'tour digits under the hand').toEqual([]);
    // Only play targets, each with its ink dot: the start's first object, then what came, what left or the second part;
    // on level 3 the start alone (owner decision 2026-11-04).
    await expectHandOnTargets(page);
    expect((await handSeen(page)).taps, 'a tap per known number with objects, then the answer').toHaveLength(id === 'add-change' ? 2 : 3);
    await expect(page.locator('[data-area="picture"] .cover:not(.is-lifted)')).toHaveCount(0);
    expect((await stored(page)).child.attempts).toEqual([]);
    await look(page);
    await page.locator('[data-next]').click();
    await expect(page.locator('main[data-screen="round"]')).toHaveAttribute('data-level', String(number(id)));
  });
}

// "Show me how" on levels with no demo of their own (owner decision 2026-11-04): take to 10 and both stories of the mixed
// level, whose dome stands alone at rest; the hand touches only play targets, each left with its ink dot, then the answer.
for (const [id, structure] of [['take-10'], ['mixed-10', 'change-add'], ['mixed-10', 'change-take']]) {
  test(`"show me how" at ${id}${structure ? ` (${structure})` : ''}: the hand touches only play targets, each with its ink dot (R9)`, async ({ page }) => {
    await devAt(page, id, 1, structure);
    await watchHand(page);
    await page.locator('[data-how]').click();
    await expect(page.locator('main[data-screen="demo"]')).toHaveAttribute('data-solved', '', { timeout: 15000 });
    await expectHandOnTargets(page);
    expect((await handSeen(page)).taps, 'the start, what came or left, then the answer').toHaveLength(3);
  });
}

// A session at the first level of each skill, its demo first (3.3, 3.8; playtest 2026-10-31, hunt 2 #2, #11): the demo's
// exercise counts as dealt, so no exercise comes twice before the level's run out (at least 8 of the demo and the 8
// rounds, a level of 7 all 7), none twice in a row, and the demo's is none of rounds 2-4 (none at all on a level of 9).
// Every round is helped, so the ladder would step down; these levels say down: false.
for (const id of ['add-5', 'take-5', 'whole-5']) {
  test(`a session at ${id} after its demo: no exercise twice until the level's run out, none twice in a row; two helped rounds keep it there`, async ({ page }) => {
    const level = stories.levels[number(id) - 1];
    const pool = new Set(Array.from({ length: 2000 }, (_, i) => exerciseOf('stories', stories.makeRound(level, rng(i + 1))))).size;
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await playAt(page, id, { demoSeen: [] });
    /** the demo's exercise, then each round's, as the child sees them */
    const seen = [];
    for (let n = 0; n < 20; n++) {
      const screen = page.locator('main[data-screen]');
      await expect(screen).toHaveAttribute('data-screen', /^(round|demo|end)$/);
      const name = await screen.getAttribute('data-screen');
      if (name === 'end') break;
      await look(page);
      const { round, answerAt } = await roundOf(page);
      seen.push(exerciseOf('stories', round));
      if (name === 'round') {
        // One wrong card, then the answer: every round helped.
        await card(page, wrongOf(round)[0]).click();
        await unlocked(page);
        await card(page, answerAt).click();
      }
      await expect(page.locator('[data-next]')).toBeVisible();
      await look(page);
      await page.locator('[data-next]').click();
    }
    const [demo, ...rounds] = seen;
    expect(rounds, seen.join(', ')).toHaveLength(8);
    expect(new Set(seen).size, seen.join(', ')).toBeGreaterThanOrEqual(Math.min(pool, 8));
    expect(seen.some((k, i) => i > 0 && k === seen[i - 1]), seen.join(', ')).toBe(false);
    expect(rounds.slice(1, 4), seen.join(', ')).not.toContain(demo);
    if (pool >= 9) expect(rounds, seen.join(', ')).not.toContain(demo);
    expect((await stored(page)).child.attempts.map((a) => a.levelId)).toEqual(Array(8).fill(id));
  });
}

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

test('a session of 8 rounds ends on the solved pictures', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await playAt(page, 'take-10');
  await playToEnd(page);
  await expect(page.locator('main[data-screen="end"] .end-thumbs > [data-thumb][data-solved]')).toHaveCount(8);
  await expect(page.locator('main[data-screen="end"] .end-thumbs > [data-thumb] .st-stage')).toHaveCount(8);
  await expectThumbsDrawn(page);
  expect((await stored(page)).child.attempts.every((a) => a.outcome === 'first')).toBe(true);
});

// ---------- A turned phone (design 5; the balance's bug hunt #11, checked here too) ----------

// The unit is solved in CSS from the stage (game.css), and nothing in view.js measures a size, so a turned phone
// draws everything at the new screen's size: these hold that, as the balance's thumbs and squeezed numbers did not.
test('a turned phone: the tour drawn where scene.js puts it on the new screen, its digits inside their discs', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // 9 + 1's tour of 10 in the basket (the narrowest digits, architecture 4.9), and 4 + 5's tour from 5 to 9.
  for (const [id, s, k, rules] of /** @type {[string, number, number, string[]][]} */ ([['whole-10', 9, 1, ['op.other', 'given.part', 'slip.near']], ['add-10', 4, 5, []]])) {
    await page.setViewportSize({ width: 390, height: 844 });
    const { round } = await devAt(page, id, storySeed(id, s, k, undefined, rules));
    for (const i of wrongOf(round)) {
      await card(page, i).click();
      await unlocked(page);
    }
    await expect(page.locator('[data-tour]')).toHaveText(tourOf(round));
    const state = { hint: true, tour: tourOf(round).length };
    for (const vp of /** @type {[number, number][]} */ ([[844, 390], [390, 844], [568, 320], [320, 568]])) {
      await page.setViewportSize({ width: vp[0], height: vp[1] });
      const where = `${id} ${s} + ${k} turned to ${vp.join('×')}`;
      await expect.poll(() => calibrate(page, round, state, vp, []), where).toEqual([]);
      await expect(page.locator('[data-tour]'), where).toHaveText(tourOf(round));
      expect(await glyphProblems(page, where)).toEqual([]);
    }
  }
});

test('a turned phone: home\'s and an end screen\'s thumbs drawn sideways stay inside their cards', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  /** Each stories thumb's drawing inside its card, by 1px. */
  const inside = () => page.evaluate(() => [...document.querySelectorAll('.thumb[data-game="stories"]')].map((t) => {
    const [b, d] = [t.getBoundingClientRect(), t.querySelector('.st-draw').getBoundingClientRect()];
    return d.left >= b.left - 1 && d.right <= b.right + 1 && d.top >= b.top - 1 && d.bottom <= b.bottom + 1;
  }));
  await page.setViewportSize({ width: 568, height: 320 });
  await playAt(page, 'take-10');
  await playToEnd(page);
  await expect(page.locator('main[data-screen="end"] .end-thumbs > [data-thumb] .st-draw')).toHaveCount(8);
  expect(await inside(), 'the end screen at 568×320').toEqual(Array(8).fill(true));
  await page.setViewportSize({ width: 320, height: 568 });
  await expect.poll(inside, 'the end screen turned to 320×568').toEqual(Array(8).fill(true));
  await page.setViewportSize({ width: 568, height: 320 });
  await look(page);
  await page.locator('main[data-screen="end"] .end-home > *').click();
  await expect(page.locator('main[data-screen="home"] .thumb[data-game="stories"] .st-draw').first()).toBeVisible();
  expect((await inside()).every(Boolean), 'home at 568×320').toBe(true);
  await page.setViewportSize({ width: 320, height: 568 });
  await expect.poll(async () => (await inside()).every(Boolean), 'home turned to 320×568').toBe(true);
});
