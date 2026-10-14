// Sessions, review, the next step and the stuck child (architecture 3.3, 3.5-3.7). Pure functions
// over the child's data; the shell passes the games, SKILLS and the random generators in.

const DAY = 86400000;
const GAPS = [1, 3, 7, 14];

/** @type {(date: Date) => string} the local day, YYYY-MM-DD */
export const dayOf = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
/** @type {(day: string) => number} */
const utc = (day) => Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10));
/** @type {(day: string, n: number) => string} */
export const addDays = (day, n) => new Date(utc(day) + n * DAY).toISOString().slice(0, 10);
/** @type {(a: string, b: string) => number} */
export const daysBetween = (a, b) => Math.round((utc(b) - utc(a)) / DAY);

/** @type {(game: Game, skill: string) => number[]} indexes of a game's levels of a skill */
const levelsOf = (game, skill) => game.levels.flatMap((l, i) => (l.skill === skill ? [i] : []));
/** @type {(games: Game[], skill: string) => boolean} */
const offered = (games, skill) => games.some((g) => levelsOf(g, skill).length > 0);
/** @type {(child: Child, game: Game, i: number) => boolean} */
const isPassed = (child, game, i) => child.games[game.meta.id]?.passed.includes(game.levels[i].id) ?? false;
/** @type {(child: Child, game: Game, skill: string) => number[]} */
const passedOf = (child, game, skill) => levelsOf(game, skill).filter((i) => isPassed(child, game, i));

/** @type {(games: Game[], skills: Skill[]) => Game[]} home order: by the SKILLS position of the first level's skill */
export function homeOrder(games, skills) {
  const pos = (g) => skills.findIndex((s) => s.id === g.levels[0]?.skill);
  return [...games].sort((a, b) => pos(a) - pos(b));
}

/** @type {(level: Level) => boolean} a level whose structure or ask the planner picks */
export const isMixed = (level) => Array.isArray(level.structure) || Array.isArray(level.ask);

/**
 * The structure (or ask) of a mixed level's round: the first uniform, then another value with
 * probability 0.4 (R3, R11). Plain levels give {}.
 * @param {Level} level
 * @param {string | null} prev the value of the previous mixed round
 * @param {Rng} mix
 * @returns {{ structure?: string, ask?: string }}
 */
export function pickMix(level, prev, mix) {
  const key = Array.isArray(level.structure) ? 'structure' : Array.isArray(level.ask) ? 'ask' : null;
  if (!key) return {};
  const values = /** @type {string[]} */ (level[key]);
  if (prev === null || !values.includes(prev)) return { [key]: mix.pick(values) };
  return { [key]: mix.next() < 0.4 ? mix.pick(values.filter((v) => v !== prev)) : prev };
}

/** @type {(child: Child, games: Game[], skill: string) => boolean} passed: its last level, in some game, is passed */
export const skillPassed = (child, games, skill) =>
  games.some((g) => levelsOf(g, skill).length > 0 && isPassed(child, g, levelsOf(g, skill).at(-1)));

/** @type {(child: Child, games: Game[], skill: string) => boolean} R11: passed, then first-try reviews on two days */
export const mastered = (child, games, skill) =>
  skillPassed(child, games, skill) && (child.skills[skill]?.reviewDays.length ?? 0) >= 2;

/** @type {(skills: Skill[], skill: string, level: Level) => string[]} base, then each met `when` */
export function prereqs(skills, skill, level) {
  const row = skills.find((s) => s.id === skill);
  const meets = (cond) => Object.entries(cond).every(([param, test]) => {
    const [, op, want] = test.match(/^(>=|<=|>|<|=)(.*)$/);
    return [level[param]].flat().some((v) => {
      const [a, b] = [Number(v), Number(want)];
      if (v === undefined) return false;
      return op === '=' ? String(v) === want : op === '>' ? a > b : op === '<' ? a < b : op === '>=' ? a >= b : a <= b;
    });
  });
  return row ? [...row.requires.base, ...row.requires.when.filter((w) => meets(w.if)).flatMap((w) => w.add)] : [];
}

/**
 * The next step (pedagogy 5.12): the first skill in SKILLS order that a game offers, not passed,
 * whose prerequisites for the level it would open are passed or offered by no game. That game's
 * level if it has the skill, else the skill's lowest unpassed level there. None: the first game.
 * @param {Child} child
 * @param {Game[]} games
 * @param {Skill[]} skills
 * @returns {{ game: Game, index: number } | null}
 */
export function nextStep(child, games, skills) {
  const ordered = homeOrder(games, skills);
  const at = (g) => (child.games[g.meta.id] ? g.levels.findIndex((l) => l.id === child.games[g.meta.id].level) : -1);
  for (const { id } of skills) {
    const game = ordered.find((g) => levelsOf(g, id).length > 0);
    if (!game || skillPassed(child, games, id)) continue;
    const index = game.levels[at(game)]?.skill === id ? at(game) : levelsOf(game, id).find((i) => !isPassed(child, game, i));
    if (prereqs(skills, id, game.levels[index]).every((p) => skillPassed(child, games, p) || !offered(games, p))) {
      return { game, index };
    }
  }
  return ordered.length ? { game: ordered[0], index: Math.max(0, at(ordered[0])) } : null;
}

/**
 * Where a stuck child goes (pedagogy 5.4): the first prerequisite, in written order, not mastered
 * and offered by a game, at its highest passed level there, else its first; if none, the previous
 * level of the same skill, else the previous level in the list, else stay. missing: unmastered
 * prerequisites that no game offers.
 * @param {Child} child
 * @param {Game[]} games
 * @param {Game} game
 * @param {number} index the stuck level
 * @param {Skill[]} skills
 * @returns {{ game: Game, index: number, missing: string[] }}
 */
export function stuckTarget(child, games, game, index, skills) {
  const { skill } = game.levels[index];
  const ordered = homeOrder(games, skills);
  let to = null;
  const missing = [];
  for (const p of prereqs(skills, skill, game.levels[index])) {
    const g = ordered.find((x) => levelsOf(x, p).length > 0);
    if (mastered(child, games, p)) continue;
    if (!g) missing.push(p);
    else to ??= { game: g, index: passedOf(child, g, p).at(-1) ?? levelsOf(g, p)[0] };
  }
  to ??= { game, index: levelsOf(game, skill).filter((i) => i < index).at(-1) ?? Math.max(0, index - 1) };
  return { ...to, missing };
}

/**
 * The review rounds that open a session (R11, architecture 3.5): scheduled skills of grade 1-2
 * games, last played before today, by due date then SKILLS order; two when two or more are due,
 * else one, due or not. At the highest passed level; one lower after a failed last review when
 * that level has the same skill, model and look.
 * @param {Child} child
 * @param {Game[]} games
 * @param {string} today
 * @param {Skill[]} skills
 * @returns {{ game: Game, index: number }[]}
 */
export function reviews(child, games, today, skills) {
  const band = homeOrder(games, skills).filter((g) => g.meta.grades.every((n) => n >= 1 && n <= 2));
  const pos = (id) => skills.findIndex((s) => s.id === id);
  const pool = Object.entries(child.skills)
    .filter(([id, s]) => s.due && s.last !== null && s.last < today && band.some((g) => passedOf(child, g, id).length))
    .sort(([a, x], [b, y]) => x.due.localeCompare(y.due) || pos(a) - pos(b));
  const want = pool.filter(([, s]) => s.due <= today).length >= 2 ? 2 : 1;
  return pool.slice(0, want).map(([id, s]) => {
    const game = band.find((g) => passedOf(child, g, id).length);
    const index = passedOf(child, game, id).at(-1);
    const [lower, level] = [game.levels[index - 1], game.levels[index]];
    const same = lower?.skill === level.skill && lower.model === level.model && lower.look === level.look;
    return { game, index: s.lastReviewFirst === false && same ? index - 1 : index };
  });
}

/**
 * The 8 counted rounds of a session (architecture 3.3): reviews, then new rounds in the chosen
 * game, whose level (index -1 here) is filled in when each starts.
 * @param {Child} child
 * @param {Game[]} games
 * @param {Game} game
 * @param {string} today
 * @param {Skill[]} skills
 * @param {Rng} seeds draws the round seeds
 * @param {Rng} mix picks the structures of mixed review levels
 * @returns {Spec[]}
 */
export function planSession(child, games, game, today, skills, seeds, mix) {
  const seed = () => Math.floor(seeds.next() * 4294967296) >>> 0;
  /** @type {Spec[]} */
  const rounds = reviews(child, games, today, skills).map((r) => ({
    game: r.game.meta.id, index: r.index, seed: seed(), kind: 'review', ...pickMix(r.game.levels[r.index], null, mix),
  }));
  while (rounds.length < 8) rounds.push({ game: game.meta.id, index: -1, seed: seed(), kind: 'new' });
  return rounds;
}

/**
 * A skill's review schedule after a solved round (R11): its first passed level starts it (box 0,
 * due the next day); a review moves the box up on a first try, else to 0.
 * @param {Record<string, SkillState>} states child.skills
 * @param {string} skill
 * @param {{ day: string, kind: string, outcome: string, passed: boolean }} round
 */
export function schedule(states, skill, { day, kind, outcome, passed }) {
  const s = (states[skill] ??= { last: null, passedDay: null, box: 0, due: null, reviewDays: [], lastReviewFirst: null });
  if (kind === 'review') {
    const first = outcome === 'first';
    Object.assign(s, { box: first ? Math.min(3, s.box + 1) : 0, lastReviewFirst: first });
    s.due = addDays(day, GAPS[s.box]);
    if (first && s.passedDay && day > s.passedDay && !s.reviewDays.includes(day)) s.reviewDays.push(day);
  } else if (passed && !s.passedDay) {
    Object.assign(s, { passedDay: day, box: 0, due: addDays(day, 1) });
  }
  s.last = day;
}
