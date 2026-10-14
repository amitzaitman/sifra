// The sifra shell (docs/architecture.md section 3): routes, screens, sessions, the round runner,
// demos and the error screen. The shell owns levels, storage and records; games only draw.
import { drawCards } from './shell/cards.js';
import { cover } from './lib/cover.js';
import { drawEquation, fitEquation, solveEquation } from './shell/equation.js';
import { indexOf, moveTo, needsDemo, sawDemo, startLadder, step } from './shell/ladder.js';
import { dayOf, daysBetween, homeOrder, isMixed, nextStep, pickMix, planSession, schedule, stuckTarget } from './shell/planner.js';
import { demoSeed, rng, seedFrom } from './shell/rng.js';
import { settle } from './lib/settle.js';
import { CAPS, capped, childOf, exportFile, load, save } from './shell/store.js';
import { tapWindow } from './shell/taps.js';
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

/** @type {(a: any, b: any) => boolean} deep equality of plain data, whatever the key order (an answer card is an object) */
const same = (a, b) => a === b || (a !== null && b !== null && typeof a === 'object' && typeof b === 'object' &&
  Array.isArray(a) === Array.isArray(b) && Object.keys(a).length === Object.keys(b).length &&
  Object.keys(a).every((k) => Object.hasOwn(b, k) && same(a[k], b[k])));
const today = () => dayOf(S.now());
const child = () => childOf(S.store);
const persist = () => save(S.store);
/** Records a change under the finger, on the clock events are stamped with (shell/taps.js). */
const changed = () => S.taps.changed(new Event('change').timeStamp);
const event = (e) => capped(child().events, { t: S.now().toISOString(), day: today(), ...e }, CAPS.events);
/** A round's record until it is solved: what the attempt logs (3.9). */
const blank = () => ({ wrong: [], help: [], taps: { picture: 0, equation: 0, other: 0 }, t0: performance.now(), firstMs: null, ms: null, tour: false });
/** @type {(game: Game, spec: { index: number, structure?: string, ask?: string }) => Level} the level as passed to makeRound */
const built = (game, { index, structure, ask }) => ({ ...game.levels[index], ...(structure && { structure }), ...(ask && { ask }) });
/** @type {(game: Game, i: number) => Level} a level with the first of its mixed values, for thumbs */
const still = (game, i) => {
  const { structure, ask } = game.levels[i];
  return built(game, { index: i, structure: [structure].flat()[0], ask: [ask].flat()[0] });
};
const ladderIndex = (game) => indexOf(game.levels, child().games[game.meta.id]?.level ?? game.levels[0].id);

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

/** Replaces the screen; aborts the previous one's listeners and round. */
function screen(name, title, attrs = {}) {
  S.ctl?.abort();
  S.ctl = new AbortController();
  S.thumbs.length = 0;
  changed();
  const main = h('main', { 'data-screen': name, ...attrs }, h('h1', { class: 'sr-only' }, title));
  document.title = title === T.brand ? title : `${title} · ${T.brand}`;
  S.root.replaceChildren(main);
  return main;
}

/**
 * A still picture of a round (home, the end screen); app.css stops motion under [data-thumb].
 * It is drawn by drawThumbs() once the host is in the page, so render can measure it as in a round.
 */
function thumb(game, level, seed = 1, solved = false) {
  const host = h('div', { class: 'thumb', 'data-thumb': true, 'data-game': game.meta.id, 'data-solved': solved, 'aria-hidden': 'true' });
  const ctx = { signal: S.ctl.signal, mode: 'thumb', solved, setEquation() {}, onAttempt() {} };
  S.thumbs.push(() => game.render(host, game.makeRound(level, rng(seed)), ctx));
  return host;
}
const drawThumbs = () => S.thumbs.splice(0).forEach((draw) => draw());

function home() {
  const main = screen('home', T.brand);
  const next = nextStep(child(), S.games, SKILLS);
  main.append(h('header', { class: 'brand', 'aria-hidden': 'true' }, h('span', { class: 'brand-dots' }, h('i'), h('i'), h('i')), T.brand));
  if (next) {
    const head = h('span', { class: 'next-step-head' }, h('span', {}, T.step), h('span', { class: 'next-step-go', html: svg('next') }));
    const body = h('span', { class: 'next-step-body' }, thumb(next.game, still(next.game, next.index)),
      h('span', { class: 'next-step-game' }, next.game.meta.title));
    main.append(h('a', { class: 'next-step btn btn-action', href: '#/next', 'data-control': true }, head, body));
  }
  const card = (g) => h('a', { class: 'game-card btn', href: `#/play/${g.meta.id}`, 'data-card': true },
    thumb(g, still(g, ladderIndex(g))), h('span', {}, g.meta.title));
  if (S.games.length) main.append(h('h2', { class: 'all' }, T.all), h('nav', { class: 'games' }, S.games.map(card)));
  if (VERIFIED) main.append(h('a', { class: 'parents-link', href: '#/parents', 'data-parents': true }, T.parents));
  drawThumbs();
}

/** #/next: follows the next step (a jump moves the game's level, 3.6), then plays that game. */
function goNext() {
  const next = nextStep(child(), S.games, SKILLS);
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

/** A session of 8 counted rounds (3.3); a mix generator from the session seed picks structures. */
function play(game) {
  const c = child();
  c.sessions += 1;
  const seed = seedFrom(S.seeds);
  const mix = rng((seed ^ MIX) >>> 0);
  const rounds = planSession(c, S.games, game, today(), SKILLS, rng(seed), mix);
  nextRound({ n: c.sessions, game, done: [], i: 0, prev: null, mix, rounds });
}

function nextRound(session) {
  if (session.i >= session.rounds.length) return end(session);
  const spec = session.rounds[session.i];
  if (spec.index < 0) {
    // A new round takes the ladder's level now, in the session's game (it moves after a stuck return).
    const { game } = session;
    const ladder = (child().games[game.meta.id] ??= startLadder(game.levels));
    const index = indexOf(game.levels, ladder.level);
    const level = game.levels[index];
    Object.assign(spec, { game: game.meta.id, index }, pickMix(level, session.prev, session.mix));
    if (isMixed(level)) {
      spec.kind = 'mixed';
      session.prev = spec.structure ?? spec.ask;
    }
    if (needsDemo(ladder, level)) {
      child().games[game.meta.id] = sawDemo(ladder, level.id);
      spec.demo = ['auto'];
      persist();
      return demo(game, spec, () => mount(session, spec), session.done.length);
    }
  }
  mount(session, spec);
}

function mount(session, spec) {
  const game = S.byId.get(spec.game);
  const level = built(game, spec);
  const round = game.makeRound(level, rng(spec.seed));
  const r = runRound({ game, level, spec, round, done: session.done.length, record: (spec.record ??= blank()),
    onSolved: (outcome) => finish(session, spec, level, round, outcome),
    onNext: () => { session.done.push(spec); session.i += 1; nextRound(session); },
    onHow: (solved) => {
      // "Show me how" (2.6): a demo, then the same round from the start; the record goes on.
      if (!solved && !spec.record.help.includes('how')) spec.record.help.push('how');
      if (!solved && !(spec.demo ??= []).includes('how')) spec.demo.push('how');
      demo(game, spec, solved ? r.next : () => mount(session, spec), session.done.length);
    } });
}

/** A solved counted round: the ladder (3.4), the review schedule (3.5), the attempt (3.9), a stuck return (3.7). */
function finish(session, spec, level, round, outcome) {
  const [c, game, day, rec] = [child(), S.byId.get(spec.game), today(), spec.record];
  const [id, before, last] = [game.meta.id, c.games[game.meta.id], c.skills[level.skill]?.last];
  let [passed, stuck] = [null, false];
  if (spec.kind !== 'review') {
    ({ state: c.games[id], passed, stuck } = step(before, game.levels, { outcome, kind: spec.kind, session: session.n }));
  }
  schedule(c.skills, level.skill, { day, kind: spec.kind, outcome, passed: passed !== null });
  const number = (ladder) => (ladder ? indexOf(game.levels, ladder.level) + 1 : null);
  capped(c.attempts, {
    t: S.now().toISOString(), day, session: session.n, child: S.store.data.current, game: id, level: spec.index + 1, levelId: level.id,
    skill: level.skill, seed: spec.seed, version: game.meta.version, params: level, answer: round.answer, kind: spec.kind, outcome,
    wrong: rec.wrong, firstMs: Math.round(rec.firstMs), ms: Math.round(rec.ms), help: rec.help, demo: spec.demo ?? [], taps: rec.taps,
    options: round.choices.length, levelBefore: number(before), levelAfter: number(c.games[id]), sinceDays: last ? daysBetween(last, day) : null,
  }, CAPS.attempts);
  if (stuck) {
    const to = stuckTarget(c, S.games, game, spec.index, SKILLS);
    const [tid, target] = [to.game.meta.id, to.game.levels[to.index]];
    c.games[tid] = moveTo(c.games[tid] ?? startLadder(to.game.levels), target.id, true);
    const at = { game: tid, level: to.index + 1, skill: target.skill };
    event({ type: 'stuck', game: id, level: spec.index + 1, skill: level.skill, to: at, missing: to.missing });
    session.game = to.game;
  }
  persist();
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
  const progress = h('div', { class: 'progress', role: 'progressbar', 'aria-label': T.progress, 'aria-valuemin': 0, 'aria-valuemax': 8,
    'aria-valuenow': done, style: `--done: ${done / 8}` }, h('span'));
  const how = () => mode !== 'demo' && (ctl.abort(), onHow?.(solved));
  main.append(h('header', { class: 'bar' }, homeButton(), progress, control('hand', T.how, how, { 'data-how': true })), host, eqArea, cardsArea);
  const eq = drawEquation(eqArea, round.equation, round.answer, cover);
  const dots = level.look !== 'symbols' && round.choices.every((c) => Number.isInteger(c.value) && c.value >= 0 && c.value <= 20);
  const cards = drawCards(cardsArea, round.choices, { dots, face: game.face && ((el, v) => game.face(el, v, round)) }, signal);
  fitEquation(eq.row);
  // Locked while a display runs (R5); [data-locked] tells tests when a tap is taken again.
  const lock = (on) => { busy = on; cards.row.toggleAttribute('data-locked', on); };
  lock(busy);
  const setEquation = (equation) => fitEquation(Object.assign(eq, drawEquation(eqArea, equation, round.answer, cover)).row);
  const ctx = { signal, mode: mode === 'demo' ? 'demo' : 'play', solved: false, setEquation, onAttempt() {} };
  const view = game.render(host, round, ctx) ?? {};
  const help = (kind) => Boolean(rec.help.includes(kind) || rec.help.push(kind));
  const label = () => {
    if (!shown || !view.label) return;
    host.setAttribute('role', 'img');
    host.setAttribute('aria-label', view.label);
  };
  const picture = (asked) => {
    if (shown) return;
    shown = true;
    host.querySelector('[data-show-picture]')?.remove();
    if (asked) help('picture');
    view.picture?.();
    label();
  };
  if (!shown) host.append(control('picture', T.picture, () => picture(true), { 'data-show-picture': true }));
  if (mode === 'demo') picture(false);   // a demo draws the help picture from the start (2.6)
  label();
  // Off-target taps: not a button, a link or a [data-target]; counted by area (pedagogy 5.7).
  main.addEventListener('pointerdown', (e) => {
    const t = e.target instanceof Element ? e.target : null;
    const area = t?.closest('[data-area]')?.getAttribute('data-area');
    if (t && !t.closest('button, a, [data-target]')) rec.taps[area === 'picture' || area === 'equation' ? area : 'other'] += 1;
  }, { signal });
  const answerAt = round.choices.findIndex((c) => same(c.value, round.answer));
  const elapsed = () => performance.now() - rec.t0;
  const tap = async (i) => {
    if (busy || solved) return;
    rec.firstMs ??= elapsed();
    if (i === answerAt) return solve(i);
    const { value, rule } = round.choices[i];
    lock(true);
    misses += 1;
    rec.wrong.push(rule);
    cards.retire(i);
    const n = Math.min(3, misses + (round.choices.length === 4 ? 0 : 1));
    if (n >= 2) help('hint');
    if (n === 3) rec.tour = help('tour');
    picture(false);
    await view.miss?.({ value, rule, display: RULES[rule]?.display }, n);
    if (signal.aborted) return;
    if (n === 3) cards.buttons.forEach((_, j) => (j === answerAt ? cards.shown(j) : cards.retire(j)));
    lock(false);
  };
  cards.buttons.forEach((b, i) => b.addEventListener('click', () => tap(i), { signal }));
  const next = () => { ctl.abort(); host.replaceChildren(); onNext(); };
  const solve = async (i) => {
    [solved, rec.ms] = [true, elapsed()];
    lock(true);
    onSolved?.(rec.tour ? 'shown' : rec.wrong.length || rec.help.length ? 'help' : 'first');
    cards.correct(i);
    main.setAttribute('data-solved', '');
    solveEquation(eq);
    await Promise.all([settle(eqArea, signal), view.solve?.()]);
    if (signal.aborted) return;
    const label = `<span>${T.next}</span>${svg('next')}`;
    const button = h('button', { type: 'button', class: 'next btn btn-action', 'data-next': true, 'data-control': true, html: label });
    button.addEventListener('click', next, { signal });
    cardsArea.replaceChildren(button);
    changed();
    button.focus({ preventScroll: true });
  };
  if (mode !== 'demo') cards.buttons[0]?.focus({ preventScroll: true });
  return { main, view, cards, answerAt, solve, signal, next };
}

/**
 * The demo (2.6): a round from the demo seed, cards locked, the help picture drawn in symbols look;
 * the game's steps, then the hand taps the answer. Nothing is written; the bar keeps `done`.
 */
function demo(game, spec, then, done = 0) {
  const level = built(game, spec);
  const real = game.makeRound(level, rng(spec.seed));
  let seed = demoSeed(spec.seed);
  for (let n = 0; n < 50 && same(game.makeRound(level, rng(seed)), real); n++) seed = (seed + 1) >>> 0;
  const round = game.makeRound(level, rng(seed));
  const r = runRound({ game, level, round, spec: { ...spec, seed }, record: blank(), mode: 'demo', done, onNext: then });
  const hand = h('span', { class: 'hand', 'data-hand': true, html: svg('hand') });
  r.main.append(h('div', { class: 'demo', 'data-demo': true }, hand));
  /** @type {Hand} moves the hand onto an element and taps (slower motion is allowed inside [data-demo]) */
  const api = { async tap(el) {
    const [box, base] = [el.getBoundingClientRect(), hand.parentElement.getBoundingClientRect()];
    const x = Math.round(box.left + box.width / 2 - base.left - hand.offsetLeft - hand.offsetWidth / 2);
    const y = Math.round(box.top + box.height / 2 - base.top - hand.offsetTop);
    hand.style.transform = `translate(${x}px, ${y}px)`;
    await settle(hand, r.signal);
    hand.classList.add('is-tapping');
    await settle(hand, r.signal);
    hand.classList.remove('is-tapping');
  } };
  (async () => {
    await r.view.demo?.(api);
    if (!r.signal.aborted) await api.tap(r.cards.buttons[r.answerAt]);
    if (!r.signal.aborted) r.solve(r.answerAt);
  })();
}

function end(session) {
  const main = screen('end', session.game.meta.title);
  const thumbs = session.done.map((spec) => thumb(S.byId.get(spec.game), built(S.byId.get(spec.game), spec), spec.seed, true));
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
  const round = game.makeRound(built(game, spec), rng(seed));
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
  let shown = false;
  const show = (message) => {
    if (shown || /ResizeObserver loop|^Script error/.test(String(message ?? ''))) return;
    shown = true;
    const reload = () => { location.hash = '#/'; location.reload(); };
    const main = screen('error', T.oops);
    main.append(h('p', { class: 'error-text' }, T.oops), h('div', { class: 'end-home' }, homeButton({ class: 'next btn btn-action', onclick: reload })));
  };
  addEventListener('error', (e) => show(e.message));
  addEventListener('unhandledrejection', (e) => show(e.reason?.message ?? e.reason));
}

function route() {
  const [, a, b, c, d, e] = (location.hash || '#/').split('/');
  const game = S.byId.get(b);
  if (a === 'next') return goNext();
  if (a === 'play' && game) return play(game);
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
  S = { root, games: ordered, byId: new Map(ordered.map((g) => [g.meta.id, g])), now, storage: store, ctl: null, thumbs: [],
    seeds: rng(seed ?? crypto.getRandomValues(new Uint32Array(1))[0]), taps: tapWindow() };
  // A tap within 300 ms of a new screen or of "הַבָּא" appearing never acts on what the change put
  // under the finger (design 6.9): event times, no timer, nothing locked; the next tap is taken.
  const drop = (e) => { e.preventDefault(); e.stopImmediatePropagation(); };
  root.addEventListener('pointerdown', (e) => S.taps.down(e.timeStamp) && drop(e), { capture: true });
  root.addEventListener('click', (e) => S.taps.click(e.timeStamp, e.detail) && drop(e), { capture: true });
  errorScreen();
  const newId = () => `c${[...crypto.getRandomValues(new Uint8Array(4))].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
  S.store = load(store, newId, today());
  navigator.storage?.persist?.().catch(() => null);
  for (const g of ordered) if (g.meta.css) document.head.append(h('link', { rel: 'stylesheet', href: g.meta.css }));
  addEventListener('hashchange', route);
  route();
}
