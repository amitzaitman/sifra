// Code scans (architecture 4.4; R5, R7, R10 [code]; decisions.md "ready to grow" conditions).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { posix } from 'node:path';
import { listFiles, read } from '../scripts/docs-parse.js';
import { GAMES } from './all-games.js';
import { TOPICS } from '../data/videos.js';

const all = listFiles(['.js', '.css', '.html', '.webmanifest']);
const lib = all.filter((f) => f.startsWith('lib/'));
// The shell's own modules (owner decision 2026-10-14, "להפריד את המעטפת"): only app.js imports them.
const shell = all.filter((f) => f.startsWith('shell/'));
// The games: registered ones and the fixtures, which keep the same rules.
const gameFiles = all.filter((f) => /^(games\/[^/]+\/|tests\/fixtures\/)/.test(f));
const site = all.filter((f) => /^(index\.html|manifest\.webmanifest|app\.(js|css)|lib\/|shell\/|data\/|games\/)/.test(f));
const REWARD = [
  'כל הכבוד', 'מצוין', 'מצוינת', 'מצוינים', 'מעולה', 'יופי', 'נהדר', 'נפלא', 'אלוף', 'אלופה', 'אלופים', 'גאון', 'כוכב',
  'כוכבים', 'פרס', 'פרסים', 'ניצחון', 'ניצחתם', 'גביע', 'מדליה', 'רצף', 'בונוס', 'עליתם רמה', 'ירדתם רמה', 'שיא', 'הישג', 'יהלום',
];
const plain = (text) => text.replace(/[֑-ׇ]/g, '');

/**
 * Problems for files whose text matches a pattern, with line numbers.
 * @param {string[]} files
 * @param {RegExp} pattern
 * @param {string} what
 */
function scan(files, pattern, what) {
  return files.flatMap((file) => read(file).split('\n').flatMap((line, i) => (pattern.test(line) ? [`${file}:${i + 1}: ${what}`] : [])));
}
const none = (problems) => assert.ok(problems.length === 0, problems.join('\n'));

test('no timers in site code (R10): setTimeout, setInterval, requestAnimationFrame', () => {
  none(scan(['app.js', ...shell, ...lib, ...gameFiles.filter((f) => f.endsWith('.js'))], /\b(setTimeout|setInterval|requestAnimationFrame)\b/, 'a timer'));
});

test('no Math.random in shell/, lib/ or games (makeRound uses its rng)', () => {
  none(scan([...shell, ...lib, ...gameFiles], /Math\.random/, 'Math.random'));
});

test('games never touch storage, wait for animationend, or make their own cover', () => {
  const js = gameFiles.filter((f) => f.endsWith('.js'));
  const css = gameFiles.filter((f) => f.endsWith('.css'));
  none([
    ...scan(js, /\b(localStorage|sessionStorage|indexedDB|cookie)\b|navigator\.storage/, 'storage (condition 1)'),
    ...scan(js, /\b(animationend|transitionend|animationcancel)\b/, 'an animation event: use settle()'),
    ...scan(js, /(className\s*=|classList\.\w+\(|setAttribute\(\s*['"]class)[^;\n]*cover/i, 'a cover class: use lib/cover.js'),
    ...css.flatMap((file) => [...read(file).matchAll(/\.(-?[\w-]*cover[\w-]*)/gi)].filter((m) => m[1] !== 'cover').map((m) => `${file}: class .${m[1]}`)),
  ]);
});

test('reduced motion is read only by lib/settle.js, whose reduced() is the one copy (architecture 2.7)', () => {
  const js = ['app.js', ...shell, ...lib, ...gameFiles].filter((f) => f.endsWith('.js') && f !== 'lib/settle.js');
  none(scan(js, /prefers-reduced-motion/, 'reduced motion: import reduced() from lib/settle.js'));
});

test('no grade at run time or on screen: no deployed file names one (owner decision 2026-10-14, pedagogy 1.2)', () => {
  // Every deployed text file (architecture 1), parents labels included; Hebrew compared without
  // nikud, so both spellings of "class" (with and without yod) are caught.
  const deployed = [...site, ...listFiles(['.svg']).filter((f) => f.startsWith('assets/'))];
  const grade = /(?<![a-z])grade|כי?תה|כי?תות/i;
  none(deployed.flatMap((file) => read(file).split('\n').flatMap((line, i) => (grade.test(plain(line)) ? [`${file}:${i + 1}: a grade: levels and progression are independent of grade`] : []))));
});

/**
 * The repo paths a JS file imports or re-exports from, resolved from its folder (bare and URL specifiers as written).
 * @param {string} file
 */
const importsOf = (file) => [...read(file).matchAll(/^\s*(?:import|export)\b[^'"]*?\bfrom\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]/gm)]
  .map((m) => m[1] ?? m[2] ?? m[3])
  .map((spec) => (spec.startsWith('.') ? posix.join(posix.dirname(file), spec) : spec));

test('lib/ imports nothing and stays under 600 lines', () => {
  // Any import line or import() call, and any `export ... from`, so lib/ never passes the shell on to a game.
  none([
    ...scan(lib, /^\s*import\b|\bimport\(/, 'an import'),
    ...lib.flatMap((f) => importsOf(f).map((p) => `${f}: imports ${p}`)),
  ]);
  const lines = lib.reduce((n, f) => n + read(f).split('\n').length - 1, 0);
  assert.ok(lines < 600, `lib/ has ${lines} lines`);
});

test('shell/ imports only lib/, data/ and shell/; games never import shell/ or app.js; a game imports every lib/ module', () => {
  // Who imports a module decides where it lives (owner decision 2026-10-14): a module only the shell
  // imports is in shell/, and a game never reaches the shell's levels, storage or session (condition 1).
  const gameJs = gameFiles.filter((f) => f.endsWith('.js') && f.startsWith('games/'));
  none([
    ...shell.flatMap((f) => importsOf(f).filter((p) => !/^(lib|data|shell)\//.test(p)).map((p) => `${f}: imports ${p}`)),
    ...gameFiles.filter((f) => f.endsWith('.js')).flatMap((f) => importsOf(f).filter((p) => /^shell\/|^app\.js$/.test(p)).map((p) => `${f}: imports ${p}`)),
    ...lib.filter((m) => !gameJs.some((f) => importsOf(f).includes(m))).map((m) => `${m}: no game imports it; the shell's own code goes in shell/`),
  ]);
});

test('every e2e spec takes test from e2e/helpers.js, never from @playwright/test (architecture 4.5)', () => {
  // helpers.js's test carries the errors fixture: a spec on Playwright's own test would let a page
  // that throws or logs an error pass. JSDoc's import('@playwright/test') types are fine.
  const specs = all.filter((f) => /^e2e\/[^/]+\.spec\.js$/.test(f));
  assert.ok(specs.length > 0, 'no e2e specs found');
  none(specs.flatMap((f) => {
    const text = read(f);
    return [
      ...(/^\s*(import|export)\b[^;]*?\bfrom\s*['"]@playwright\/test['"]/m.test(text) ? [`${f}: imports from @playwright/test`] : []),
      ...(/^\s*import\s*\{[^}]*\btest\b[^}]*\}\s*from\s*['"]\.\/helpers\.js['"]/m.test(text) ? [] : [`${f}: does not import test from ./helpers.js`]),
    ];
  }));
});

// Features newer than Safari 16.4 (CLAUDE.md: the target). Neither the ES2022 + DOM type lib nor CI's
// WebKit (Playwright's current WebKit) catches them, so this list does. Before using a feature on it,
// check Safari 16.4 support; add any newer feature found later.
const NEWER = [
  ['CSS', /@starting-style|@scope\b|@position-try|\btext-wrap\b|\blight-dark\(|\bfield-sizing\b|\banchor-name\b|\bposition-anchor\b|\banchor\(|:user-(in)?valid|\bview-transition-name\b|\bcontent-visibility\b|\binterpolate-size\b|\bcalc-size\(|\btransition-behavior\b|\btext-box\b|@container\s+style\(|\blinear\(|\bcontain-intrinsic-|\bscrollbar-(gutter|width)\b|\b(animation|scroll|view)-timeline\b|\banimation-range\b|@view-transition\b/],
  ['HTML', /\bpopover\b|rel="modulepreload"|\bfetchpriority\b|<search\b/],
  ['JS', /\b(showPopover|hidePopover|togglePopover|checkVisibility|startViewTransition|requestIdleCallback|setHTMLUnsafe|moveBefore|withResolvers|groupBy)\b|\bscrollend\b|\.(union|intersection|symmetricDifference|isSubsetOf|isSupersetOf|isDisjointFrom)\(|\bAbortSignal\.any\b|\bIterator\.from\b|\b(canParse|requestClose)\b|\bURL\.parse\(|\.(keys|values|entries)\(\)\.(map|filter|take|drop|flatMap|reduce|toArray|forEach|some|every|find)\(/],
];

test('nothing newer than Safari 16.4 in site files (CLAUDE.md target; CI\'s WebKit is newer)', () => {
  none(NEWER.flatMap(([what, pattern]) => scan(site, pattern, `${what} newer than Safari 16.4`)));
});

test('the Safari 16.4 scan catches the features the bug hunt added (S9): each sample matches its list', () => {
  const samples = {
    CSS: ['.a { contain-intrinsic-size: 10px; }', 'html { scrollbar-gutter: stable; }', '.b { scrollbar-width: thin; }', '.c { animation-timeline: view(); }',
      '.d { scroll-timeline: --x; }', '.e { view-timeline-name: --y; }', '.f { animation-range: entry; }', '@view-transition { navigation: auto; }'],
    JS: ['URL.canParse(u)', 'dialog.requestClose()', 'URL.parse(u)'],
  };
  for (const [what, list] of Object.entries(samples)) {
    const pattern = NEWER.find(([w]) => w === what)[1];
    for (const sample of list) assert.match(sample, pattern, `${what}: ${sample}`);
  }
  // Safari 16.4 has plain font-size-adjust: not on the list.
  assert.doesNotMatch('.g { font-size-adjust: 0.5; }', NEWER[0][1]);
});

test('a press and hold is a tap on the child\'s screens: no iOS callout, no selection, the prefixed form for Safari 16.4 (bug hunt #17)', () => {
  const rule = read('app.css').split('\n').find((l) => l.startsWith('main:not([data-screen="parents"])'));
  assert.ok(rule, 'a rule on main outside the parents page');
  for (const decl of ['-webkit-touch-callout: none', '-webkit-user-select: none', 'user-select: none']) assert.ok(rule.includes(decl), decl);
});

test('zoom: no maximum-scale, user-scalable, gesturestart or touchmove (design 10)', () => {
  assert.doesNotMatch(read('index.html'), /maximum-scale|user-scalable/);
  none(scan(site, /gesturestart|touchmove/, 'a zoom blocker'));
  assert.match(read('app.css'), /html \{ touch-action: manipulation; \}/);
});

test('no network at play time: no http(s) URL in site files but the parents links; no emoji', () => {
  const urls = site.filter((f) => f !== 'data/videos.js');
  none([
    ...scan(urls, /https?:\/\/(?!www\.w3\.org\/2000\/svg)/, 'an http(s) URL'),
    ...scan(site, /\p{Extended_Pictographic}/u, 'an emoji'),
  ]);
});

test('no reward words in titles, text templates and the shell (R10, compared without nikud)', () => {
  const strings = [
    ...GAMES.flatMap((g) => [g.meta.title, ...g.text]),
    ...TOPICS.flatMap((t) => [t.title, ...t.videos.flatMap((v) => [v.label, v.who])]),
    ...['app.js', 'index.html', 'manifest.webmanifest', ...shell, ...lib].flatMap((f) => read(f).match(/[֐-׿][֐-׿\s'"-]*/g) ?? []),
  ].map(plain);
  const words = (s) => s.split(/[^א-ת]+/).filter(Boolean);
  none(strings.flatMap((s) => REWARD.filter((r) => (r.includes(' ') ? s.includes(r) : words(s).includes(r))).map((r) => `"${s}": ${r}`)));
});

/**
 * The selectors and keyframes names of a stylesheet (no nesting).
 * @param {string} css
 */
function cssParts(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const stack = [];
  const selectors = [];
  const keyframes = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      const prelude = text.slice(start, i).trim();
      if (prelude.startsWith('@keyframes')) keyframes.push(prelude.split(/\s+/)[1]);
      else if (!prelude.startsWith('@') && !stack.some((p) => p.startsWith('@keyframes'))) selectors.push(...prelude.split(',').map((s) => s.trim()));
      stack.push(prelude);
      start = i + 1;
    } else if (text[i] === '}' || (text[i] === ';' && !stack.length)) {
      if (text[i] === '}') stack.pop();
      start = i + 1;
    }
  }
  return { selectors, keyframes };
}

test('CSS: no nesting; game.css scoped to [data-game="<id>"], keyframes named after the id', () => {
  const css = all.filter((f) => f.endsWith('.css'));
  none(scan(css, /&/, 'CSS nesting'));
  const problems = [];
  for (const game of GAMES) {
    const file = new URL(game.meta.css).pathname.replace(/^.*?\/(games|tests)\//, '$1/');
    if (!existsSync(new URL(game.meta.css))) problems.push(`${game.meta.id}: ${file} is missing`);
    else {
      const { selectors, keyframes } = cssParts(read(file));
      if (!selectors.length) problems.push(`${file}: no selectors found`);
      for (const s of selectors) if (!s.startsWith(`[data-game="${game.meta.id}"]`)) problems.push(`${file}: selector "${s}" is not scoped`);
      for (const k of keyframes) if (!k.startsWith(game.meta.id)) problems.push(`${file}: keyframes ${k} does not start with ${game.meta.id}`);
    }
  }
  none(problems);
});

test('JSDoc type lines have no em dash (it breaks the parser)', () => {
  const js = listFiles(['.js', '.ts']);
  none(scan(js, /@(param|returns?|type|typedef|property|template|callback)\b.*—/, 'an em dash in a JSDoc type line'));
});

test('games/registry.js: one export line per game, sorted by id, each game in its own folder', () => {
  const lines = read('games/registry.js').split('\n').filter((l) => l.startsWith('export * as'));
  const ids = lines.map((l) => l.match(/from '\.\/([a-z0-9-]+)\/game\.js';$/)?.[1]);
  assert.ok(ids.every(Boolean), 'lines look like: export * as tenFrame from \'./ten-frame/game.js\';');
  assert.deepEqual(ids, [...ids].sort());
  for (const id of ids) assert.ok(existsSync(new URL(`../games/${id}/game.js`, import.meta.url)), id);
});

// The stories' geometry is scene.js's alone (architecture 2.8, 4.4, 4.9): in their game.css no
// geometry property, and no custom property, holds a literal length but a 1px that multiplies a
// variable (100cqw and 100cqh, the stage, aside), so a number that fails the Node geometry test
// changes in scene.js and never in CSS; every font has the floor --fmin, 14 in rounds and 0 in thumbs.
// One exception, named: the chips' and digits' top padding of GLYPH.pad em, which centres their ink.
const GEOMETRY = /^(--[\w-]+|left|top|right|bottom|inset(-[a-z-]+)?|(min-|max-)?(width|height)|border(-[a-z-]+)?|outline(-[a-z-]+)?|padding(-[a-z-]+)?|margin(-[a-z-]+)?|box-shadow|font-size|translate|transform)$/;
const LENGTH = /(?<![\w.-])\d*\.?\d+(px|em|rem|ex|ch|lh|vw|vh|vmin|vmax|[sld]v[wh]|cq(w|h|i|b|min|max)|cm|mm|in|pt|pc|q)\b/i;
/**
 * The declarations of a stylesheet whose geometry holds a literal length.
 * @param {string} css
 * @param {string[]} [allowed] declarations let through as they are
 * @returns {string[]}
 */
function literalLengths(css, allowed = []) {
  return [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--[\w-]+|[a-z-]+)\s*:\s*([^;{}]+)/gi)]
    .filter(([d, prop, value]) => !allowed.includes(d.trim()) && GEOMETRY.test(prop)
      && LENGTH.test(value.replace(/var\(--[\w-]+\)\s*\*\s*1px\b/g, '').replace(/\b100cq[wh]\b/g, '')))
    .map(([d]) => d.trim());
}

test('stories: game.css holds no literal length in its geometry but a 1px that multiplies a variable; fonts have the --fmin floor', async () => {
  // The scan catches what it is for.
  const sample = 'a { left: 3px; top: calc(var(--y) * 1px); --g: 2em; inset: 0; width: 50%; font-size: 14px; translate: 0 2px; '
    + 'right: calc(5 * 1px); bottom: calc(var(--b) * 1px + 2 * 1px); padding-top: 0.1em; margin: 0; padding-top: 0.12em; }';
  assert.deepEqual(literalLengths(sample, ['padding-top: 0.12em']),
    ['left: 3px', '--g: 2em', 'font-size: 14px', 'translate: 0 2px', 'right: calc(5 * 1px)', 'bottom: calc(var(--b) * 1px + 2 * 1px)', 'padding-top: 0.1em']);
  const { ROUND, THUMB, GLYPH } = await import('../games/stories/scene.js');
  const pad = `padding-top: ${GLYPH.pad}em`;
  const css = read('games/stories/game.css');
  none(literalLengths(css, [pad]).map((d) => `games/stories/game.css: ${d}`));
  // The padding is on the chips and the digits, and nowhere else.
  const padded = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{[^}]*padding-top: ([^;]+);/g)].map((m) => [m[1].trim(), m[2]]);
  assert.deepEqual(padded, [['[data-game="stories"] .st-chip', `${GLYPH.pad}em`], ['[data-game="stories"] .st-digit', `${GLYPH.pad}em`]]);
  const fonts = [...css.matchAll(/font-size\s*:\s*([^;}]+)/g)].map((m) => m[1].trim());
  assert.ok(fonts.length > 0);
  none(fonts.filter((f) => !f.startsWith('max(calc(var(--fmin) * 1px), ')).map((f) => `games/stories/game.css: font-size ${f} has no --fmin floor`));
  assert.deepEqual([ROUND.font.min, THUMB.font.min], [14, 0]);
  assert.match(read('games/stories/view.js'), /setProperty\('--fmin', num\(set\.font\.min\)\)/);
});
