// The level ladder of one game (architecture 3.4, pedagogy 5.3-5.4). Pure: new states out.

/** @type {(levels: Level[], id?: string) => Ladder} a new ladder at a level (default level 1), in its fast climb */
export const startLadder = (levels, id = levels[0].id) =>
  ({ level: id, fast: id, streak: 0, window: [], passed: [], at: {}, demoSeen: [], demoDue: null, hold: null });

/**
 * Moves the ladder to a level (a next-step jump, a stuck return). again (a stuck return): that
 * level's demo runs once more, and the next step holds this game until the level is passed (3.7).
 * @type {(state: Ladder, id: string, again?: boolean) => Ladder}
 */
export const moveTo = (state, id, again = false) =>
  ({ ...state, level: id, fast: null, streak: 0, window: [], demoDue: again ? id : state.demoDue, hold: again ? id : state.hold ?? null });

/** @type {(levels: Level[], id: string) => number} the index of a level id (0 when it is gone) */
export const indexOf = (levels, id) => Math.max(0, levels.findIndex((l) => l.id === id));

/**
 * Whether a round at this level opens with the demo: always after a stuck return; else when the
 * level has one, it was not seen, and it was not just reached by a fast promotion.
 * @type {(state: Ladder, level: Level) => boolean}
 */
export const needsDemo = (state, level) =>
  state.demoDue === level.id ||
  (Boolean(level.demo) && !state.demoSeen.includes(level.id) && (state.fast === null || state.fast === level.id));

/** @type {(state: Ladder, id: string) => Ladder} a demo adds its level to demoSeen when it starts */
export const sawDemo = (state, id) => ({
  ...state,
  demoSeen: state.demoSeen.includes(id) ? state.demoSeen : [...state.demoSeen, id],
  demoDue: state.demoDue === id ? null : state.demoDue,
});

/**
 * Applies a counted round's outcome. Reviews change nothing. Mixed rounds count toward going up
 * (a miss breaks the run of first tries) and never lower the level. Passing a held level ends the
 * hold. Stuck: 10 rounds or more at an unpassed level, over 2 sessions or more, under half first tries.
 * @param {Ladder} state
 * @param {Level[]} levels
 * @param {{ outcome: string, kind: string, session: number }} round
 * @returns {{ state: Ladder, passed: string | null, stuck: boolean }}
 */
export function step(state, levels, { outcome, kind, session }) {
  if (kind === 'review') return { state, passed: null, stuck: false };
  const s = structuredClone(state);
  const played = s.level;
  const i = indexOf(levels, played);
  const up = Math.min(i + 1, levels.length - 1);
  const first = outcome === 'first';
  let passed = null;
  const go = (j) => Object.assign(s, { level: levels[j].id, streak: 0, window: [] });
  const pass = (id) => {
    if (!s.passed.includes(id)) s.passed.push(id);
    if (s.hold === id) s.hold = null;
    delete s.at[id];
    passed = id;
  };
  if (!s.passed.includes(played)) {
    const at = s.at[played] ?? { n: 0, first: 0, sessions: 0, lastSession: null };
    const fresh = at.lastSession !== session;
    s.at[played] = { n: at.n + 1, first: at.first + (first ? 1 : 0), sessions: at.sessions + (fresh ? 1 : 0), lastSession: session };
  }
  if (s.fast !== null && first) {
    // The child showed the level: passed, seen, one up.
    pass(played);
    if (!s.demoSeen.includes(played)) s.demoSeen.push(played);
    go(up);
  } else if (s.fast !== null) {
    // The climb ends. A level reached by a fast promotion may rest on a guess: back one, unmarked.
    // Stay at the climb's start, at the last level once passed, and after a mixed round (5.6).
    const start = indexOf(levels, s.fast);
    s.fast = null;
    if (i > start && !s.passed.includes(played) && kind !== 'mixed') {
      s.passed = s.passed.filter((id) => id !== levels[i - 1].id);
      go(i - 1);
    }
  } else {
    s.streak = first ? s.streak + 1 : 0;
    if (kind === 'new') s.window = [...s.window, outcome].slice(-4);
    if (s.streak >= 4) {
      pass(played);
      go(up);
    } else if (s.window.filter((o) => o !== 'first').length >= 2) go(Math.max(i - 1, 0));
  }
  const at = s.at[played];
  const stuck = Boolean(at && at.n >= 10 && at.sessions >= 2 && at.first / at.n < 0.5);
  if (stuck) s.at[played] = { n: 0, first: 0, sessions: 0, lastSession: null };
  return { state: s, passed, stuck };
}
