// The sifra shell (docs/architecture.md section 3): routes, screens, sessions, the round runner,
// demos and the error screen. The shell owns levels, storage and records; games only draw.
import { drawCards } from './shell/cards.js';
import { cover } from './lib/cover.js';
import { buildEquation, drawEquation, fitEquation, solveEquation } from './shell/equation.js';
import { indexOf, moveTo, needsDemo, sawDemo, startLadder, step } from './shell/ladder.js';
import {
  ROUNDS, apartSeed, dayOf, daysBetween, demoSeedFor, exerciseOf, homeOrder, isMixed, levelSession, nextStep, pickMix, planSession, same, schedule,
  stuckTarget,
} from './shell/planner.js';
import { rng, seedFrom } from './shell/rng.js';
import { reduced, settle } from './lib/settle.js';
import { CAPS, LOCKED, capped, childOf, exportFile, load, refresh, save, zeros } from './shell/store.js';
import { TAP_KINDS, byPointer, tapAt, tapWindow } from './shell/taps.js';
import { RULES } from './data/errors.js';
import { SKILLS } from './data/skills.js';
import { TOPICS, VERIFIED } from './data/videos.js';

// The shell's words (locked, with nikud; R1). Every control also has an icon.
const T = {
  brand: 'סִפְרָה', next: 'הַבָּא', step: 'הַצַּעַד הַבָּא', all: 'כָּל הַמִּשְׂחָקִים', parents: 'לַהוֹרִים',
  home: 'בַּיִת', how: 'תַּרְאוּ לִי אֵיךְ', picture: 'תַּרְאוּ לִי אֶת הַתְּמוּנָה', progress: 'הִתְקַדְּמוּת',
  oops: 'מַשֶּׁהוּ הִשְׁתַּבֵּשׁ', videos: 'סִרְטוֹנִים שֶׁל רוֹן אַהֲרוֹנִי', export: 'יְצוּא הַיּוֹמָן',
};
const ICONS = {
  home: '<path d="M4 11.5 12 5l8 6.5"/><path d="M6.5 10v9.5h11V10"/>',
  hand: '<path d="M9 12V5.5a1.5 1.5 0 0 1 3 0V11"/><path d="M12 10.5a1.5 1.5 0 0 1 3 0V12"/>' +
    '<path d="M15 11.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-.5a6 6 0 0 1-5-2.7L4.2 15a1.5 1.5 0 0 1 2.4-1.8L9 15.5"/>',
  picture: '<rect x="3.5" y="5" width="17" height="14" rx="3"/><circle cx="9" cy="10" r="1.8"/>' +
    '<path d="m4.5 17.5 5-5 3.5 3.5 2.5-2.5 4 4"/>',
  next: '<path d="M19 12H5.5"/><path d="M11 6 5 12l6 6"/>',
};
const MIX = 0x5bd1e995;
/** @type {any} the started shell: games, store, clock, the current screen's controller */
let S = null;

const today = () => dayOf(S.now());
const child = () => childOf(S.store);
/** Reads storage again (3.9): another tab may have written since this one read or wrote. */
const reread = () => refresh(S.store, S.newId, { t: S.now().toISOString(), day: today() });
/**
 * Writes the store. A solved round waits for its closing (S.pending, 3.9): it is applied here, on storage read
 * again, so a write by another tab during the closing is kept, and then written.
 */
const persist = () => {
  const apply = S.pending;
  S.pending = null;
  if (apply) {
    reread();
    apply();
  }
  return save(S.store);
};
/** Reads storage again before a write (3.9); a solved round still waiting for its closing is applied and written. */
const sync = () => (S.pending ? persist() : reread());
/** Records a change under the finger, on the clock events are stamped with (shell/taps.js). */
const changed = () => S.taps.changed(new Event('change').timeStamp);
const event = (e) => capped(child().events, { t: S.now().toISOString(), day: today(), ...e }, CAPS.events);
/** A round's record until it is solved: what the attempt logs (3.9). A demo's record keeps its taps for the next attempt. */
const blank = () => ({ wrong: [], help: [], taps: { picture: 0, equation: 0, other: 0 }, tapsOn: zeros(TAP_KINDS), locked: zeros(LOCKED),
  t0: performance.now(), firstMs: null, ms: null, tour: false });
/**
 * A demo's taps go to the next attempt (3.9): a demo round is not an attempt. By its entry in the spec's `demo`
 * (`auto`, `how`), so a second "show me how" adds to the first; its presses on the locked cards to `lockedTaps.demo`.
 * @type {(spec: Spec, kind: 'auto' | 'how', rec: any) => void}
 */
const keepDemoTaps = (spec, kind, rec) => {
  const on = ((spec.demoTaps ??= {})[kind] ??= zeros(TAP_KINDS));
  for (const k of TAP_KINDS) on[k] += rec.tapsOn[k];
  spec.demoLocked = (spec.demoLocked ?? 0) + rec.locked.demo;
};
/** @type {(game: Game, spec: { index: number, structure?: string, ask?: string }) => Level} the level as passed to makeRound */
const built = (game, { index, structure, ask }) => ({ ...game.levels[index], ...(structure && { structure }), ...(ask && { ask }) });
/** @type {(game: Game, i: number) => Level} a level with the first of its mixed values, for thumbs */
const still = (game, i) => {
  const { structure, ask } = game.levels[i];
  return built(game, { index: i, structure: [structure].flat()[0], ask: [ask].flat()[0] });
};
/** @type {<T>(data: T) => T} freezes plain data all the way down, in place */
const frozen = (data) => {
  if (data === null || typeof data !== 'object' || Object.isFrozen(data)) return data;
  Object.freeze(data);
  for (const v of Object.values(data)) frozen(v);
  return data;
};
/** @type {(game: Game, level: Level, seed: number) => Round} a round, frozen before the shell or render reads it (2.4) */
const dealt = (game, level, seed) => frozen(game.makeRound(level, rng(seed)));
const ladderIndex = (game) => indexOf(game.levels, child().games[game.meta.id]?.level ?? game.levels[0].id);
/** The next step, or null when the planner throws on a record migrate could not mend: home and #/next still open (3.9). */
const nextOrNull = () => { try { return nextStep(child(), S.games, SKILLS); } catch (err) { console.error(err); return null; } };

/** An element: attributes, `class`, `html`, and on<event> listeners bound to the current screen (call screen() first). */
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v, { signal: S.ctl.signal });
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  el.append(...kids.flat().filter((x) => x !== null && x !== undefined && x !== false));
  return el;
}
/** An icon (design 9): inline SVG lines, data-icon for R1. */
const svg = (name) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" ' +
  `stroke-linejoin="round" aria-hidden="true" data-icon="${name}">${ICONS[name]}</svg>`;
/** A control button: an icon, a label for screen readers (R1). */
const control = (name, label, onclick, props = {}) =>
  h('button', { type: 'button', class: `ctl btn ctl-${name}`, 'data-control': true, 'aria-label': label, html: svg(name), onclick, ...props });
const homeButton = (props = {}) => control('home', T.home, () => { location.hash = '#/'; }, { 'data-home': true, ...props });

/** The adults' screens: they keep text selection and the browser's menu. The one list: screen() marks them data-adult for app.css. */
const ADULT = new Set(['parents', 'dev', 'export']);
/**
 * A press and hold on a child's screen opens no menu: Android Chrome's link menu on a home card comes with
 * contextmenu (iOS's is app.css's touch-callout). The round's JSON on #/dev keeps it (bug hunt #17).
 * @type {(e: Event) => void}
 */
const noMenu = (e) => {
  if (!(e.target instanceof Element && e.target.closest('.dev-json'))) e.preventDefault();
};

/** Replaces the screen; aborts the previous one's listeners and round. */
function screen(name, title, attrs = {}) {
  S.ctl?.abort();
  S.ctl = new AbortController();
  S.thumbs.length = 0;
  changed();
  const adult = ADULT.has(name);
  const main = h('main', { 'data-screen': name, 'data-adult': adult, oncontextmenu: adult ? null : noMenu, ...attrs }, h('h1', { class: 'sr-only' }, title));
  document.title = title === T.brand ? title : `${title} · ${T.brand}`;
  S.root.replaceChildren(main);
  // Every screen opens at its top (3.2): a round, whose story plays at the top of the picture, never
  // opens where the last screen was scrolled to (a landscape phone, playtest 2026-10-31).
  if (scrollY || scrollX) scrollTo(0, 0);
  return main;
}

/**
 * A still picture of a round (home, the end screen); app.css stops motion under [data-thumb].
 * It is drawn by drawThumbs() once the host is in the page, so render can measure it as in a round.
 * A thumb that throws is left empty, marked data-broken for the tests, so one broken game or record
 * never takes the screen down (3.9).
 * @param {() => Level} level built when the thumb is drawn
 */
function thumb(game, level, seed = 1, solved = false) {
  const host = h('div', { class: 'thumb', 'data-thumb': true, 'data-game': game.meta.id, 'data-solved': solved, 'aria-hidden': 'true' });
  const ctx = { signal: S.ctl.signal, mode: 'thumb', solved, setEquation() {}, build() {}, relabel() {}, onAttempt() {} };
  S.thumbs.push(() => {
    try { game.render(host, dealt(game, level(), seed), ctx); } catch (err) { host.replaceChildren(); host.dataset.broken = ''; console.error(err); }
  });
  return host;
}
const drawThumbs = () => S.thumbs.splice(0).forEach((draw) => draw());

function home() {
  const main = screen('home', T.brand);
  const next = nextOrNull();
  main.append(h('header', { class: 'brand', 'aria-hidden': 'true' }, h('span', { class: 'brand-dots' }, h('i'), h('i'), h('i')), T.brand));
  if (next) {
    const head = h('span', { class: 'next-step-head' }, h('span', {}, T.step), h('span', { class: 'next-step-go', html: svg('next') }));
    const body = h('span', { class: 'next-step-body' }, thumb(next.game, () => still(next.game, next.index)),
      h('span', { class: 'next-step-game' }, next.game.meta.title));
    main.append(h('a', { class: 'next-step btn btn-action', href: '#/next', 'data-control': true }, head, body));
  }
  const card = (g) => h('a', { class: 'game-card btn', href: `#/play/${g.meta.id}`, 'data-card': true },
    thumb(g, () => still(g, ladderIndex(g))), h('span', {}, g.meta.title));
  if (S.games.length) main.append(h('h2', { class: 'all' }, T.all), h('nav', { class: 'games' }, S.games.map(card)));
  if (VERIFIED) main.append(h('a', { class: 'parents-link', href: '#/parents', 'data-parents': true }, h('span', {}, T.parents)));
  drawThumbs();
}

/** #/next: follows the next step (a jump moves the game's level, 3.6), then plays that game. */
function goNext() {
  const next = nextOrNull();
  if (!next) return location.replace('#/');
  const { game, index } = next;
  const [id, ladder, to] = [game.meta.id, child().games[game.meta.id], game.levels[index]];
  if (ladder?.level !== to.id) {
    child().games[id] = ladder ? moveTo(ladder, to.id) : startLadder(game.levels, to.id);
    event({ type: 'jump', game: id, from: ladder ? indexOf(game.levels, ladder.level) + 1 : null, to: index + 1, skill: to.skill });
    persist();
  }
  location.replace(`#/play/${id}`);
}

/**
 * A session's book (3.3, 3.9): what it keeps of the child. The rounds (nextRound, mount) reach the child's record and
 * the store only through it. `begin` runs as a round starts, before its demo: it gives the entry demo's mark when the
 * round opens with the demo, else null. `solved` takes a solved counted round.
 * @typedef {{ begin(session: any, spec: Spec): (() => void) | null, solved(session: any, spec: Spec, level: Level, round: Round, outcome: string): void }} Book
 */

/**
 * A child's session (#/play, which wrote the session count): a new round takes its game's ladder level as it starts,
 * and a game's first ladder, the entry demo seen and each solved round are written (3.3, 3.4, 3.9).
 * @type {Book}
 */
const childBook = {
  begin(session, spec) {
    sync();
    if (spec.index >= 0) return null;
    // A new round takes the ladder's level now, in the session's game (it moves after a stuck return).
    const { game } = session;
    const fresh = !child().games[game.meta.id];
    const ladder = (child().games[game.meta.id] ??= startLadder(game.levels));
    const index = indexOf(game.levels, ladder.level);
    const level = game.levels[index];
    Object.assign(spec, { game: game.meta.id, index }, pickMix(level, session.prev, session.mix));
    if (isMixed(level)) {
      spec.kind = 'mixed';
      session.prev = spec.structure ?? spec.ask;
    }
    if (!needsDemo(ladder, level)) return null;
    spec.demo = ['auto'];
    // A game's first ladder is written as its demo starts; play() wrote the session count (3.9).
    if (fresh) persist();
    // Seen once the hand has tapped the answer (3.4): a reload or leaving mid-demo brings it back.
    return () => {
      sync();
      const now = child().games[game.meta.id];
      if (now) child().games[game.meta.id] = sawDemo(now, level.id);
      persist();
    };
  },
  solved: finish,
};

/**
 * #/try (3.1): every round at its planned level, the level's entry demo first, as on a child's first entry to it.
 * It keeps nothing: neither method reads or writes the child's record, so nothing of the route reaches the store.
 * @type {Book}
 */
const tryBook = {
  begin(session, spec) {
    if (session.i > 0 || !S.byId.get(spec.game).levels[spec.index].demo) return null;
    spec.demo = ['auto'];
    return () => {};
  },
  solved() {},
};

/** Runs a session's rounds; seen: each exercise the session dealt (a round's or a demo's), by when (dealt counts up). */
const run = (session) => nextRound({ done: [], i: 0, prev: null, seen: new Map(), dealt: 0, ...session });

/** A session of 8 counted rounds (3.3); a mix generator from the session seed picks structures. */
function play(game) {
  const c = child();
  c.sessions += 1;
  persist();
  const seed = seedFrom(S.seeds);
  const mix = rng((seed ^ MIX) >>> 0);
  run({ n: c.sessions, game, mix, rounds: planSession(c, S.games, game, today(), SKILLS, rng(seed), mix), book: childBook });
}

/**
 * #/try/<game>/<level>[/<seed>] (3.1): a child's session at one level, for an observation (pedagogy 8.3), from the
 * session seed given, else one drawn as play() draws it. No review, no ladder, nothing read or written (tryBook).
 * @type {(game: Game, index: number, seed: number | null) => void}
 */
function tryLevel(game, index, seed) {
  const from = seed ?? seedFrom(S.seeds);
  const mix = rng((from ^ MIX) >>> 0);
  run({ game, mix, rounds: levelSession(game, index, rng(from), mix), book: tryBook });
}

/** Counts an exercise as dealt in the session, now (3.3): its rounds and demos come apart from it. */
const deal = (session, key) => session?.seen.set(key, ++session.dealt);

/**
 * A round's seed, once, as it starts (3.3): the planned one, plus 1 while its round is one the
 * session dealt already (exerciseOf: the same answer and numbers), up to TRIES times; then the try
 * dealt longest ago (apartSeed). A small pool (a level to 5 has 7 to 9 stories) otherwise deals the
 * same exercise, its answer on the same card, in most sessions. The seed recorded is the one played,
 * so #/dev shows the round.
 */
function apart(session, spec) {
  if (spec.apart) return;
  const game = S.byId.get(spec.game);
  const level = built(game, spec);
  const key = (seed) => exerciseOf(game.meta.id, game.makeRound(level, rng(seed)));
  spec.seed = apartSeed(key, spec.seed, session.seen);
  deal(session, key(spec.seed));
  spec.apart = true;
}

function nextRound(session) {
  if (session.i >= session.rounds.length) return end(session);
  const spec = session.rounds[session.i];
  const seen = session.book.begin(session, spec);
  apart(session, spec);
  if (seen) return demo(S.byId.get(spec.game), spec, () => mount(session, spec), { done: session.done.length, seen, session, kind: 'auto' });
  mount(session, spec);
}

function mount(session, spec) {
  const game = S.byId.get(spec.game);
  const level = built(game, spec);
  const round = dealt(game, level, spec.seed);
  const r = runRound({ game, level, spec, round, done: session.done.length, record: (spec.record ??= blank()),
    onSolved: (outcome) => session.book.solved(session, spec, level, round, outcome),
    onNext: () => { session.done.push(spec); session.i += 1; nextRound(session); },
    onHow: (solved) => {
      // "Show me how" (2.6): a demo, then the same round from the start; the record goes on.
      if (!solved && !spec.record.help.includes('how')) spec.record.help.push('how');
      if (!solved && !(spec.demo ??= []).includes('how')) spec.demo.push('how');
      // After the solve the attempt is taken: that demo's taps go to none.
      demo(game, spec, solved ? r.next : () => mount(session, spec), { done: session.done.length, session, kind: solved ? null : 'how' });
    } });
}

/**
 * A solved counted round: the ladder (3.4), the review schedule (3.5), a stuck return (3.7), then the attempt (3.9).
 * Taken at the solve, applied once the closing has run (persist): a long log's write would hold up the card's
 * "correct" (design 6.5), and applied on storage read again then, a write by another tab during the closing stays.
 */
function finish(session, spec, level, round, outcome) {
  // Copies, at the solve: the saved attempt never changes after it. Only the presses on the locked cards during the
  // closing are read as it is applied, once the closing has run (3.9).
  const [now, rec] = [S.now(), spec.record];
  const demos = [...(spec.demo ?? [])];
  const copy = { wrong: [...rec.wrong], firstMs: Math.round(rec.firstMs), ms: Math.round(rec.ms), help: [...rec.help],
    demo: demos, demoTaps: demos.map((k) => ({ ...(spec.demoTaps?.[k] ?? zeros(TAP_KINDS)) })), taps: { ...rec.taps }, tapsOn: { ...rec.tapsOn } };
  const locked = { display: rec.locked.display, demo: spec.demoLocked ?? 0 };
  S.pending = () => {
    const [c, game, t, day] = [child(), S.byId.get(spec.game), now.toISOString(), dayOf(now)];
    const [id, before, last] = [game.meta.id, c.games[game.meta.id], c.skills[level.skill]?.last];
    let [passed, stuck] = [null, false];
    // Another tab may have moved this game's ladder since the round began (3.9): only a ladder still at the round's level steps.
    if (spec.kind !== 'review' && before?.level === level.id) {
      ({ state: c.games[id], passed, stuck } = step(before, game.levels, { outcome, kind: spec.kind, session: session.n }));
    }
    schedule(c.skills, level.skill, { day, kind: spec.kind, outcome, passed: passed !== null });
    if (stuck) {
      const to = stuckTarget(c, S.games, game, spec.index, SKILLS);
      const [tid, target] = [to.game.meta.id, to.game.levels[to.index]];
      c.games[tid] = moveTo(c.games[tid] ?? startLadder(to.game.levels), target.id, true);
      const at = { game: tid, level: to.index + 1, skill: target.skill };
      event({ t, day, type: 'stuck', game: id, level: spec.index + 1, skill: level.skill, to: at, missing: to.missing });
      // The address names the game the session now plays, so a reload or a restored tab opens it (3.7); only while it
      // names this session's game: home tapped during the closing has left it (route reads the hash after sync).
      if (to.game !== session.game && location.hash === `#/play/${session.game.meta.id}`) history.replaceState(null, '', `#/play/${tid}`);
      session.game = to.game;
    }
    // After the stuck return, so levelAfter is where the game's ladder now stands.
    const number = (ladder) => (ladder ? indexOf(game.levels, ladder.level) + 1 : null);
    capped(c.attempts, {
      t, day, session: session.n, child: S.store.data.current, game: id, level: spec.index + 1, levelId: level.id, skill: level.skill,
      seed: spec.seed, version: game.meta.version, params: level, answer: round.answer, kind: spec.kind, outcome, ...copy,
      lockedTaps: { ...locked, closing: rec.locked.closing }, options: round.choices.length, levelBefore: number(before), levelAfter: number(c.games[id]), sinceDays: last ? daysBetween(last, day) : null,
    }, CAPS.attempts);
  };
}

/** Mounts a round screen and runs it (2.5): cards, misses and help steps, the closing, "הַבָּא". A demo locks the cards. */
function runRound({ game, level, round, spec, record: rec, done = 0, mode = 'play', onSolved = null, onNext, onHow = null }) {
  const id = game.meta.id;
  const main = screen(mode === 'demo' ? 'demo' : 'round', game.meta.title, {
    'data-game': id, 'data-level': spec.index + 1, 'data-seed': spec.seed, 'data-kind': spec.kind, 'data-structure': spec.structure, 'data-ask': spec.ask,
  });
  const ctl = new AbortController();
  const { signal } = ctl;
  S.ctl.signal.addEventListener('abort', () => ctl.abort(), { once: true });
  const host = h('section', { class: 'panel', 'data-area': 'picture', 'data-game': id });
  const eqArea = h('div', { class: 'equation', 'data-area': 'equation' });
  const cardsArea = h('div', { class: 'choices' });
  let [solved, busy, misses, shown] = [false, mode === 'demo', 0, level.look !== 'symbols'];
  const progress = h('div', { class: 'progress', role: 'progressbar', 'aria-label': T.progress, 'aria-valuemin': 0, 'aria-valuemax': ROUNDS,
    'aria-valuenow': done, style: `--done: ${done / ROUNDS}` }, h('span'));
  const how = () => mode !== 'demo' && (ctl.abort(), onHow?.(solved));
  main.append(h('header', { class: 'bar' }, homeButton(), progress, control('hand', T.how, how, { 'data-how': true })), host, eqArea, cardsArea);
  const eq = drawEquation(eqArea, round.equation, round.answer, cover);
  const dots = level.cardDots !== false && level.look !== 'symbols' && round.choices.every((c) => Number.isInteger(c.value) && c.value >= 0 && c.value <= 20);
  const cards = drawCards(cardsArea, round.choices, { dots, face: game.face && ((el, v) => game.face(el, v, round)) }, signal);
  fitEquation(eq.row);
  // A turned phone changes the row's box and --fs-eq: fitted again, it shrinks on the narrow screen and comes back to
  // full size on the wide one (design 6.4). setEquation refills eq, so this fits the row on screen.
  addEventListener('resize', () => fitEquation(eq.row), { signal });
  // Locked while a display runs (R5); [data-locked] tells tests when a tap is taken again.
  const lock = (on) => { busy = on; cards.row.toggleAttribute('data-locked', on); };
  lock(busy);
  /** @type {RoundView} */
  let view = {};
  // The picture's description, read from the view each time: it changes with the solve and a move (2.4).
  const label = () => {
    if (!shown || !view.label) return;
    host.setAttribute('role', 'img');
    host.setAttribute('aria-label', view.label);
  };
  // A new row is fully built: setEquation also ends a story's build (2.4).
  const setEquation = (equation) => {
    fitEquation(Object.assign(eq, drawEquation(eqArea, equation, round.answer, cover)).row);
    label();
  };
  // After the solve (every token shown) and after abort (the screen is gone), build does nothing.
  const build = (indices) => { if (!solved && !signal.aborted) buildEquation(eq.row, indices); };
  const answerAt = round.choices.findIndex((c) => same(c.value, round.answer));
  const ctx = { signal, mode: mode === 'demo' ? 'demo' : 'play', solved: false, setEquation, build, relabel: label, onAttempt() {} };
  view = game.render(host, round, ctx) ?? {};
  const help = (kind) => Boolean(rec.help.includes(kind) || rec.help.push(kind));
  const picture = (asked) => {
    if (shown) return;
    shown = true;
    const button = host.querySelector('[data-show-picture]');
    // It goes as it is pressed: a keyboard or reader's focus moves on first, to "הַבָּא" or the first live card (design 6.5).
    if (button?.contains(document.activeElement)) {
      (cardsArea.querySelector('[data-next]') ?? cards.buttons.find((b) => b.isConnected && !b.inert))?.focus({ preventScroll: true });
    }
    button?.remove();
    if (asked && !solved) help('picture');   // after the solve the button still draws, but the record is closed
    view.picture?.();
    label();
  };
  if (!shown) host.append(control('picture', T.picture, () => picture(true), { 'data-show-picture': true }));
  if (mode === 'demo') picture(false);   // a demo draws the help picture from the start (2.6)
  label();
  // Off-target taps (pedagogy 5.7, 5.11): a primary pointer down and up on no button, link or [data-target], with no
  // pointercancel and no second finger between, so a scroll or a pinch is no tap; counted until the solve, by area and
  // by the kind of what it hit (3.2). In a demo nothing answers a touch, so a counted thing is no target there: every
  // tap on no button or link counts, for the next attempt (3.9).
  /** @type {{ id: number, area: 'picture' | 'equation' | 'other', x: number, y: number } | null} */
  let press = null;
  const taken = mode === 'demo' ? 'button, a' : 'button, a, [data-target]';
  main.addEventListener('pointerdown', (e) => {
    press = null;   // a second finger (a pinch) drops the first one's press
    if (solved || !e.isPrimary) return;
    const t = e.target instanceof Element ? e.target : null;
    if (!t || t.closest(taken)) return;
    const area = t.closest('[data-area]')?.getAttribute('data-area');
    press = { id: e.pointerId, area: area === 'picture' || area === 'equation' ? area : 'other', x: e.clientX, y: e.clientY };
  }, { signal });
  main.addEventListener('pointercancel', () => { press = null; }, { signal });
  /**
   * The kind of what a tap hit (3.2): for one hit test at the point where it came down every mark takes it (app.css
   * [data-probe]), also in a layer that takes no taps, and the topmost one the child can see names it.
   * @type {(at: { x: number, y: number }) => string}
   */
  const hit = ({ x, y }) => {
    main.setAttribute('data-probe', '');
    try {
      return tapAt(document.elementsFromPoint(x, y), (el) => getComputedStyle(el).opacity);
    } finally {
      main.removeAttribute('data-probe');
    }
  };
  main.addEventListener('pointerup', (e) => {
    if (press?.id === e.pointerId && !solved) {
      rec.taps[press.area] += 1;
      rec.tapsOn[hit(press)] += 1;
    }
    press = null;
  }, { signal });
  const elapsed = () => performance.now() - rec.t0;
  const tap = async (i) => {
    // A press on a locked card (3.9): while a display runs, in a demo, or in the closing.
    if (busy) rec.locked[mode === 'demo' ? 'demo' : solved ? 'closing' : 'display'] += 1;
    if (busy || solved) return;
    const at = elapsed();
    rec.firstMs ??= at;
    if (i === answerAt) return solve(i, at);   // a first tap that solves: one moment for firstMs and ms
    const { value, rule } = round.choices[i];
    lock(true);
    misses += 1;
    rec.wrong.push(rule);
    cards.retire(i);
    const n = /** @type {1 | 2 | 3} */ (Math.min(3, misses + (round.choices.length === 4 ? 0 : 1)));
    if (n >= 2) help('hint');
    if (n === 3) rec.tour = help('tour');
    picture(false);
    await view.miss?.({ value, rule, display: RULES[rule]?.display, step: n, first: misses === 1 });
    if (signal.aborted) return;
    if (n === 3) cards.buttons.forEach((_, j) => (j === answerAt ? cards.shown(j) : cards.retire(j)));
    lock(false);
  };
  cards.buttons.forEach((b, i) => b.addEventListener('click', () => tap(i), { signal }));
  const next = () => { ctl.abort(); host.replaceChildren(); onNext(); };
  const solve = async (i, at = elapsed()) => {
    [solved, rec.ms] = [true, at];
    lock(true);
    onSolved?.(rec.tour ? 'shown' : rec.wrong.length || rec.help.length ? 'help' : 'first');
    cards.correct(i);
    main.setAttribute('data-solved', '');
    // Every token, and out of aria-busy, before the cover lifts: a tap during a story's event comes here first (2.5).
    buildEquation(eq.row, null);
    solveEquation(eq);
    land(eq.row, cards.buttons[i]);
    try {
      await Promise.all([settle(eqArea, signal), view.solve?.()]);
    } finally {
      // The attempt is applied and written once the closing has run, also when the round is left (3.9).
      if (S.pending) persist();
    }
    if (signal.aborted) return;
    label();
    const html = `<span>${T.next}</span>${svg('next')}`;
    const button = h('button', { type: 'button', class: 'next btn btn-action', 'data-next': true, 'data-control': true, html });
    button.addEventListener('click', next, { signal });
    cardsArea.replaceChildren(button);
    changed();
    button.focus({ preventScroll: true });
  };
  if (mode !== 'demo') cards.buttons[0]?.focus({ preventScroll: true });
  return { main, view, cards, answerAt, solve, signal, next };
}

/**
 * The solved answer flies from its card to its place in the exercise, and lands a little past it (design 6.9, 8): each
 * answer of the row starts on the card's number, near that size, 400 ms, with app.css's --ease-pop. settle() waits for
 * it with the lifting cover. Nothing moves in reduced motion, or in a row with no '?'.
 * @param {HTMLElement} row the solved row
 * @param {HTMLElement} card the card tapped right
 */
function land(row, card) {
  if (reduced()) return;
  const face = card.querySelector('.card-number') ?? card;
  const [from, size] = [face.getBoundingClientRect(), parseFloat(getComputedStyle(face).fontSize)];
  const easing = getComputedStyle(row).getPropertyValue('--ease-pop').trim() || 'ease-out';
  for (const el of row.querySelectorAll('.eq-answer')) {
    const to = el.getBoundingClientRect();
    const k = Math.min(1, Math.max(0.5, size / parseFloat(getComputedStyle(el).fontSize)));
    const [dx, dy] = [from.left + from.width / 2 - to.left - to.width / 2, from.top + from.height / 2 - to.top - to.height / 2];
    el.classList.add('is-landing');
    const done = () => el.classList.remove('is-landing');
    el.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${k})` }, { transform: 'none' }], { duration: 400, easing }).finished.then(done, done);
  }
}

/**
 * The demo (2.6): a round from the demo seed, cards locked, the help picture drawn in symbols look;
 * the game's steps, then the hand taps the answer and `seen` runs. Nothing else is written; the bar
 * keeps `done`. In a session (none on #/dev) its exercise is one the session has not dealt, and
 * counts as dealt (3.3, 3.8). Options: done, the rounds done for the bar; seen, the entry demo's mark; session;
 * kind, the demo's entry in the next attempt's `demo` (`auto`, `how`), which gets its taps on "הַבָּא", or null for none.
 * @param {Game} game
 * @param {any} spec a session's Spec, or #/dev's
 * @param {() => void} then
 * @param {{ done?: number, seen?: () => void, session?: any, kind?: 'auto' | 'how' | null }} [options]
 */
function demo(game, spec, then, { done = 0, seen = () => {}, session = null, kind = null } = {}) {
  const level = built(game, spec);
  const key = (round) => exerciseOf(game.meta.id, round);
  // R9 (3.8): other numbers than the round it shows how to solve, a plain round, and not an exercise the session dealt.
  const seed = demoSeedFor((s) => game.makeRound(level, rng(s)), spec.seed, (r) => session?.seen.get(key(r)));
  const round = dealt(game, level, seed);
  deal(session, key(round));
  const record = blank();
  const onNext = () => {
    if (kind) keepDemoTaps(spec, kind, record);
    then();
  };
  const r = runRound({ game, level, round, spec: { ...spec, seed }, record, mode: 'demo', done, onNext });
  const hand = h('span', { class: 'hand', 'data-hand': true, html: svg('hand') });
  r.main.append(h('div', { class: 'demo', 'data-demo': true }, hand));
  /** @type {Element | null} what the hand points at; null at rest: hidden, at its place at the foot of the round (app.css .hand) */
  let target = null;
  /** How many times aim() has moved the hand: a tap knows a turn aimed it again on its way. */
  let aimed = 0;
  /**
   * Points the hand's tip at the middle of its target, measured now. After the solve the answer card is gone and
   * "הַבָּא" stands in its place. Run again on resize: a turned phone moves everything (2.6).
   */
  const aim = () => {
    const el = target?.isConnected ? target : target && r.main.querySelector('[data-next]');
    if (!el) return;
    aimed++;
    const [box, base] = [el.getBoundingClientRect(), hand.parentElement.getBoundingClientRect()];
    const x = Math.round(box.left + box.width / 2 - base.left - hand.offsetLeft - hand.offsetWidth / 2);
    const y = Math.round(box.top + box.height / 2 - base.top - hand.offsetTop);
    hand.style.transform = `translate(${x}px, ${y}px)`;
  };
  addEventListener('resize', aim, { signal: r.signal });
  /**
   * Scrolls the page, never the picture's panel, so that what lies from top to bottom (in the screen's pixels) is on
   * screen: on a phone held sideways the round is taller than the screen (2.6).
   * @type {(top: number, bottom: number) => void}
   */
  const reveal = (top, bottom) => {
    if (bottom > innerHeight) scrollBy(0, Math.ceil(Math.min(bottom - innerHeight, top)));
    else if (top < 0) scrollBy(0, Math.floor(top));
  };
  /** @type {Hand} the hand taps an element, or fades out and steps back to its place, off the picture (slower motion is allowed inside [data-demo]) */
  const api = {
    async tap(el) {
      // The element and the hand under its middle are on screen.
      const box = el.getBoundingClientRect();
      reveal(box.top, box.top + box.height / 2 + hand.offsetHeight);
      target = el;
      hand.classList.add('is-seen');
      aim();
      // A turn on the way aims it again, which cancels the move, and settle resolves on a cancel: wait for the new one.
      let n;
      do {
        n = aimed;
        await settle(hand, r.signal);
      } while (n !== aimed && !r.signal.aborted);
      hand.classList.add('is-tapping');
      await settle(hand, r.signal);
      hand.classList.remove('is-tapping');
    },
    async rest() {
      target = null;
      if (!hand.classList.contains('is-seen')) return;
      hand.classList.remove('is-seen');
      hand.style.transform = '';
      await settle(hand, r.signal);
    },
  };
  (async () => {
    await r.view.demo?.(api);
    if (!r.signal.aborted) await api.tap(r.cards.buttons[r.answerAt]);
    if (r.signal.aborted) return;
    const solved = r.solve(r.answerAt);
    seen();
    await solved;
    // "הַבָּא" stands in the cards' place, where the hand is, and is all on screen (design 6.9).
    const next = r.signal.aborted ? null : r.main.querySelector('[data-next]')?.getBoundingClientRect();
    if (next) reveal(next.top, next.bottom);
  })();
}

function end(session) {
  const main = screen('end', session.game.meta.title);
  const thumbs = session.done.map((spec) => thumb(S.byId.get(spec.game), () => built(S.byId.get(spec.game), spec), spec.seed, true));
  const home = h('div', { class: 'end-home' }, homeButton({ class: 'next btn btn-action' }));
  main.append(h('div', { class: 'end-thumbs' }, thumbs), home);
  drawThumbs();
}

function parents() {
  const main = screen('parents', T.parents);
  const link = (v) => h('li', {}, h('a', { href: v.url, target: '_blank', rel: 'noopener' }, v.label, ' ',
    h('span', { class: 'who' }, v.who)));
  main.append(h('header', { class: 'bar' }, homeButton()), h('h2', { class: 'parents-title' }, T.videos),
    ...TOPICS.map((t) => h('section', { class: 'topic' }, h('h3', {}, t.title), h('ul', {}, t.videos.map(link)))));
}

/** #/dev lists every level at seed 1; #/dev/<game>/<level>/<seed>[/<structure>] plays one round, nothing stored. */
function dev(game, n, seed, choice) {
  const base = game?.levels[n - 1];
  if (!base) {
    const link = (href, text) => h('li', {}, h('a', { href }, text));
    const links = S.games.flatMap((g) => g.levels.map((l, i) => link(`#/dev/${g.meta.id}/${i + 1}/1`, `${g.meta.id} ${i + 1}: ${l.id} (${l.skill})`)));
    return screen('dev', 'dev').append(h('ul', { class: 'dev-list', dir: 'ltr' }, links, link('#/dev/export', 'export')));
  }
  const [key, value] = Object.entries(pickMix(base, null, rng(seed)))[0] ?? [];
  const spec = { game: game.meta.id, index: n - 1, seed, kind: key ? 'mixed' : 'new', ...(key && { [key]: choice ?? value }) };
  const round = dealt(game, built(game, spec), seed);
  const run = () => runRound({ game, level: built(game, spec), round, spec, record: blank(), onHow: () => demo(game, spec, run),
    onNext: () => { location.hash = `#/dev/${game.meta.id}/${n}/${(seed + 1) >>> 0}`; } })
    .main.append(h('pre', { class: 'dev-json', 'data-dev': true, dir: 'ltr' }, JSON.stringify(round, null, 1)));
  run();
}

/** #/dev/export: one button (iOS downloads need a tap); storage is read on the tap (dev-spec A.4). */
function devExport() {
  const download = async () => {
    const persisted = (await navigator.storage?.persisted?.().catch(() => null)) ?? null;
    const { name, text } = exportFile(S.storage, S.now(), persisted, today());
    h('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: name }).click();
  };
  const main = screen('export', 'export');
  main.append(h('button', { type: 'button', class: 'next btn btn-action', 'data-export': true, onclick: download }, T.export));
}

/** The error screen, after AlefBet's error-screen.js: a home button instead of a white page. */
function errorScreen() {
  const show = (message) => {
    // One at a time, read from the page: errors while it is up add none; left by Back, the next error shows it again.
    if (S.root.querySelector(':scope > [data-screen="error"]') || /ResizeObserver loop|^Script error/.test(String(message ?? ''))) return;
    const reload = () => { location.hash = '#/'; location.reload(); };
    const main = screen('error', T.oops);
    main.append(h('p', { class: 'error-text' }, T.oops), h('div', { class: 'end-home' }, homeButton({ class: 'next btn btn-action', onclick: reload })));
  };
  addEventListener('error', (e) => show(e.message));
  addEventListener('unhandledrejection', (e) => show(e.reason?.message ?? e.reason));
}

/**
 * #/try's address after the game (3.1): its level from 1, as on #/dev, then an optional session seed, a uint32 in
 * decimal. The level's index and the seed (null: none), or null for any other address, which goes home.
 * @type {(game: Game | undefined, parts: string[]) => { index: number, seed: number | null } | null}
 */
function tryAddress(game, [level = '', seed = '', ...rest]) {
  const n = /^[1-9]\d{0,3}$/.test(level) ? Number(level) : 0;
  const given = /^\d{1,10}$/.test(seed) && Number(seed) <= 0xffffffff ? Number(seed) : null;
  if (!game || n < 1 || n > game.levels.length || (seed !== '' && given === null) || rest.length) return null;
  return { index: n - 1, seed: given };
}

function route() {
  sync();
  const parts = (location.hash || '#/').split('/');
  const [, a, b, c, d, e] = parts;
  const game = S.byId.get(b);
  if (a === 'next') return goNext();
  if (a === 'play' && game) return play(game);
  if (a === 'try') {
    const at = tryAddress(game, parts.slice(3));
    return at ? tryLevel(game, at.index, at.seed) : location.replace('#/');
  }
  if (a === 'parents') return parents();
  if (a === 'dev' && b === 'export') return devExport();
  if (a === 'dev') return dev(game, Number(c), Number(d) >>> 0 || 1, e);
  return home();
}

/**
 * Starts the shell (3.1). Storage is read only here and in route handlers, in try/catch.
 * @param {{ root: HTMLElement, games: Game[], now?: () => Date, storage?: Storage | null, seed?: number }} options
 */
export function start({ root, games, now = () => new Date(), storage, seed }) {
  let store = storage;
  try {
    if (store === undefined) store = globalThis.localStorage;
  } catch {
    store = null;
  }
  const ordered = homeOrder(games, SKILLS);
  S = { root, games: ordered, byId: new Map(ordered.map((g) => [g.meta.id, g])), now, storage: store, ctl: null, thumbs: [], pending: null, newId: null,
    seeds: rng(seed ?? crypto.getRandomValues(new Uint32Array(1))[0]), taps: tapWindow() };
  // A tap within 300 ms of a new screen or of "הַבָּא" appearing never acts on what the change put
  // under the finger (design 6.9): event times, no timer, nothing locked; the next tap is taken.
  const drop = (e) => { e.preventDefault(); e.stopImmediatePropagation(); };
  root.addEventListener('pointerdown', (e) => S.taps.down(e.timeStamp) && drop(e), { capture: true });
  root.addEventListener('click', (e) => S.taps.click(e.timeStamp, byPointer(e)) && drop(e), { capture: true });
  errorScreen();
  // The cards' focus ring shows only after keyboard input (3.2, design 10): the shell focuses a card,
  // and a ring the child did not ask for reads as "this one" (playtest 2026-10-31).
  addEventListener('keydown', () => document.documentElement.setAttribute('data-keys', ''), { capture: true });
  addEventListener('pointerdown', () => document.documentElement.removeAttribute('data-keys'), { capture: true });
  S.newId = () => `c${[...crypto.getRandomValues(new Uint8Array(4))].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
  S.store = load(store, S.newId, { t: S.now().toISOString(), day: today() });
  // A write waiting for its closing is not lost when the page goes (3.9).
  const flush = () => { if (S.pending) persist(); };
  addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  navigator.storage?.persist?.().catch(() => null);
  // The first route waits for every game's stylesheet (load or error, no timer): drawn before it, a
  // story's event finds no animation to settle on and a render measures an unstyled host (3.1).
  const links = ordered.filter((g) => g.meta.css).map((g) => h('link', { rel: 'stylesheet', href: g.meta.css }));
  document.head.append(...links);
  const loaded = (/** @type {HTMLElement} */ link) => new Promise((done) => {
    link.addEventListener('load', done, { once: true });
    link.addEventListener('error', done, { once: true });
  });
  Promise.all(links.map(loaded)).then(() => {
    addEventListener('hashchange', route);
    route();
  });
}
