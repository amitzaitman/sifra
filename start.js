#!/usr/bin/env node
// Local static server (after AlefBet's start.js), also used by Playwright.
// Usage: node start.js [port]   (default 8080). Fails when the port is taken; opens no browser.
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';

const ROOT = import.meta.dirname;
const PORT = Number.parseInt(process.argv[2] ?? '8080', 10);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * The file for a request path, or null. Paths stay inside the project folder.
 * @param {string} url
 * @returns {string | null}
 */
function resolvePath(url) {
  const clean = normalize(decodeURIComponent(url.split(/[?#]/)[0])).replace(/^[/\\]+/, '');
  let path = join(ROOT, clean);
  if (path !== ROOT && !path.startsWith(ROOT + sep)) return null;
  if (existsSync(path) && statSync(path).isDirectory()) path = join(path, 'index.html');
  return existsSync(path) && statSync(path).isFile() ? path : null;
}

const server = createServer((req, res) => {
  let path = null;
  try {
    path = resolvePath(req.url ?? '/');
  } catch {
    path = null;
  }
  if (!path) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`404: ${req.url}`);
    return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
  res.end(readFileSync(path));
});

server.once('error', (err) => {
  console.error(`sifra: cannot listen on port ${PORT}: ${err.message}`);
  process.exit(1);
});
server.listen(PORT, '127.0.0.1', () => console.log(`sifra: http://127.0.0.1:${PORT}/`));
