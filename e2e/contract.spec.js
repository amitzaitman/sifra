// The render contract (architecture 2.4-2.5, 4.8), machine-checked on every registered game and the
// fixture games: the shell's path through each level on #/dev, and one loop in the page that calls
// render and view.miss directly over many seeds and two screen sizes. A new game passes it with no
// spec of its own; its game spec (4.7) checks what it draws.
import { RULES } from '../data/errors.js';
import * as registry from '../games/registry.js';
import * as parts from '../tests/fixtures/parts/game.js';
import * as scale from '../tests/fixtures/scale/game.js';
import * as story from '../tests/fixtures/story/game.js';
import { FIXTURE, INDEX, NOW, expect, look, roundOf, test } from './helpers.js';

const SITES = [
  { path: INDEX, games: Object.values(registry) },
  { path: FIXTURE, games: [parts, scale] },
  // A story's event builds the equation row (2.4); fixture.html loads its fixture with ?story.
  { path: `${FIXTURE}?story`, games: [story] },
];
/** The seeds of the shell path, and of the loop in the page. */
const SEEDS = 10;
const LOOP = 50;
/**
 * Levels whose cover at rest has one size whatever is under it: the balance's pans (design 6.6, the
 * fixed dome) and the stories' covered change (level 3, design 6.10: the same dome, a square of 1.25u,
 * the rows of the whole held from the mount, so it has the same pixels in every round). Elsewhere a
 * cover in the picture covers the unknown's places (design 6.6), so its size is the deduction the
 * picture offers: the ten-frame, the balance's turning row (`set`, level 9, 3 + 5 = 5 + ?) and the
 * fixtures fail this clause by design. The owner's answer of 2026-10-18 (decisions.md, "המכסה במאזניים
 * מגלה את התשובה") fixed the dome on the pans and left level 9's row as it was.
 * @type {(game: Game, level: Level) => boolean}
 */
const fixedCover = (game, level) => (game.meta.id === 'balance' && level.model === 'balance') || (game.meta.id === 'stories' && level.unknown === 'change');

/**
 * A first miss whose display runs and comes back, as a later miss's does (design 7.1's written
 * exception): the stories' level 3, where a display that lifts the dome would leave the places under
 * it, so the answer, on screen (decisions.md 2026-10-31). With reduced motion it is skipped, as a
 * later miss's display is (design 7.2).
 * @type {(game: Game, level: Level, display: string) => boolean}
 */
const passing = (game, level, display) => game.meta.id === 'stories' && level.unknown === 'change' && display !== 'flash';

const card = (page, i) => page.locator(`button[data-index="${i}"]`);
/** What a solved picture's aria-label no longer says: a cover (מִכְסֶה, מִכְסִים) or something empty (רֵיק, רֵיקָה, רֵיקִים). */
const SOLVED_NOT = /מִכְס|רֵיק/;
/** A tour can count twenty things, 150 ms each, with motion: the cards may stay locked a few seconds. */
const unlocked = (page) => expect(page.locator('[data-choices]')).not.toHaveAttribute('data-locked', { timeout: 10000 });
/** @type {(tokens: any[]) => number} */
const total = (tokens) => tokens.reduce((n, t, i) => (typeof t !== 'number' ? n : tokens[i - 1] === '−' ? n - t : n + t), 0);
/**
 * The number the tour ends on (2.5 step 4): the answer; a pair card's second number; a true card's
 * sum, the same on both sides (a judging round).
 * @param {any} answer
 */
const tourEnd = (answer) => String(Array.isArray(answer) ? answer.at(-1) : Array.isArray(answer?.left) ? total(answer.left) : answer);

/**
 * In the page: the `.cover` elements under a root that a child sees (a box, and no display: none,
 * visibility: hidden or opacity 0 on it or above it; a lifted cover has opacity 0), as
 * "class w×h" with the size rounded to half a pixel, or in a unit element's width to a half.
 * @param {import('@playwright/test').Page} page
 * @param {string} root
 * @param {string} [unit] a selector under root whose width is the unit of the sizes (the balance's cube)
 * @returns {Promise<string[]>}
 */
const shownCovers = (page, root, unit = '') => page.locator(root).evaluate((el, sel) => {
  // With a unit selector, sizes are in that element's width, to a half (the balance's cube): the dome is
  // two cubes and a 3px gap, 2.1 cubes at 28px and 2.25 only below 12px.
  const u = sel ? el.querySelector(sel)?.getBoundingClientRect().width : 0;
  return [...el.querySelectorAll('.cover')].flatMap((c) => {
    const b = c.getBoundingClientRect();
    if (!b.width || !b.height) return [];
    for (let n = /** @type {Element | null} */ (c); n; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return [];
    }
    const half = (v) => Math.round(v * 2) / 2;
    const size = u ? `${Math.round((b.width / u) * 2) / 2}×${Math.round((b.height / u) * 2) / 2}u` : `${half(b.width)}×${half(b.height)}`;
    return [`${c.parentElement?.className} ${size}`];
  });
}, unit);

/**
 * Opens a round on #/dev in the page already open (the same round again through the dev list),
 * then looks past the tap window (3.2).
 * @param {import('@playwright/test').Page} page
 * @param {string} hash
 */
async function openRound(page, hash) {
  if (await page.evaluate((h) => location.hash === h, hash)) {
    await page.evaluate(() => { location.hash = '#/dev'; });
    await expect(page.locator('main[data-screen="dev"]')).toBeAttached();
  }
  await page.evaluate((h) => { location.hash = h; }, hash);
  const [, , id, n, seed] = hash.split('/');
  await expect(page.locator(`main[data-screen="round"][data-game="${id}"][data-level="${n}"][data-seed="${seed}"]`)).toBeVisible();
  await look(page);
  return roundOf(page);
}

/**
 * The shell's path through one round (2.5): in symbols look the panel holds only the picture
 * button until it is tapped; each wrong card in order, the cards unlocked after each, and the
 * label as at rest while the equation row is (help changes none, 2.4); the first
 * miss shows its rule's display, from step 2 a hint, at step 3 the last tour digit is the answer;
 * then the answer, after which no cover is shown and "הַבָּא" is there. In symbols look, the same
 * round again, solved on the first tap: the picture asked for after the solve shows no cover either.
 * @param {import('@playwright/test').Page} page
 * @param {string} hash
 * @param {Game} game
 * @returns {Promise<{ answer: any, covers: string[] }>} the answer, and the covers shown at rest
 */
async function shellPath(page, hash, game) {
  const { round, level, answerAt } = await openRound(page, hash);
  const panel = page.locator('main[data-screen="round"] [data-area="picture"]');
  const where = (what) => `${hash}: ${what}`;
  if (level.look === 'symbols') {
    const drawn = await panel.evaluate((host) => [...host.children].filter((n) => !n.matches('[data-show-picture]')).map((n) => n.outerHTML.slice(0, 60)));
    expect(drawn, where('symbols look: the panel holds only the picture button before picture()')).toEqual([]);
    await page.locator('[data-show-picture]').click();
  }
  const covers = await shownCovers(page, 'main[data-screen="round"] [data-area="picture"]', '.bl-cube:not(.bl-ghost)');
  // Help changes no label: it describes the exercise's picture until the row is rewritten or the round solved (2.4).
  const row = page.locator('main[data-screen="round"] [data-area="equation"]');
  const rest = { label: await panel.getAttribute('aria-label'), row: await row.textContent() };
  const wrong = round.choices.flatMap((c, i) => (c.rule ? [i] : []));
  for (const [m, i] of wrong.entries()) {
    const step = Math.min(3, m + 1 + (round.choices.length === 4 ? 0 : 1));
    await card(page, i).click();
    await unlocked(page);
    if (await row.textContent() === rest.row) {
      expect(await panel.getAttribute('aria-label'), where(`the label after miss ${m + 1} (step ${step}) is the one at rest`)).toBe(rest.label);
    }
    if (m === 0) {
      // Only the first miss: with reduced motion the balance skips a later display (design 7.2), and
      // the stories' level 3 one that comes back (passing).
      const display = RULES[round.choices[i].rule].display;
      if (passing(game, level, display)) await expect(panel.locator('[data-display]'), where(`miss 1's ${display} came back`)).toHaveCount(0);
      else await expect(panel.locator(`[data-display="${display}"]`).first(), where(`miss 1 shows ${display}`)).toBeVisible();
    }
    if (step >= 2) await expect(panel.locator('[data-hint]').first(), where(`step ${step} has the hint`)).toBeAttached();
    if (step === 3) {
      await expect(page.locator('[data-tour]').last(), where('the tour ends on the answer')).toHaveText(tourEnd(round.answer));
      break;
    }
  }
  await card(page, answerAt).click();
  await expect(page.locator('[data-next]'), where('"הַבָּא" after the solve')).toBeVisible();
  expect(await shownCovers(page, 'main'), where('no cover shown after the solve')).toEqual([]);
  // The description says what the solved picture shows: no cover, no empty pan or place (design 6.3, bug hunt #24).
  expect(await panel.getAttribute('aria-label') ?? '', where('the label after the solve')).not.toMatch(SOLVED_NOT);
  if (level.look === 'symbols') {
    await openRound(page, hash);
    await card(page, answerAt).click();
    await expect(page.locator('[data-next]'), where('"הַבָּא" after a first try')).toBeVisible();
    await look(page);
    await page.locator('[data-show-picture]').click();
    await expect(panel.locator('[data-show-picture]')).toHaveCount(0);
    await expect(panel.locator(':scope > *').first(), where('the picture after the solve is drawn')).toBeAttached();
    expect(await shownCovers(page, 'main'), where('no cover shown in the picture after a first try')).toEqual([]);
    expect(await panel.getAttribute('aria-label') ?? '', where('the label of the picture after a first try')).not.toMatch(SOLVED_NOT);
  }
  return { answer: round.answer, covers };
}

// The loop in the page first: its tests are the longest, so the workers start on them.
for (const { path, games } of SITES) {
  for (const game of games) {
    const id = game.meta.id;
    // Each value of a mixed level (R3), as the planner deals them.
    const levels = game.levels.flatMap((l) => [l.structure].flat().flatMap((structure) => [l.ask].flat().map((ask) => ({
      level: { ...l, ...(structure !== undefined && { structure }), ...(ask !== undefined && { ask }) },
      name: [l.id, Array.isArray(l.structure) && structure, Array.isArray(l.ask) && ask].filter(Boolean).join('/'),
    }))));
    // One test per level and size: a whole game in one test outran its timeout on WebKit in CI.
    for (const [width, height] of [[320, 568], [1024, 1366]]) {
      for (const { level, name } of levels) {
        test(`${id} ${name} at ${width}×${height}: render and miss, seeds 1-${LOOP}, keep every box, digit and cover in place`, async ({ page }) => {
          test.setTimeout(240000);
          await page.setViewportSize({ width, height });
          await page.clock.install({ time: NOW });
          await page.goto(`${path}#/dev/${id}/1/1`);
          await expect(page.locator('main[data-screen="round"] [data-area="picture"]')).toBeVisible();
          const url = new URL(path === INDEX ? `/games/${id}/game.js` : `/tests/fixtures/${id}/game.js`, page.url()).pathname;
          expect(await page.evaluate(loop, { url, levels: [level], seeds: LOOP })).toEqual([]);
        });
      }
    }
  }
}

for (const { path, games } of SITES) {
  for (const game of games) {
    const id = game.meta.id;
    for (const [i, level] of game.levels.entries()) {
      test(`${id} ${i + 1} (${level.id}), seeds 1-${SEEDS}, reduced motion: the shell's path keeps the render contract`, async ({ page }) => {
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.clock.install({ time: NOW });
        await page.goto(`${path}#/dev`);
        /** @type {{ seed: number, answer: any, covers: string[] }[]} */
        const rest = [];
        for (let seed = 1; seed <= SEEDS; seed++) rest.push({ seed, ...(await shellPath(page, `#/dev/${id}/${i + 1}/${seed}`, game)) });
        if (!fixedCover(game, level)) return;
        // Two rounds with different answers show the same covers at rest: the cover's size never
        // tells what is under it (design 6.6, 6b76be4). Sizes are read in cubes, as the dome is two
        // cubes and their gap: a pan with more rows has smaller cubes, so its dome is a few pixels
        // smaller too (51 against 53px on WebKit's iPhone 13), with the whole picture. The stories have
        // no cube, so their dome is read in pixels.
        const sizes = (covers) => covers.map((c) => c.split(' ').at(-1)).sort();
        for (const r of rest) {
          if (JSON.stringify(r.answer) === JSON.stringify(rest[0].answer)) continue;
          expect(sizes(r.covers), `seed ${r.seed} (answer ${JSON.stringify(r.answer)}) and seed 1 (answer ${JSON.stringify(rest[0].answer)})`).toEqual(sizes(rest[0].covers));
        }
      });
    }
    // One run with motion, on the game's first level with the most options (4 today: the whole help
    // ladder, a display that stays, one that leaves, the hint, the tour): the waits chain on real
    // animations here. The loop in the page runs every level's motion, finishing each animation as it starts.
    const n = game.levels.reduce((best, l, i, all) => (l.options > all[best].options ? i : best), 0) + 1;
    test(`${id} ${n}, seed 1, with motion: the shell's path keeps the render contract`, async ({ page }) => {
      await page.clock.install({ time: NOW });
      await page.goto(`${path}#/dev`);
      await shellPath(page, `#/dev/${id}/${n}/1`, game);
    });
  }
}

/**
 * In the page: every level of a game (each value of a mixed one), seeds 1 to `seeds`, rendered
 * into a host of the panel's size as the shell would (the round frozen), each wrong choice missed
 * in order with the shell's step and first, then solved; in symbols look also solved first and the
 * picture asked for after; and the round as a thumb (unsolved at seed 1, solved at every seed).
 * Animations are finished as they start. After each step: nothing threw; every box shown is finite
 * and inside the host, and no inline style holds NaN; after a solve no cover is shown; in the panel,
 * every digit shown is topmost at its centre and its text fits its box, and every cover with a mark
 * is topmost (architecture 4.8); the view's label, at rest and solved, puts a hyphen after a one-letter word only
 * before a digit, and solved says no cover and nothing empty (design 6.3); after a miss it is the one at rest,
 * unless setEquation rewrote the row (help changes no label, 2.4). Returns what went wrong, the first 40 or so.
 * @param {{ url: string, levels: Level[], seeds: number }} arg
 * @returns {Promise<string[]>}
 */
async function loop({ url, levels, seeds }) {
  const game = await import(url);
  const { rng } = await import('/shell/rng.js');
  const { RULES } = await import('/data/errors.js');
  const out = [];
  const main = /** @type {HTMLElement} */ (document.querySelector('main'));
  const panel = /** @type {HTMLElement} */ (main.querySelector('[data-area="picture"]'));
  const host = /** @type {HTMLElement} */ (panel.cloneNode(false));
  panel.replaceWith(host);
  const shelf = document.createElement('div');
  shelf.className = 'end-thumbs';
  const thumb = document.createElement('div');
  thumb.className = 'thumb';
  thumb.dataset.thumb = '';
  thumb.dataset.game = game.meta.id;
  shelf.append(thumb, document.createElement('div'));
  host.after(shelf);
  // While the topmost check looks, every node with a fill or text of its own takes hits, and a
  // hollow or hidden one (data-contract-miss) none (e2e/ten-frame.spec.js, paintedOver).
  const probe = document.createElement('style');
  probe.textContent = '[data-contract-hit] * { pointer-events: auto !important; } [data-contract-hit] [data-contract-miss] { pointer-events: none !important; }';
  document.head.append(probe);
  const frozen = (data) => {
    if (data === null || typeof data !== 'object' || Object.isFrozen(data)) return data;
    Object.freeze(data);
    for (const v of Object.values(data)) frozen(v);
    return data;
  };
  // Awaits a promise, finishing every animation as it starts, until it has settled and no animation
  // or story event is left; one that reads finished is over only once its finished promise has
  // settled, as WebKit applies an end its clock passed between two frames at the next frame.
  const { drive } = await import('/e2e/drive.js');
  const name = (n) => `${n?.getAttribute?.('class') || n?.tagName} "${(n?.textContent ?? '').slice(0, 12)}"`;
  /** @type {(root: Element, where: string, o: { solved: boolean, top: boolean }) => void} */
  const check = (root, where, { solved, top }) => {
    const R = root.getBoundingClientRect();
    const nodes = [...root.querySelectorAll('*')];
    const style = new Map(nodes.map((n) => [n, getComputedStyle(n)]));
    const hiddenAt = new Map();
    const hidden = (n) => {
      if (n === root || !n) return false;
      if (!hiddenAt.has(n)) {
        const s = style.get(n);
        hiddenAt.set(n, s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0' || hidden(n.parentElement));
      }
      return hiddenAt.get(n);
    };
    for (const n of nodes) {
      if (/NaN|Infinity|undefined/.test(n.getAttribute('style') ?? '')) out.push(`${where}: ${name(n)} style "${n.getAttribute('style')}"`);
      const b = n.getBoundingClientRect();
      if (![b.left, b.top, b.width, b.height].every(Number.isFinite)) out.push(`${where}: ${name(n)} box not finite`);
      if ((!b.width && !b.height) || hidden(n)) continue;
      const over = Math.max(R.left - b.left, R.top - b.top, b.right - R.right, b.bottom - R.bottom);
      if (over > 1) out.push(`${where}: ${name(n)} ${Math.round(over)}px outside the host`);
    }
    const shown = (n) => { const b = n.getBoundingClientRect(); return b.width > 0 && b.height > 0 && !hidden(n); };
    const digits = nodes.filter((n) => shown(n) && [...n.childNodes].some((c) => c.nodeType === Node.TEXT_NODE && /\d/.test(c.textContent ?? '')));
    for (const d of digits) {
      if (!(d instanceof HTMLElement) || d.scrollWidth <= d.clientWidth || !d.clientWidth) continue;
      // Wider than its box: allowed only centred on it, as a 10 on one dot of the ten-frame's pair
      // cards (design 7.2; e2e/ten-frame.spec.js keeps it inside its group's line).
      const range = document.createRange();
      range.selectNodeContents(d);
      const [ink, b] = [range.getBoundingClientRect(), d.getBoundingClientRect()];
      if (Math.abs(ink.left + ink.right - b.left - b.right) / 2 > 1) out.push(`${where}: ${name(d)} overflows its box, off its centre (${d.scrollWidth} > ${d.clientWidth})`);
    }
    const covers = nodes.filter((n) => n.matches('.cover') && shown(n));
    if (solved) for (const c of covers) out.push(`${where}: a cover shown after the solve, in ${name(c.parentElement)}`);
    // Topmost, so the hit at its centre is what is painted there. A cover without a mark joins the
    // pieces of a cover over two rows, and the hint's ring may run along it in the same colour (the
    // balance, design 6.6): only a cover with its ? or digit is checked.
    const tops = [...digits, ...covers.filter((c) => c.getAttribute('data-mark'))];
    if (!top || !tops.length) return;
    const hollow = (n) => {
      if (!(n instanceof HTMLElement)) return n.matches('svg');
      const s = style.get(n);
      return /^(transparent|rgba\(.*,\s*0\))$/.test(s.backgroundColor) && s.backgroundImage === 'none'
        && ![...n.childNodes].some((c) => c.nodeType === Node.TEXT_NODE && c.textContent?.trim());
    };
    const misses = nodes.filter((n) => hollow(n) || hidden(n));
    for (const n of misses) n.setAttribute('data-contract-miss', '');
    root.setAttribute('data-contract-hit', '');
    for (const el of tops) {
      const b = el.getBoundingClientRect();
      const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      if (!el.contains(hit)) out.push(`${where}: ${name(el)} under ${name(hit)}`);
    }
    root.removeAttribute('data-contract-hit');
    for (const n of misses) n.removeAttribute('data-contract-miss');
  };
  let rewritten = false;   // setEquation was called: the exercise's row changed
  /** @type {(into: HTMLElement, round: Round, mode: string, solved: boolean, signal: AbortSignal) => any} */
  const render = (into, round, mode, solved, signal) => {
    into.replaceChildren();
    return game.render(into, round, { signal, mode, solved, setEquation() { rewritten = true; }, build() {}, relabel() {}, onAttempt() {} }) ?? {};
  };
  // The picture's label (design 6.3): a one-letter word (וְ, בְּ) joins the word after it and takes a hyphen only
  // before a digit (וְ-3, וְעִגּוּל אֶחָד); solved, it names no cover and nothing empty (bug hunt #24).
  /** @type {(view: any, where: string, solved: boolean) => void} */
  const written = (view, where, solved) => {
    const label = view?.label;
    if (typeof label !== 'string') return;
    if (/(^|\s)[א-ת][ְ-ׇּׁׂ]*-(?!\d)/.test(label)) out.push(`${where}: label "${label}", a hyphen before a word`);
    if (solved && /מִכְס|רֵיק/.test(label)) out.push(`${where}: label "${label}" after the solve`);
  };
  for (const level of levels) {
    for (let seed = 1; seed <= seeds && out.length < 40; seed++) {
      const at = `${level.id}${level.structure ? ` ${level.structure}` : ''} seed ${seed}`;
      // The panel's round, and the thumbs': each drawn with a live signal, as the shell draws them.
      const [ctl, still] = [new AbortController(), new AbortController()];
      try {
        const round = frozen(game.makeRound(level, rng(seed)));
        const symbols = level.look === 'symbols';
        let view = render(host, round, 'play', false, ctl.signal);
        if (symbols) {
          if (host.childElementCount) out.push(`${at}: symbols look, ${host.childElementCount} nodes before picture()`);
          view.picture?.();
        }
        await drive(null);
        check(host, `${at} at rest`, { solved: false, top: true });
        written(view, `${at} at rest`, false);
        // Help changes no label (2.4): a hint that lifts a cover for good or regroups cubes leaves it as at rest.
        const rest = view?.label;
        rewritten = false;
        const wrong = round.choices.filter((c) => c.rule);
        for (const [m, { value, rule }] of wrong.entries()) {
          const step = Math.min(3, m + 1 + (round.choices.length === 4 ? 0 : 1));
          await drive(view.miss?.({ value, rule, display: RULES[rule].display, step, first: m === 0 }));
          check(host, `${at} miss ${m + 1} (${rule}, step ${step})`, { solved: false, top: true });
          if (!rewritten && view?.label !== rest) out.push(`${at} miss ${m + 1} (step ${step}): label "${view?.label}", at rest "${rest}"`);
          if (step === 3) break;
        }
        await drive(view.solve?.());
        check(host, `${at} solved`, { solved: true, top: true });
        written(view, `${at} solved`, true);
        if (symbols) {
          ctl.abort();
          const again = new AbortController();
          view = render(host, round, 'play', false, again.signal);
          await drive(view.solve?.());
          view.picture?.();
          await drive(null);
          check(host, `${at} the picture after a first try`, { solved: true, top: true });
          again.abort();
        }
        // A thumb is the picture at rest or solved, checked above in the panel: here only its boxes
        // and, solved, no cover. Home draws its thumbs at seed 1; the end screen, solved, at any seed.
        for (const solved of seed === 1 ? [false, true] : [true]) {
          const small = render(thumb, round, 'thumb', solved, still.signal);
          check(thumb, `${at} thumb${solved ? ', solved' : ''}`, { solved, top: false });
          written(small, `${at} thumb${solved ? ', solved' : ''}`, solved);
        }
      } catch (e) {
        out.push(`${at}: threw ${e?.stack ?? e}`);
      }
      ctl.abort();
      still.abort();
    }
  }
  probe.remove();
  return out;
}
