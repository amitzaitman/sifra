// Code scans (architecture 4.4; R5, R7, R10 [code]; decisions.md "ready to grow" conditions).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { listFiles, read } from '../scripts/docs-parse.js';
import { GAMES } from './all-games.js';
import { TOPICS } from '../data/videos.js';

const all = listFiles(['.js', '.css', '.html', '.webmanifest']);
const lib = all.filter((f) => f.startsWith('lib/'));
// The games: registered ones and the fixtures, which keep the same rules.
const gameFiles = all.filter((f) => /^(games\/[^/]+\/|tests\/fixtures\/)/.test(f));
const site = all.filter((f) => /^(index\.html|manifest\.webmanifest|app\.(js|css)|lib\/|data\/|games\/)/.test(f));
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
  none(scan(['app.js', ...lib, ...gameFiles.filter((f) => f.endsWith('.js'))], /\b(setTimeout|setInterval|requestAnimationFrame)\b/, 'a timer'));
});

test('no Math.random in lib/ or games (makeRound uses its rng)', () => {
  none(scan([...lib, ...gameFiles], /Math\.random/, 'Math.random'));
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

test('no grade at run time: lib/, app.js and data/skills.js never name one (owner decision 2026-10-14)', () => {
  none(scan(['app.js', 'data/skills.js', ...lib], /(?<![a-z])grade/i, 'a grade: levels and progression are independent of grade'));
});

test('lib/ imports nothing and stays under 600 lines', () => {
  none(scan(lib, /^\s*import\b|\bimport\(/, 'an import'));
  const lines = lib.reduce((n, f) => n + read(f).split('\n').length - 1, 0);
  assert.ok(lines < 600, `lib/ has ${lines} lines`);
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
    ...['app.js', 'index.html', 'manifest.webmanifest', ...lib].flatMap((f) => read(f).match(/[֐-׿][֐-׿\s'"-]*/g) ?? []),
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
