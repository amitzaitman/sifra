// The code's copies of the docs stay in sync (architecture 4.1): data/ regenerated in memory and
// compared byte for byte, the parents-page URLs against the doc, app.css's design block, and the
// device check's levels with three cards against the games.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generate } from '../scripts/gen-data.js';
import { read, underHeading } from '../scripts/docs-parse.js';
import { TOPICS, VERIFIED } from '../data/videos.js';
import * as registry from '../games/registry.js';

test('data/ is what scripts/gen-data.js makes from the docs (run npm run gen)', () => {
  for (const [path, text] of generate()) assert.equal(read(path), text, `${path} is out of date: run npm run gen`);
});

test('data/videos.js has exactly the links of the parents page in docs/parents-videos.md', () => {
  const doc = read('docs/parents-videos.md');
  const page = ['## כללי (להורים)', '## לפי נושא'].map((h) => underHeading(doc, h) ?? '').join('\n');
  const urls = (text) => [...text.matchAll(/https:\/\/www\.youtube\.com\/watch\?v=[\w-]+/g)].map((m) => m[0]).sort();
  const listed = TOPICS.flatMap((t) => t.videos.map((v) => v.url)).sort();
  assert.ok(urls(page).length > 0);
  assert.deepEqual(listed, urls(page));
  assert.equal(typeof VERIFIED, 'boolean');
  for (const t of TOPICS) for (const v of [t.title, ...t.videos.flatMap((x) => [x.label, x.who])]) assert.match(v, /[ְ-ּ]/, `${v}: Hebrew with nikud`);
});

test('app.css starts with the design.md section 3 block, verbatim', () => {
  const block = read('docs/design.md').match(/```css\n([\s\S]*?)```/)[1];
  assert.ok(read('app.css').startsWith(block), 'copy the block from docs/design.md section 3 to the top of app.css');
});

/** How docs/device-checks.md names each game. */
const NAMES = { 'ten-frame': 'מסגרת העשר', balance: 'המאזניים', stories: 'הסיפורים' };

test('device-checks.md names exactly the levels with three cards, where the first miss brings the hint too (hunt 2 #7)', () => {
  const games = Object.values(registry);
  for (const g of games) assert.ok(NAMES[g.meta.id], `${g.meta.id}: add the name device-checks.md gives it to NAMES`);
  const three = games.flatMap((g) => g.levels.flatMap((l, i) => (l.options === 3 ? [`רמה ${i + 1} של ${NAMES[g.meta.id]}`] : [])));
  const item = read('docs/device-checks.md').replace(/\s+/g, ' ').match(/\*\*סולם העזרה:\*\*.*?(?= - \*\*)/)?.[0] ?? '';
  // "ברמה עם שלושה כרטיסים (רק רמה 1 של מסגרת העשר; ...)": the levels after "רק", up to the ';' or ')'.
  const named = (item.match(/שלושה כרטיסים \(רק ([^;)]*)/)?.[1] ?? '').split(/, | ו(?=רמה)/).map((x) => x.trim()).filter(Boolean);
  assert.deepEqual(named, three, 'the help ladder item of device-checks.md');
});
