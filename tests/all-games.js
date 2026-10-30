// Every game the generic tests run: the registered ones and the fixtures.
import * as registry from '../games/registry.js';
import * as parts from './fixtures/parts/game.js';
import * as scale from './fixtures/scale/game.js';
import * as story from './fixtures/story/game.js';

/** @type {Game[]} */
export const GAMES = [...Object.values(registry), parts, scale, story];
