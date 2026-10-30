// The rounds lock (architecture 4.1): for each registered game, its meta.version and a sha256 of
// each level's rounds, seeds 1-50. Run: npm run lock. tests/lock.test.js rebuilds it in memory.
// Refuses to write when a level's rounds changed and the version did not, or a locked level id is gone.
import { createHash } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as registry from '../games/registry.js';
import { rng } from '../shell/rng.js';
import { ROOT, read } from './docs-parse.js';

export const LOCK = 'tests/rounds.lock.json';
/** The seeds of each level's rounds in its digest. */
export const SEEDS = 50;

/** @typedef {{ version: number, levels: Record<string, string> }} Locked one game: level id to digest */
/** @typedef {Record<string, Locked>} Lock game id to its entry */
/** @typedef {{ kind: 'version' | 'level' | 'stale', text: string }} Problem */

/**
 * The levels as the shell passes them to makeRound (app.js `built`): one per structure (or ask) of
 * a mixed level, the level itself otherwise.
 * @param {Level} level
 * @returns {Level[]}
 */
export function variants(level) {
  for (const key of ['structure', 'ask']) {
    if (Array.isArray(level[key])) return level[key].map((value) => ({ ...level, [key]: value }));
  }
  return [level];
}

/**
 * The sha256 of a level's rounds: JSON.stringify of makeRound for each variant and seed, one per line.
 * @param {Game} game
 * @param {Level} level
 * @returns {string}
 */
export function digest(game, level) {
  const hash = createHash('sha256');
  for (const passed of variants(level)) {
    for (let seed = 1; seed <= SEEDS; seed++) hash.update(`${JSON.stringify(game.makeRound(passed, rng(seed)))}\n`);
  }
  return hash.digest('hex');
}

/**
 * The lock of the games as they are now, levels in each game's order.
 * @param {Game[]} games
 * @returns {Lock}
 */
export function lockOf(games) {
  return Object.fromEntries(games.map((game) => [game.meta.id, {
    version: game.meta.version,
    levels: Object.fromEntries(game.levels.map((level) => [level.id, digest(game, level)])),
  }]));
}

/** @type {() => Lock} the stored lock, {} when there is none */
export const readLock = () => (existsSync(join(ROOT, LOCK)) ? JSON.parse(read(LOCK)) : {});

/** @type {(lock: Lock) => string} the lock file's text */
export const lockText = (lock) => `${JSON.stringify(lock, null, 2)}\n`;

/**
 * Where the stored lock and the games now disagree. `version`: a level's rounds changed and the
 * version did not go up (or it went down); `level`: a locked level id is no longer a level (storage
 * keys on it, architecture 2.2); neither is fixed by npm run lock. `stale`: npm run lock fixes it.
 * @param {Lock} stored
 * @param {Lock} now
 * @returns {Problem[]}
 */
export function compare(stored, now) {
  /** @type {Problem[]} */
  const problems = [];
  for (const [id, was] of Object.entries(stored)) {
    const is = now[id];
    if (!is) {
      problems.push({ kind: 'stale', text: `${id} is locked but not registered` });
      continue;
    }
    for (const level of Object.keys(was.levels)) {
      if (!(level in is.levels)) problems.push({ kind: 'level', text: `${id}: level id ${level} is locked and no level has it; put it back (a level id stays)` });
    }
    const changed = Object.keys(was.levels).filter((level) => level in is.levels && is.levels[level] !== was.levels[level]);
    if (is.version < was.version) {
      problems.push({ kind: 'version', text: `${id}: meta.version went down from ${was.version} to ${is.version}` });
    } else if (is.version === was.version && changed.length) {
      problems.push({ kind: 'version', text: `${id}: the rounds of ${changed.join(', ')} changed: bump meta.version (${is.version}), then run npm run lock` });
    } else if (is.version > was.version) {
      problems.push({ kind: 'stale', text: `${id}: meta.version is ${is.version} and the lock has ${was.version}` });
    }
    const added = Object.keys(is.levels).filter((level) => !(level in was.levels));
    if (added.length) problems.push({ kind: 'stale', text: `${id}: ${added.join(', ')} not locked yet` });
  }
  for (const id of Object.keys(now)) if (!stored[id]) problems.push({ kind: 'stale', text: `${id} is not locked yet` });
  return problems;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const stored = readLock();
  const now = lockOf(Object.values(registry));
  const refused = compare(stored, now).filter((p) => p.kind !== 'stale');
  if (refused.length) {
    console.error(`${LOCK} not written:\n${refused.map((p) => `  ${p.text}`).join('\n')}`);
    process.exitCode = 1;
  } else if (existsSync(join(ROOT, LOCK)) && read(LOCK) === lockText(now)) {
    console.log(`${LOCK} is up to date`);
  } else {
    writeFileSync(join(ROOT, LOCK), lockText(now));
    console.log(`wrote ${LOCK}: ${Object.entries(now).map(([id, g]) => `${id} ${g.version}`).join(', ')}`);
  }
}
