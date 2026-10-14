// The code's copies of the docs stay in sync (architecture 4.1): data/ regenerated in memory and
// compared byte for byte, the parents-page URLs against the doc, and app.css's design block.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generate } from '../scripts/gen-data.js';
import { read, underHeading } from '../scripts/docs-parse.js';
import { TOPICS, VERIFIED } from '../data/videos.js';

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
