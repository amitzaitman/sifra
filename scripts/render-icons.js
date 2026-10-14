// Renders assets/icon.svg to the PNG icons of the manifest and iOS with Chromium (npm run icons).
// The art keeps to the centre 80%, so the same picture serves as the maskable icon.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { ROOT } from './docs-parse.js';

const svg = readFileSync(join(ROOT, 'assets/icon.svg'), 'utf8');
const sizes = { 'icon-192.png': 192, 'icon-512.png': 512, 'icon-maskable-512.png': 512, 'apple-touch-icon.png': 180 };
const browser = await chromium.launch();
for (const [name, size] of Object.entries(sizes)) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await page.screenshot({ path: join(ROOT, 'assets', name) });
  await page.close();
  console.log(`wrote assets/${name}`);
}
await browser.close();
