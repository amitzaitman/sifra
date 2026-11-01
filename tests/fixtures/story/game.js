// Fixture game for the shell's tests (not in games/registry.js): a story, standing in for game 3. Its
// picture moves before its '?' (an event under [data-event]) and builds the equation row with it
// (ctx.build, architecture 2.4); the rounds are the parts fixture's. Only fixture.html?story loads it:
// its skill would move the next step of the default fixture page.
import { reduced, settle } from '../../../lib/settle.js';
import * as parts from '../parts/game.js';
import { render as draw } from '../kit.js';

export const meta = { id: 'story', title: 'סִפּוּר', version: 1, css: new URL('game.css', import.meta.url).href };

/** @type {Level[]} */
export const levels = [
  // exclude (architecture 4.2): the known part is 1 or more and never the whole. whole = part + ? in a third of the rounds.
  // In objects: the first level of a skill on a model that is no classroom tool (decisions.md "תפקיד האתר").
  { id: 'event', skill: 'addsub.meaning.part-whole', structure: 'part-whole', unknown: 'part', model: 'scene', look: 'objects', terms: false,
    demo: true, max: 5, options: 4, forms: [{ eqform: 'reversed', w: 1 }, { eqform: 'standard', w: 2 }], exclude: [0, 5] },
];

export const text = [];
export const rules = parts.rules;
export const displays = parts.displays;
export const makeRound = parts.makeRound;

/**
 * The parts picture with an event: the part arrives with the sum's first number, then the covered
 * unknown with its operator and '?', then the rest of the row. A tap finishes it first: every
 * animation under [data-event] ends, then a miss rewrites the row with setEquation (which shows every
 * token, 2.4) and a solve finds it shown by the shell. The demo waits for its end. Thumbs, reduced
 * motion: the end at once, before render returns (a thumb's catch sees only a synchronous throw, 2.4).
 * Test hook: globalThis.storyBuild is the build of the last round or demo drawn, so a test can send a
 * late build after the solve or the abort, as a chain that resumes after a tap would.
 * @param {HTMLElement} host
 * @param {Round} round
 * @param {RenderContext} ctx
 * @returns {RoundView}
 */
export function render(host, round, ctx) {
  const { signal, mode } = ctx;
  const view = draw(host, round, ctx, meta.title, displays);
  const row = /** @type {HTMLElement} */ (host.querySelector('.fx-row'));
  // The sum's first token in [...left, '=', ...right]: 0 in part + ? = whole, 2 in whole = part + ?.
  const at = round.equation.left.length > 1 ? 0 : 2;
  if (mode !== 'thumb') /** @type {any} */ (globalThis).storyBuild = ctx.build;
  let ended = mode === 'thumb' || reduced();
  /** @param {(() => void)} after */
  const finish = (after) => {
    if (ended) return;
    ended = true;
    for (const a of row.getAnimations({ subtree: true })) a.finish();
    row.removeAttribute('data-event');
    after();
  };
  if (ended) ctx.build(null);
  const story = ended ? Promise.resolve() : (async () => {
    for (const [i, tokens] of [[at], [at, at + 1, at + 2]].entries()) {
      ctx.build(tokens);
      row.dataset.event = String(i + 1);
      await settle(row, signal);
      if (ended || signal.aborted) return;
    }
    finish(() => ctx.build(null));
  })();
  return {
    ...view,
    async miss(m) {
      finish(() => ctx.setEquation(round.equation));
      return view.miss(m);
    },
    async solve() {
      finish(() => ctx.build(null));
      return view.solve();
    },
    async demo(hand) {
      await story;
      if (!signal.aborted) await view.demo(hand);
    },
  };
}
