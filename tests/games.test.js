// The generic game test (architecture 4.2, dev-spec A.2, decisions.md condition 5): every
// registered game and the fixtures, every level, seeds 1-200, the deal (each form's share over
// seeds 1-5000, every answer of the range over seeds 1-2000) and the demo's round (R9, seeds
// 1-2000), in Node with no DOM and no storage. A new game gets all of it without writing a test. Choice rounds only for now: the
// build and estimate checks of A.2 come with the first game that has such rounds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { GAMES } from './all-games.js';
import * as parts from './fixtures/parts/game.js';
import * as scale from './fixtures/scale/game.js';
import { TRIES, apartSeed, demoSeedFor, exerciseOf, pickMix, plainDemo, prereqs } from '../shell/planner.js';
import { rng } from '../shell/rng.js';
import { RULES } from '../data/errors.js';
import { FORMS } from '../data/forms.js';
import { MODEL_ORDER } from '../data/models.js';
import { SKILLS } from '../data/skills.js';
import { SKILLS as SKILLS_MD, parseParams, read } from '../scripts/docs-parse.js';
import { variants } from '../scripts/lock-rounds.js';
import { cues } from './cues.js';

const SEEDS = 200;
/** The deal's seeds for the shares: the balance's old drift, 16% for 20% on level 5 (architecture 6), is 6 sigma out. */
const DEAL = 5000;
/** The seeds within which every answer of a level's range is dealt. */
const COVER = 2000;
/** @type {(p: number) => number} how far a form's share may be from its weight p: 4 standard deviations over DEAL seeds */
const slack = (p) => 4 * Math.sqrt((p * (1 - p)) / DEAL);
const PARAMS = parseParams(read(SKILLS_MD));
const LOOKS = ['objects', 'dots', 'symbols'];
const RELATIONS = ['<', '>', '=', 'left', 'right', 'level'];
const OPERATORS = ['+', '−', '×', ':'];
const METEG = String.fromCharCode(0x05bd);
const REQUIRED = { id: 'string', skill: 'string', demo: 'boolean', options: 'number', model: 'string', look: 'string', terms: 'boolean' };

const skillOf = (id) => SKILLS.find((s) => s.id === id);
const show = (x) => JSON.stringify(x);
/**
 * The models that draw the classroom tool itself, a picture of real objects at a skill's first level (decisions.md
 * 2026-10-31, "ציור של חפצים אמיתיים"): counters in a frame (`frame`) or in rows (`set`), straws and bundles
 * (`bundles`), the balance's cubes (`balance`, and `cards`, the judging round's pans).
 */
const TOOLS = ['frame', 'set', 'bundles', 'balance', 'cards'];
/** @type {(level: Level) => boolean} a level that draws real objects (decisions.md "תפקיד האתר") */
const real = (level) => level.look === 'objects' || TOOLS.includes(level.model);

/** R4's written exception (rules.md, owner decision 2026-10-14): the skills whose doubles make given.part the answer. */
const DOUBLES = ['num.parts.split', 'num.parts.make-ten'];

const predicts = (predicted, value) =>
  predicted !== null && typeof predicted === 'object' && Array.isArray(predicted.oneOf)
    ? predicted.oneOf.some((p) => isDeepStrictEqual(p, value))
    : predicted !== null && predicted !== undefined && isDeepStrictEqual(predicted, value);

/**
 * Runs fn with Math.random throwing (makeRound may use only the rng it is given).
 * @template T
 * @param {() => T} fn
 * @returns {T}
 */
function withoutRandom(fn) {
  const random = Math.random;
  Math.random = () => {
    throw new Error('Math.random called inside makeRound');
  };
  try {
    return fn();
  } finally {
    Math.random = random;
  }
}

/**
 * Evaluates a token list, × and : before + and −, with the '?' leaves taken from values in order.
 * @param {any[]} tokens
 * @param {number[]} values
 */
function evaluate(tokens, values) {
  const nums = tokens.map((t) => (t === '?' ? values.shift() : t));
  const terms = [nums[0]];
  const ops = [];
  for (let i = 1; i < nums.length; i += 2) {
    const [op, n] = [nums[i], nums[i + 1]];
    if (op === '×') terms.push(terms.pop() * n);
    else if (op === ':') terms.push(terms.pop() / n);
    else {
      ops.push(op);
      terms.push(n);
    }
  }
  return ops.reduce((acc, op, i) => (op === '+' ? acc + terms[i + 1] : acc - terms[i + 1]), terms[0]);
}

/** f(values) = left - right, the '?' leaves of both sides in reading order. */
const balance = (equation, values) => {
  const queue = [...values];
  return evaluate(equation.left, queue) - evaluate(equation.right, queue);
};
const shapeOf = (tokens) => tokens.map((t) => (typeof t === 'number' ? 'n' : t));
/** A side of a card: number, operator, number, ... with no '?'. */
const exercise = (side) => Array.isArray(side) && side.length % 2 === 1 && side.every((t, i) => (i % 2 ? OPERATORS.includes(t) : typeof t === 'number'));
const fits = (shape, form) =>
  shape.length === form.length && shape.every((t, i) => t === form[i] || (form[i] === '∘' && (t === '+' || t === '−')));

/** Whether a value has one of a rule's declared types (architecture 2.3). */
function typed(value, types) {
  const number = typeof value === 'number' || (Array.isArray(value) && value.every((v) => typeof v === 'number'));
  return types.some((type) => ({
    any: true,
    number,
    relation: RELATIONS.includes(value),
    card: value !== null && typeof value === 'object' && Array.isArray(value.left) && Array.isArray(value.right),
    picture: value !== null && typeof value === 'object' && !Array.isArray(value),
    order: Array.isArray(value),
  })[type]);
}

/**
 * Whether a rule's value is a wrong card at all (R4): of the rule's type, not the answer; a number
 * a whole number of at most 4 digits; a pair not one that makes the whole (architecture 6, "Pair
 * cards"); an exercise card false.
 * @param {any} value
 * @param {string} rule
 * @param {Round} round
 */
function cardable(value, rule, round) {
  const types = RULES[rule].types;
  if (value === null || value === undefined || !typed(value, types) || isDeepStrictEqual(value, round.answer)) return false;
  const whole = (n) => Number.isInteger(n) && n >= 0;
  if (typeof value === 'number') return whole(value) && String(value).length <= 4;
  if (Array.isArray(value) && value.every((v) => typeof v === 'number')) {
    const sum = (pair) => pair.reduce((a, b) => a + b, 0);
    return value.every(whole) && value.join('').length <= 4 && !(Array.isArray(round.answer) && sum(value) === sum(round.answer));
  }
  if (typed(value, ['card'])) return exercise(value.left) && exercise(value.right) && balance(value, []) !== 0;
  return true;
}

/**
 * Whether a rule's value could be a card of this round (R4): a wrong card, its display one the game
 * draws (displays, canShow) and within its budget.
 * @param {any} value
 * @param {string} rule
 * @param {Round} round
 * @param {Game} game
 */
function offerable(value, rule, round, game) {
  return cardable(value, rule, round) && drawn(game, round, { value, rule }).length === 0 && !game.budget?.(round, { value, rule });
}

/**
 * Why the game cannot draw a wrong choice's display (architecture 2.1), none when it can: the
 * display is not in the game's `displays`, or `canShow`, where the game exports it, says no.
 * @param {Game} game
 * @param {Round} round
 * @param {Choice} choice
 * @returns {string[]}
 */
function drawn(game, round, { value, rule }) {
  const display = RULES[rule]?.display;
  if (!display) return [];
  if (!Array.isArray(game.displays) || !game.displays.includes(display)) return [`${display} is not in the game's displays`];
  return game.canShow && !game.canShow(round, { value, rule }) ? [`canShow says the picture cannot draw its ${display}`] : [];
}

/**
 * R1 and R8 of a judging round (architecture 2.3, eq.sign.true-false): the answer is a card, the
 * cards are the exercises, and the equation row is empty. Every card has numbers and operators on
 * both sides and no '?'; the answer card is true and every other card false.
 * @param {Round} round
 * @returns {string[]}
 */
function checkJudging(round) {
  const problems = [];
  if (round.equation !== null) problems.push('R1: a judging round has equation null: its exercises are on the cards');
  for (const { value, rule } of round.choices ?? []) {
    if (!typed(value, ['card']) || !exercise(value.left) || !exercise(value.right)) {
      problems.push(`R8: the card ${show(value)} is not numbers and operators on both sides, without '?'`);
    } else if ((balance(value, []) === 0) !== (rule === null)) {
      problems.push(`R1: the card ${show(value)} is ${rule === null ? 'the answer but false' : `tagged ${rule} but true`}`);
    }
  }
  return problems;
}

/** @type {(level: Level, form: LevelForm) => string} a form's unknown and eqform, the level's where it sets none */
const pairOf = (level, form) => `${form.unknown ?? level.unknown}/${form.eqform ?? 'standard'}`;

/**
 * A level's forms and exclude list (architecture 2.2, 4.2): an unknown that varies has forms, an
 * eqform is one value (forms list the others); each form a listed unknown and a skills.md eqform,
 * once, with a weight; every listed unknown in a form; R8's 25% not standard when a form is not.
 * exclude: numbers of the level's range.
 * @param {Level} level
 * @returns {string[]}
 */
function checkForms(level) {
  const problems = [];
  const fail = (msg) => problems.push(msg);
  if (Array.isArray(level.eqform)) fail('eqform is one value: a level that deals several lists them in forms');
  if (Array.isArray(level.unknown) && !level.forms) fail('a mixed unknown needs forms, the share of each');
  const unknowns = [level.unknown].flat();
  const forms = level.forms ?? [];
  if (level.forms && (!Array.isArray(forms) || forms.length < 2)) fail('forms: two or more');
  for (const form of Array.isArray(forms) ? forms : []) {
    const extra = Object.keys(form).filter((k) => !['unknown', 'eqform', 'w'].includes(k));
    if (extra.length) fail(`forms: ${extra.join(', ')} is not unknown, eqform or w`);
    if (!(typeof form.w === 'number' && form.w > 0 && Number.isFinite(form.w))) fail(`forms: w ${form.w} is not a positive number`);
    if (form.unknown !== undefined && !unknowns.includes(form.unknown)) fail(`forms: unknown ${form.unknown} is not among the level's ${show(level.unknown)}`);
    if (form.eqform !== undefined && !PARAMS.get('eqform').values.includes(form.eqform)) fail(`forms: eqform ${form.eqform} is not a skills.md value`);
  }
  const pairs = forms.map((f) => pairOf(level, f));
  pairs.forEach((p, i) => pairs.indexOf(p) !== i && fail(`forms: ${p} is listed twice`));
  if (level.forms) for (const u of unknowns) if (!forms.some((f) => (f.unknown ?? level.unknown) === u)) fail(`forms: unknown ${u} is in no form`);
  const total = forms.reduce((n, f) => n + f.w, 0);
  const other = forms.filter((f) => (f.eqform ?? 'standard') !== 'standard').reduce((n, f) => n + f.w, 0);
  if (other && other / total < 0.25) fail(`R8: the forms give ${Math.round((100 * other) / total)}% not standard; 25% are needed`);
  if (level.exclude !== undefined) {
    const lo = level.min ?? 0;
    const ok = Array.isArray(level.exclude) && typeof level.max === 'number'
      && level.exclude.every((n, i) => Number.isInteger(n) && n >= lo && n <= level.max && level.exclude.indexOf(n) === i);
    if (!ok) fail(`exclude ${show(level.exclude)}: whole numbers of the range ${lo}-${level.max}, each once`);
  }
  return problems;
}

/** The share of a level's rounds at which one card holding the answer fails the deal (R4, decisions.md 2026-10-31). */
const SAME_PLACE = 0.8;
/**
 * The rounds of DEAL from which a form of a mixed level is checked on its own too: a child who reads the form finds
 * the answer by its place there (balance levels 4-6, ? = a + b on the last card in every round: hunt 2 #4).
 */
const FORM_ROUNDS = 250;
/**
 * The deal of a level (architecture 4.2): over seeds 1-DEAL every form is dealt and its share is
 * within slack() of its weight in the level's forms; no simple rule (cues: a card, a card among those
 * that are not a landmark value, the larger or smaller of the one neighbouring pair) finds the answer
 * in SAME_PLACE of the rounds or more, nor in SAME_PLACE of one form's rounds where the level deals several and the
 * form is FORM_ROUNDS of them or more, unless the level says why in `samePlace` (and then one does); over seeds 1-COVER
 * every whole number of the level's range [min, max] is dealt as an answer (either number of a
 * pair), or the level lists it in exclude, and no excluded number is dealt. A planner-picked
 * structure or ask: per value for the shares and the place, all together for answers.
 * @param {Game} game
 * @param {Level} base
 * @returns {string[]}
 */
export function checkDeal(game, base) {
  const problems = [];
  /** @type {Set<number>} */
  const answers = new Set();
  let numbers = true;
  for (const level of variants(base)) {
    const where = level === base ? '' : ` (${level.structure ?? level.ask})`;
    /** @type {Map<string, number>} */
    const dealt = new Map();
    /** @type {{ values: any[], card: number }[]} */
    const cards = [];
    /** @type {Map<string, { values: any[], card: number }[]>} the cards of each form */
    const byForm = new Map();
    for (let seed = 1; seed <= DEAL; seed++) {
      const round = game.makeRound(level, rng(seed));
      const pair = `${round.unknown}/${round.eqform ?? 'standard'}`;
      dealt.set(pair, (dealt.get(pair) ?? 0) + 1);
      const card = (round.choices ?? []).findIndex((c) => isDeepStrictEqual(c.value, round.answer));
      if (card >= 0) {
        cards.push({ values: round.choices.map((c) => c.value), card });
        if (!byForm.has(pair)) byForm.set(pair, []);
        byForm.get(pair).push(cards.at(-1));
      }
      if (seed > COVER) continue;
      const values = [round.answer].flat();
      if (values.every((v) => typeof v === 'number')) values.forEach((v) => answers.add(v));
      else numbers = false;
    }
    const forms = level.forms ?? [];
    const total = forms.reduce((n, f) => n + f.w, 0);
    for (const form of forms) {
      const pair = pairOf(level, form);
      const share = (dealt.get(pair) ?? 0) / DEAL;
      const p = form.w / total;
      if (!dealt.has(pair)) problems.push(`${pair} is never dealt in ${DEAL} rounds${where}`);
      else if (Math.abs(share - p) > slack(p)) {
        problems.push(`${pair} is ${(100 * share).toFixed(1)}% of ${DEAL} rounds${where}; its weight gives ${(100 * p).toFixed(1)}% (±${(100 * slack(p)).toFixed(1)})`);
      }
    }
    for (const pair of dealt.keys()) if (forms.length && !forms.some((f) => pairOf(level, f) === pair)) problems.push(`${pair} is dealt${where} but is no form of the level`);
    const found = cues(cards).filter((c) => c.found >= SAME_PLACE * DEAL);
    /** @type {(rule: string) => string} */
    const finds = (rule) => (rule.startsWith('card ') && !rule.includes(' of ') ? `${rule} holds the answer` : `"${rule}" finds the answer`);
    // A mixed level: each form on its own too, as a child who reads the form would play it.
    const inForms = [...(dealt.size > 1 ? byForm : [])].filter(([, some]) => some.length >= FORM_ROUNDS)
      .flatMap(([pair, some]) => cues(some).filter((c) => c.found >= SAME_PLACE * some.length).map((c) => ({ ...c, pair, of: some.length })));
    if (!base.samePlace) {
      for (const { rule, found: n } of found) {
        problems.push(`${finds(rule)} in ${(100 * n / DEAL).toFixed(1)}% of ${DEAL} rounds${where}: vary its place (R4), or say why in samePlace`);
      }
      for (const { rule, found: n, pair, of } of inForms) {
        problems.push(`${finds(rule)} in ${(100 * n / of).toFixed(1)}% of the ${of} rounds of ${pair}${where}: vary its place (R4), or say why in samePlace`);
      }
    }
    if (base.samePlace && !found.length && !inForms.length) problems.push(`samePlace says why the answer keeps its card, but no card holds it in ${100 * SAME_PLACE}% of the rounds${where}`);
  }
  if (numbers && typeof base.max === 'number') {
    const exclude = base.exclude ?? [];
    const range = Array.from({ length: base.max - (base.min ?? 0) + 1 }, (_, i) => (base.min ?? 0) + i);
    const never = range.filter((n) => !answers.has(n) && !exclude.includes(n));
    if (never.length) problems.push(`${never.join(', ')} never dealt as an answer in ${COVER} seeds: deal it, or list it in exclude with the reason`);
    const stale = exclude.filter((n) => answers.has(n));
    if (stale.length) problems.push(`exclude lists ${stale.join(', ')}, but it is dealt as an answer`);
  }
  return problems;
}

/**
 * The rules a level cannot draw (architecture 2.2, 4.2): a rule of the skill's list that the game
 * has, and that gives a wrong card (R4) on some round of seeds 1-SEEDS none of whose values the
 * picture can draw (displays, canShow), is one makeRound skips there without a word. The level
 * lists each such rule in `undrawn`, with the reason; a listed rule that every round draws fails too.
 * @param {Game} game
 * @param {Level} base
 * @returns {string[]}
 */
export function checkUndrawn(game, base) {
  const listed = (skillOf(base.skill)?.rules ?? []).filter((id) => game.rules[id] && RULES[id]);
  /** @type {Set<string>} */
  const found = new Set();
  for (const level of variants(base)) {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const round = game.makeRound(level, rng(seed));
      for (const id of listed) {
        if (found.has(id)) continue;
        const predicted = game.rules[id](round);
        const values = (predicted?.oneOf ?? [predicted]).filter((v) => cardable(v, id, round));
        if (values.length && values.every((value) => drawn(game, round, { value, rule: id }).length)) found.add(id);
      }
    }
  }
  const declared = base.undrawn ?? [];
  return [
    ...listed.filter((id) => found.has(id) && !declared.includes(id))
      .map((id) => `${id} has a card whose ${RULES[id].display} the picture cannot draw, so it is skipped in silence: draw it, or list it in undrawn with the reason`),
    ...declared.filter((id) => !found.has(id)).map((id) => `undrawn lists ${id}, but every round draws it`),
  ];
}

/**
 * The once-per-game checks: meta, level objects, and R3.
 * @param {Game} game
 * @returns {string[]}
 */
export function checkGame(game) {
  const problems = [];
  const { meta, levels } = game;
  const fail = (msg) => problems.push(`${meta?.id}: ${msg}`);
  if (typeof meta?.id !== 'string' || !String(meta.css).endsWith(`/${meta.id}/game.css`)) fail('meta.id must be the folder name, meta.css its game.css');
  if (!/[א-ת]/.test(meta?.title ?? '') || meta.title.includes(METEG)) fail('meta.title: Hebrew with nikud, no meteg');
  if (!Number.isInteger(meta?.version)) fail('meta.version is required');
  // No grade anywhere at run time: levels and progression are independent of school grade (owner decision 2026-10-14).
  if (Object.keys(meta ?? {}).some((k) => /grade/i.test(k))) fail('meta has no grade (architecture 2.1)');
  if (!Array.isArray(game.text) || typeof game.rules !== 'object') fail('text and rules must be exported');
  // The displays it draws (architecture 2.1): ids of the §4.2 catalogue, each once.
  const catalogue = new Set(Object.values(RULES).map((r) => r.display));
  if (!Array.isArray(game.displays) || !game.displays.length) fail('displays must be exported: the display ids view.miss draws');
  else {
    game.displays.forEach((d, i) => game.displays.indexOf(d) !== i && fail(`displays: ${d} is listed twice`));
    for (const d of game.displays) if (!catalogue.has(d)) fail(`displays: ${d} is no display of the §4.2 catalogue`);
  }
  if (game.canShow !== undefined && typeof game.canShow !== 'function') fail('canShow, where exported, is a function');
  const ids = levels.map((l) => l.id);
  ids.forEach((id, i) => ids.indexOf(id) !== i && fail(`level id ${id} is used twice`));
  levels.forEach((level, i) => {
    const where = `level ${i + 1} (${level.id})`;
    for (const [key, type] of Object.entries(REQUIRED)) if (typeof level[key] !== type) fail(`${where}: ${key} must be a ${type}`);
    if (!skillOf(level.skill)) fail(`${where}: skill ${level.skill} is not in skills.md`);
    if (![3, 4].includes(level.options)) fail(`${where}: options must be 3 or 4`);
    if (level.samePlace !== undefined && !(typeof level.samePlace === 'string' && level.samePlace.trim())) fail(`${where}: samePlace is the reason, in words`);
    if (level.undrawn !== undefined) {
      const listed = skillOf(level.skill)?.rules ?? [];
      const ok = Array.isArray(level.undrawn) && level.undrawn.every((id, j) => listed.includes(id) && level.undrawn.indexOf(id) === j);
      if (!ok) fail(`${where}: undrawn ${show(level.undrawn)}: rules of ${level.skill}'s list, each once`);
    }
    for (const [key, value] of Object.entries(level)) {
      if (['id', 'skill', 'min', 'forms', 'exclude', 'undrawn', 'samePlace'].includes(key)) continue;
      const param = PARAMS.get(key);
      if (!param) fail(`${where}: ${key} is not a skills.md parameter`);
      else {
        for (const v of [value].flat()) {
          const inRange = param.range && Number(v) >= param.range[0] && Number(v) <= param.range[1];
          if (!param.values.includes(String(v)) && !inRange) fail(`${where}: ${key}: ${v} is not a listed value`);
        }
      }
    }
    if (level.terms && (!/^(addsub|muldiv|frac)\./.test(level.skill) || level.skill === 'addsub.multi.whole-tens')) fail(`${where}: terms: true in ${level.skill}`);
    if (level.helpEstimate) {
      const ok = ['addsub.multi.two-digit', 'addsub.multi.column'].includes(level.skill) && levels.slice(0, i).some((l) => l.skill === 'addsub.multi.estimate');
      if (!ok) fail(`${where}: helpEstimate needs a two-digit or column level after an estimate level`);
    }
    // 3.4: one level down from here is another skill's, one this level does not build on (base and its
    // met `when`): the step down eases nothing, so the level says down: false (decisions.md 2026-10-31).
    const below = levels[i - 1];
    if (below && below.skill !== level.skill && !prereqs(SKILLS, level.skill, level).includes(below.skill) && level.down !== false) {
      fail(`${where}: down: false is needed: the level below (${below.id}) is ${below.skill}, no prerequisite of ${level.skill} (3.4)`);
    }
    problems.push(...checkForms(level).map((p) => `${meta.id}: ${where}: ${p}`));
    for (const key of ['structure', 'ask']) {
      if (!Array.isArray(level[key])) continue;
      if (level[key].length < 2) fail(`${where}: a mixed ${key} needs two values or more`);
      for (const value of level[key]) {
        if (!levels.slice(0, i).some((l) => l[key] === value)) fail(`${where}: mixed ${key} ${value} has no earlier level of its own (R3)`);
      }
    }
  });
  // The site's role (decisions.md "תפקיד האתר"): a skill's first level starts at real objects, look 'objects' or a
  // drawing of the classroom tool itself (TOOLS; row "ציור של חפצים אמיתיים"), or is a mixed level whose structures
  // (or asks) each began so at an earlier level of the game, and starts in their shared look (row "רמה מעורבת בנקודות").
  levels.forEach((level, i) => {
    if (levels.findIndex((l) => l.skill === level.skill) !== i || real(level)) return;
    const key = ['structure', 'ask'].find((k) => Array.isArray(level[k]));
    if (key && level[key].every((v) => levels.slice(0, i).some((l) => l[key] === v && real(l)))) {
      // ...and starts in their shared look: one each of them was drawn in at an earlier level, so mixing is all it adds.
      const unseen = level[key].filter((v) => !levels.slice(0, i).some((l) => l[key] === v && l.look === level.look));
      if (unseen.length) fail(`level ${i + 1} (${level.id}): the mixed level of ${level.skill} starts in ${level.look}, which ${key} ${unseen.join(', ')} had no earlier level in: a mixed level starts in its ${key}s' shared look`);
      return;
    }
    fail(`level ${i + 1} (${level.id}): the first level of ${level.skill} draws ${level.model} in ${level.look}: real objects first (look objects, or a classroom tool: ${TOOLS.join(', ')}), or a mixed level whose ${key ?? 'structure'}s each began so earlier`);
  });
  // R3: the model never goes back in the skill's order; within a model and range, nor does the look.
  for (const skill of new Set(levels.map((l) => l.skill))) {
    const order = MODEL_ORDER[skill];
    const list = levels.filter((l) => l.skill === skill);
    list.forEach((level, j) => {
      if (order?.length && !order.includes(level.model)) fail(`R3: ${level.id}: model ${level.model} is not in ${skill}'s order ${order.join(', ')}`);
      const prev = list[j - 1];
      if (!prev) return;
      if (order?.length && order.indexOf(level.model) < order.indexOf(prev.model)) fail(`R3: ${level.id}: model ${level.model} comes back after ${prev.model}`);
      const sameRange = prev.model === level.model && prev.max === level.max && prev.precision === level.precision;
      if (sameRange && LOOKS.indexOf(level.look) < LOOKS.indexOf(prev.look)) fail(`R3: ${level.id}: look ${level.look} comes back after ${prev.look}`);
    });
  }
  return problems;
}

/**
 * Where a wrong value lies by the cards' order (R4, R7: small to large): -1 left of the answer, 1
 * right of it, 0 the same; null for values with no order (a judging round's cards). A pair goes by
 * its first number, then its second.
 * @param {any} value
 * @param {any} answer
 * @returns {number | null}
 */
export function sideOf(value, answer) {
  const key = (v) => (typeof v === 'number' ? [v] : Array.isArray(v) && v.every((x) => typeof x === 'number') ? v : null);
  const [a, b] = [key(value), key(answer)];
  if (!a || !b) return null;
  const i = a.findIndex((x, j) => x !== b[j]);
  return i < 0 ? 0 : Math.sign(a[i] - b[i]);
}

/**
 * R4 and the answer's place (decisions.md 2026-10-31, lib/place.js): the free deal takes the skill's
 * rules in order, a slip only where no real error fits, and the answer's place moves it one card: the
 * last real error on one side gives way to the next rule's value on the other (up: a real error, else
 * a slip; down: a slip, the free deal's other real errors kept). So a real error the round could offer
 * (and no rule before it gives) that is on no card has every card on its side of the answer from a
 * rule before it; the one card from a later rule there may be a slip that crossed the answer for
 * another real error on no card, when this one comes after every real error on a card (the place
 * moved down). Cards with no order (judging): no slip while a real error fits.
 * @param {Game} game
 * @param {Round} round
 * @param {string[]} order the skill's rules, in the order the round deals them
 * @returns {string[]}
 */
export function checkLeftOut(game, round, order) {
  const problems = [];
  const wrong = round.choices.filter((c) => c.rule !== null);
  const isSlip = (rule) => rule.startsWith('slip.');
  const rank = (rule) => order.indexOf(rule);
  const valuesOf = (predicted) => (predicted !== null && typeof predicted === 'object' && Array.isArray(predicted.oneOf) ? predicted.oneOf : [predicted]);
  const onCard = (v) => round.choices.some((c) => isDeepStrictEqual(c.value, v));
  /** @type {{ id: string, value: any }[]} the real errors on no card the round could offer, in the order */
  const out = [];
  for (const id of order.filter((r) => !isSlip(r) && game.rules[r] && RULES[r])) {
    const values = valuesOf(game.rules[id](round));
    if (values.some(onCard)) continue;
    const tie = (v) => order.slice(0, rank(id)).some((q) => game.rules[q] && predicts(game.rules[q](round), v));
    for (const value of values) if (offerable(value, id, round, game) && !tie(value)) out.push({ id, value });
  }
  for (const { id, value } of out) {
    const side = sideOf(value, round.answer);
    const crossed = (c) => isSlip(c.rule) && side !== null && wrong.every((w) => isSlip(w.rule) || rank(w.rule) < rank(id))
      && out.some((o) => sideOf(o.value, round.answer) === -side);
    const later = wrong.find((c) => (side === null ? isSlip(c.rule) : sideOf(c.value, round.answer) === side && rank(c.rule) > rank(id)) && !crossed(c));
    if (later) problems.push(`R4: ${later.rule} is offered, but ${id} gives ${show(value)}, a real error not on a card`);
  }
  return problems;
}

/**
 * The checks of one round (dev-spec A.2: R1, R2, R4, R5, R8 for choice rounds).
 * @param {Game} game
 * @param {Level} level the level as passed to makeRound
 * @param {number} index the level's index in the game
 * @param {Round} round
 * @returns {string[]}
 */
export function checkRound(game, level, index, round) {
  const problems = [];
  const fail = (msg) => problems.push(msg);
  for (const key of ['skill', 'look', 'model']) if (round[key] !== level[key]) fail(`round.${key} ${round[key]} is not the level's ${level[key]}`);
  for (const key of level.forms ? ['structure', 'ask'] : ['structure', 'unknown', 'eqform', 'ask']) {
    const allowed = level[key] === undefined ? [undefined, ...(key === 'eqform' ? ['standard'] : [])] : [level[key]].flat();
    if (!allowed.includes(round[key])) fail(`round.${key} ${round[key]} is not among the level's ${show(level[key])}`);
  }
  const pair = `${round.unknown}/${round.eqform ?? 'standard'}`;
  if (level.forms && !level.forms.some((f) => pairOf(level, f) === pair)) fail(`round's ${pair} is not one of the level's forms`);
  const { equation } = round;
  const groups = round.look === 'symbols' ? round.helpPicture : round.picture;
  const judging = typed(round.answer, ['card']);
  if (judging) problems.push(...checkJudging(round));
  else {
    // R1: every given number is a countable or tagged group; each '?' is its unknown group.
    if (!Array.isArray(groups) || !groups.length) return [...problems, 'R1: no picture groups (helpPicture in symbols look)'];
    const unknowns = groups.filter((g) => g.role === 'unknown' && ['covered', 'items'].includes(g.shown));
    if (equation) {
      const leaves = [...equation.left, ...equation.right];
      for (const t of leaves) {
        if (typeof t !== 'number' && t !== '?' && !OPERATORS.includes(t)) fail(`R8: token ${show(t)} (one '=' only; operators + − × :)`);
        if (typeof t === 'number' && !groups.some((g) => g.count === t && ['items', 'tag'].includes(g.shown))) fail(`R1: ${t} has no countable or tagged group`);
      }
      const k = leaves.filter((t) => t === '?').length;
      const answers = k === 1 ? [round.answer] : round.answer;
      if (!Array.isArray(answers) || answers.length !== k) fail(`R1: ${k} '?' but the answer is ${show(round.answer)}`);
      else {
        answers.forEach((a, i) => unknowns[i]?.count !== a && fail(`R1: '?' ${i + 1} is ${a}, its unknown group has ${unknowns[i]?.count}`));
        if (balance(equation, answers) !== 0) fail(`R8: ${show(equation)} with ${show(answers)} is not true`);
        const f = (x) => balance(equation, [x]);
        if (k === 1 && f(1) === f(0)) fail(`R1: ${show(equation)} does not depend on '?'`);
        else if (k === 1 && -f(0) / (f(1) - f(0)) !== round.answer) fail(`R1: ${show(equation)} solves to ${-f(0) / (f(1) - f(0))}, not ${round.answer}`);
      }
    } else if (unknowns[0]?.count !== round.answer) fail(`R1: no equation, and the answer ${show(round.answer)} is not the unknown group's count`);
  }
  if (round.text !== '' && !game.text.includes(round.text)) fail(`R1: text "${round.text}" is not in the game's text list`);
  if (/[0-9]/.test(round.text) || round.text.split(/\s+/).filter(Boolean).length > 6 || round.text.includes(METEG)) fail('R1: text has a digit, over six words or a meteg');
  if (!level.terms && round.terms?.length !== 0) fail('R1: terms must be [] when the level has terms: false');
  // R2: a §4.6 row, and the equation has its form (reversed with eqform 'reversed'). A judging
  // round has no unknown, so no row.
  if (round.structure && !judging) {
    const row = FORMS.find((f) => f.structure === round.structure && f.unknown === round.unknown);
    if (!row) fail(`R2: (${round.structure}, ${round.unknown}) is not a row of the §4.6 table`);
    else if (equation) {
      const forms = round.eqform === 'reversed' ? row.reversed : row.forms;
      const [left, right] = [shapeOf(equation.left), shapeOf(equation.right)];
      if (!forms.some((form) => fits(left, form.left) && fits(right, form.right))) fail(`R2: ${show(equation)} is not a ${round.eqform ?? 'standard'} form of (${round.structure}, ${round.unknown})`);
    }
  }
  // R2: a new structure starts small. The ceiling is the structure's own (the "תקרה" column of the
  // §4.6 table, from its depth tables' level 1), never a grade; `equation` has none.
  const first = game.levels.findIndex((l) => [l.structure].flat().includes(round.structure)) === index;
  const ceiling = FORMS.find((f) => f.structure === round.structure)?.start ?? null;
  if (round.structure && first && ceiling !== null && !judging) {
    const numbers = equation ? [...equation.left, ...equation.right, ...[round.answer].flat()] : groups.map((g) => g.count);
    if (Math.max(...numbers.filter((n) => typeof n === 'number')) > ceiling) fail(`R2: the first level of ${round.structure} goes above ${ceiling}`);
  }
  // R4 and R5, choice rounds.
  const { choices } = round;
  if (!Array.isArray(choices) || !choices.length) return [...problems, ...(game.classify ? [] : ['R4: no choices and no classify'])];
  if (choices.length !== level.options) fail(`R4: ${choices.length} choices, the level says ${level.options}`);
  const relation = RELATIONS.includes(round.answer);
  if (choices.length === 3 && !relation && game.levels.findIndex((l) => l.skill === level.skill) !== index) fail('R4: 3 options only on the first level of a skill, or for relation answers');
  const right = choices.filter((c) => c.rule === null);
  if (right.length !== 1 || !isDeepStrictEqual(right[0].value, round.answer)) fail('R4: exactly one choice has no rule, and it is the answer');
  choices.forEach((c, i) => choices.findIndex((d) => isDeepStrictEqual(c.value, d.value)) !== i && fail(`R4: ${show(c.value)} is offered twice`));
  const listed = skillOf(level.skill)?.rules ?? [];
  // Ties go to the rule first in the skill's list (R4), but in a reversed form (the lone number or
  // the result left of '=') the equal.* rules come first (depth 4.9, eq.sign.missing).
  const reversed = Boolean(equation) && equation.left.length === 1 && equation.right.length > 1;
  const order = reversed ? [...listed.filter((r) => r.startsWith('equal.')), ...listed.filter((r) => !r.startsWith('equal.'))] : listed;
  const wrong = choices.filter((c) => c.rule !== null);
  for (const { value, rule } of wrong) {
    if (!RULES[rule]) fail(`R4: ${rule} is not in the §4.2 catalogue`);
    else if (!RULES[rule].display) fail(`R5: ${rule} has no display`);
    if (!listed.includes(rule)) fail(`R4: ${rule} is not in ${level.skill}'s rules`);
    if (/^keyword\./.test(rule)) fail(`R4: ${rule}: no keyword rules in v1`);
    if (RULES[rule] && !typed(value, RULES[rule].types)) fail(`R4: ${show(value)} is not a ${RULES[rule].types.join(' or ')} (${rule})`);
    if (typeof value === 'number' && String(value).length > 4) fail(`R4: ${value} does not fit a 64px button`);
    const formula = game.rules[rule];
    if (!formula) {
      fail(`R4: the game has no formula for ${rule}`);
      continue;
    }
    if (!predicts(formula(round), value)) fail(`R4: ${rule} gives ${show(formula(round))}, the choice is ${show(value)}`);
    for (const why of drawn(game, round, { value, rule })) fail(`R5: ${show(value)} (${rule}): ${why}`);
    const over = RULES[rule] && game.budget?.(round, { value, rule });
    if (over) fail(`budget: ${show(value)} (${rule}): ${over}`);
    const earlier = order.slice(0, order.indexOf(rule)).find((q) => game.rules[q] && predicts(game.rules[q](round), value));
    if (earlier) fail(`R4: ${show(value)} is tagged ${rule}, but ${earlier} comes first${reversed ? ' in a reversed form' : ' in the skill\'s list'} and gives it too`);
  }
  const real = wrong.filter((c) => !c.rule.startsWith('slip.')).length;
  if (listed.filter((r) => !r.startsWith('slip.')).length >= 2 && real < Math.min(2, wrong.length)) fail(`R4: ${real} real error(s); two are needed`);
  // R4: a given number is not the answer (a child who copies it would be logged first and never see its display),
  // except in R4's written exception, the doubles of num.parts.split and num.parts.make-ten (decisions.md 2026-11-01).
  if (!judging && !DOUBLES.includes(level.skill)) {
    for (const id of listed.filter((r) => r.startsWith('given.') && game.rules[r])) {
      if (predicts(game.rules[id](round), round.answer)) fail(`R4: ${id} gives the answer ${show(round.answer)}: a double outside R4's exception`);
    }
  }
  problems.push(...checkLeftOut(game, round, order));
  const values = choices.map((c) => c.value);
  if (values.every((v) => typeof v === 'number') && values.some((v, i) => i > 0 && v <= values[i - 1])) fail(`R4: numbers not ascending: ${show(values)}`);
  for (const a of judging ? [...round.answer.left, ...round.answer.right] : [round.answer].flat()) {
    if (typeof a === 'number' && (a < (level.min ?? 0) || a > (level.max ?? Infinity))) fail(`R4: the answer ${a} is outside the level's range`);
  }
  return problems;
}

/**
 * R9's demo round (architecture 3.8), as the shell picks it (demoSeedFor), for seeds 1-2000: other
 * numbers than the round it shows how to solve (another answer and, where both have one, another
 * exercise row in either order), and on a `demo: true` level a plain round (no 0 in its answer, no
 * answer its row shows). "Show me how" at any level gets the same choice; only a demo level must
 * find a plain one (the balance's `turn` answers with a number of its own row).
 * @param {Game} game
 * @param {Level} base
 * @returns {string[]}
 */
export function checkDemo(game, base) {
  const problems = [];
  const row = (round) => exerciseOf(game.meta.id, { ...round, answer: null });
  for (const level of variants(base)) {
    const make = (seed) => game.makeRound(level, rng(seed));
    for (let seed = 1; seed <= COVER; seed++) {
      const where = `seed ${seed}${level === base ? '' : ` ${level.structure ?? level.ask}`}`;
      const [real, demo] = [make(seed), make(demoSeedFor(make, seed))];
      const text = `${show(demo.equation ?? demo.picture)} = ${show(demo.answer)}`;
      if (isDeepStrictEqual(demo.answer, real.answer)) problems.push(`${where}: the demo's answer is the round's: ${text}`);
      else if (demo.equation && real.equation && row(demo) === row(real)) problems.push(`${where}: the demo's row is the round's: ${text}`);
      if (base.demo && !plainDemo(demo)) problems.push(`${where}: the demo is no plain round: ${text}`);
    }
  }
  return problems;
}

/** The sessions the session check deals at each demo level (architecture 3.3). */
const SESSIONS = 500;
/**
 * The levels with fewer exercises than a session's 8 rounds (architecture 3.3), by game/level, with how many: a session
 * there deals one again, the one dealt longest ago. Stories level 6: the basket to 5 without 0 and equal parts.
 */
const SMALL = { 'stories/whole-5': 7 };

/**
 * How many exercises (exerciseOf, architecture 3.3) the levels deal together over DEAL seeds; counting stops at enough.
 * @param {Game} game
 * @param {Level[]} levels a level, or the structures of a mixed one
 * @param {number} [enough]
 * @returns {number}
 */
export function exercisesIn(game, levels, enough = Infinity) {
  const keys = new Set();
  for (let seed = 1; seed <= DEAL && keys.size < enough; seed++) {
    for (const level of levels) keys.add(exerciseOf(game.meta.id, game.makeRound(level, rng(seed))));
  }
  return keys.size;
}

/** @typedef {{ apartSeed: typeof apartSeed, demoSeedFor: typeof demoSeedFor, counted: boolean }} Deal the shell's choices */
/** The shell's: the demo's exercise counts as dealt. @type {Deal} */
const SHELL = { apartSeed, demoSeedFor, counted: true };

/**
 * A session at one level as the shell deals it (app.js apart and demo, architecture 3.3, 3.8): 8 rounds from the
 * session seed, each apart from the exercises dealt (apartSeed), and on a demo level the entry demo before the first,
 * whose exercise counts as dealt (demoSeedFor). The demo's exercise (null without one) and the rounds', in order.
 * @param {Game} game
 * @param {Level} base
 * @param {number} seed the session seed
 * @param {Deal} [deal] a test swaps the shell's choices
 * @returns {{ demo: string | null, rounds: string[] }}
 */
export function sessionOf(game, base, seed, deal = SHELL) {
  const [seeds, mix, seen, rounds] = [rng(seed), rng((seed ^ 0x5bd1e995) >>> 0), new Map(), []];
  let [prev, demo, dealt] = [null, null, 0];
  for (let i = 0; i < 8; i++) {
    const pick = pickMix(base, prev, mix);
    prev = pick.structure ?? pick.ask ?? null;
    const level = { ...base, ...pick };
    const make = (/** @type {number} */ s) => game.makeRound(level, rng(s));
    const keys = new Map();
    const key = (/** @type {number} */ s) => keys.get(s) ?? keys.set(s, exerciseOf(game.meta.id, make(s))).get(s);
    const s = deal.apartSeed(key, Math.floor(seeds.next() * 4294967296) >>> 0, seen);
    seen.set(key(s), ++dealt);
    if (i === 0 && base.demo) {
      demo = exerciseOf(game.meta.id, make(deal.demoSeedFor(make, s, (round) => seen.get(exerciseOf(game.meta.id, round)))));
      if (deal.counted) seen.set(demo, ++dealt);
    }
    rounds.push(key(s));
  }
  return { demo, rounds };
}

/**
 * The session's exercises at a demo level (architecture 3.3, 3.8; hunt 2 #2, #11), over SESSIONS sessions: none twice
 * in a row, the demo's before the first round included; the demo's exercise is not one of rounds 2-4, nor of any round
 * where the level has at least 9 exercises (the demo and 8 rounds).
 * @param {Game} game
 * @param {Level} base
 * @param {Deal} [deal]
 * @returns {string[]}
 */
export function checkSession(game, base, deal = SHELL) {
  if (!base.demo) return [];
  const problems = [];
  const many = exercisesIn(game, variants(base), 9) >= 9;
  for (let seed = 1; seed <= SESSIONS; seed++) {
    const { demo, rounds } = sessionOf(game, base, seed, deal);
    const seq = [demo, ...rounds];
    const twice = seq.findIndex((k, i) => i > 0 && k === seq[i - 1]);
    if (twice > 0) problems.push(`session ${seed}: the same exercise twice in a row, ${twice === 1 ? 'the demo and round 1' : `rounds ${twice - 1} and ${twice}`}: ${seq[twice]}`);
    const again = rounds.indexOf(/** @type {string} */ (demo));
    if (again >= 0 && (again <= 3 || many)) problems.push(`session ${seed}: round ${again + 1} is the demo's exercise ${demo}`);
  }
  return problems;
}

test(`every level deals at least 8 exercises, each structure apart, or is named in SMALL with its count (architecture 3.3)`, () => {
  const problems = [];
  for (const game of GAMES) {
    for (const base of game.levels) {
      const id = `${game.meta.id}/${base.id}`;
      const n = Math.min(...variants(base).map((level) => exercisesIn(game, [level], 9)));
      if (id in SMALL ? n !== SMALL[id] : n < 8) problems.push(`${id} deals ${n} exercises${id in SMALL ? `, SMALL says ${SMALL[id]}` : ''}`);
    }
  }
  assert.deepEqual(problems, []);
});

for (const game of GAMES) {
  test(`${game.meta.id}: meta, levels and R3`, () => {
    const problems = checkGame(game);
    assert.ok(problems.length === 0, problems.join('\n'));
  });
  game.levels.forEach((base, index) => {
    test(`${game.meta.id} level ${index + 1} (${base.id}): ${SEEDS} seeds`, () => {
      const problems = [];
      for (const level of variants(base)) {
        const seen = { unknown: new Set(), eqform: new Set() };
        let other = 0;
        for (let seed = 1; seed <= SEEDS; seed++) {
          const where = `seed ${seed}${level === base ? '' : ` ${level.structure ?? level.ask}`}`;
          const round = withoutRandom(() => game.makeRound(level, rng(seed)));
          if (!isDeepStrictEqual(round, withoutRandom(() => game.makeRound(level, rng(seed))))) problems.push(`${where}: not deterministic`);
          if (!isDeepStrictEqual(round, structuredClone(round))) problems.push(`${where}: not plain data`);
          problems.push(...checkRound(game, level, index, round).map((p) => `${where}: ${p}`));
          seen.unknown.add(round.unknown);
          seen.eqform.add(round.eqform ?? 'standard');
          if ((round.eqform ?? 'standard') !== 'standard') other += 1;
        }
        for (const key of ['unknown', 'eqform']) {
          for (const value of [level[key] ?? []].flat()) if (!seen[key].has(value)) problems.push(`R2: ${key} ${value} never appears in ${SEEDS} seeds`);
        }
        const mixed = level.forms?.some((f) => (f.eqform ?? 'standard') !== 'standard');
        if (mixed && other < SEEDS / 4) problems.push(`R8: ${other} of ${SEEDS} rounds are not standard; 25% are needed`);
      }
      problems.push(...checkUndrawn(game, base));
      const unique = [...new Set(problems)];
      assert.ok(unique.length === 0, `${unique.length} problem(s), the first:\n  ${unique.slice(0, 15).join('\n  ')}`);
    });
    test(`${game.meta.id} level ${index + 1} (${base.id}): the deal, forms over ${DEAL} seeds and answers over ${COVER}`, () => {
      const problems = checkDeal(game, base);
      assert.ok(problems.length === 0, problems.join('\n'));
    });
    test(`${game.meta.id} level ${index + 1} (${base.id}): R9, the demo's round over ${COVER} seeds`, () => {
      const problems = checkDemo(game, base);
      assert.ok(problems.length === 0, `${problems.length} problem(s), the first:\n  ${problems.slice(0, 8).join('\n  ')}`);
    });
    if (base.demo) {
      test(`${game.meta.id} level ${index + 1} (${base.id}): a session's exercises after its demo, over ${SESSIONS} sessions`, () => {
        const problems = checkSession(game, base);
        assert.ok(problems.length === 0, `${problems.length} problem(s), the first:\n  ${problems.slice(0, 8).join('\n  ')}`);
      });
    }
  });
}

test('the checks catch broken rounds and levels', () => {
  const level = parts.levels[1];
  const good = parts.makeRound(level, rng(3));
  assert.deepEqual(checkRound(parts, level, 1, good), []);
  const broken = (change) => {
    const round = structuredClone(good);
    change(round);
    return checkRound(parts, level, 1, round).join('\n');
  };
  assert.match(broken((r) => { r.choices.find((c) => c.rule === 'given.part').rule = 'given.whole'; }), /given\.whole gives/);
  assert.match(broken((r) => r.choices.reverse()), /not ascending/);
  assert.match(broken((r) => { r.equation.right = [99]; }), /R1: 99 has no countable/);
  assert.match(broken((r) => { r.choices.pop(); }), /3 choices, the level says 4/);
  assert.match(broken((r) => { r.equation = { left: [r.answer, '+', '?'], right: [99] }; }), /R1/);
  assert.match(broken((r) => { r.text = 'בְּעֵרֶךְ 3'; }), /text/);
  assert.match(broken((r) => { r.choices.find((c) => c.rule === 'op.other').rule = 'keyword.added'; }), /keyword/);
  assert.match(broken((r) => { r.unknown = 'whole'; }), /unknown whole is not among/);
  assert.throws(() => withoutRandom(() => Math.random()), /Math\.random/);
  // A judging round (eq.sign.true-false): cards, one true, no equation.
  const judge = scale.levels.findIndex((l) => l.skill === 'eq.sign.true-false');
  const cards = scale.makeRound(scale.levels[judge], rng(3));
  assert.deepEqual(checkRound(scale, scale.levels[judge], judge, cards), []);
  const judged = (change) => {
    const round = structuredClone(cards);
    change(round);
    return checkRound(scale, scale.levels[judge], judge, round).join('\n');
  };
  const wrongCard = (r) => r.choices.find((c) => c.rule === 'slip.card');
  assert.match(judged((r) => { wrongCard(r).value = structuredClone(r.answer); }), /tagged slip\.card but true/);
  assert.match(judged((r) => { r.choices.find((c) => c.rule === null).value.right = [99]; }), /the answer but false/);
  assert.match(judged((r) => { wrongCard(r).value.right = ['?']; }), /R8: the card/);
  assert.match(judged((r) => { r.equation = { left: [1, '+', '?'], right: [2] }; }), /equation null/);
  // A slip while a real error fits and is on no card (R4): equal.copy's a = a + b beside slip.card.
  const copyCard = { ...scale, rules: { ...scale.rules, 'equal.copy': (r) => ({ left: [r.answer.right[0]], right: [...r.answer.right] }) } };
  assert.match(checkRound(copyCard, scale.levels[judge], judge, cards).join('\n'), /slip\.card is offered, but equal\.copy gives/);
  // A reversed form (c = a + ?): equal.copy comes before given.whole (depth 4.9).
  const missing = scale.levels.findIndex((l) => l.id === 'right');
  const plain = scale.makeRound(scale.levels[missing], rng(3));
  const flipped = { ...structuredClone(plain), equation: { left: plain.equation.right, right: plain.equation.left } };
  const copying = { ...scale, rules: { ...scale.rules, 'equal.copy': (r) => r.equation.left[0] } };
  assert.match(checkRound(copying, scale.levels[missing], missing, flipped).join('\n'), /given\.whole, but equal\.copy comes first in a reversed form/);
  assert.doesNotMatch(checkRound(copying, scale.levels[missing], missing, plain).join('\n'), /comes first/);
  const bad = { ...parts, levels: [parts.levels[1], { ...parts.levels[0], id: 'split-10', model: 'tree', look: 'objects', colour: 'red' }] };
  const problems = checkGame(bad).join('\n');
  assert.match(problems, /used twice/);
  assert.match(problems, /colour is not a skills\.md parameter/);
  assert.match(checkGame({ ...parts, levels: [{ ...parts.levels[0], model: 'tree' }, parts.levels[1]] }).join(), /model frame comes back after tree/);
  assert.match(checkGame({ ...parts, levels: [parts.levels[1], { ...parts.levels[1], id: 'x', look: 'objects' }] }).join(), /look objects comes back/);
  assert.match(checkGame({ ...parts, meta: { ...parts.meta, grades: [1] } }).join(), /meta has no grade/);
  // Real objects first (decisions.md "תפקיד האתר", 2026-11-01 "רמה מעורבת בנקודות"): a skill's first level in dots or
  // symbols on a model that is no classroom tool fails, and a mixed level passes only after each structure began so.
  const stories = /** @type {Game} */ (GAMES.find((g) => g.meta.id === 'stories'));
  const mutated = (id, change) => checkGame({ ...stories, levels: stories.levels.map((l) => (l.id === id ? { ...l, ...change } : l)) }).join('\n');
  assert.deepEqual(checkGame(stories), []);
  assert.match(mutated('add-5', { look: 'dots' }), /level 1 \(add-5\): the first level of addsub\.meaning\.change-add draws scene in dots: real objects first/);
  assert.match(mutated('whole-5', { look: 'symbols' }), /level 6 \(whole-5\): the first level of addsub\.meaning\.part-whole draws scene in symbols/);
  assert.match(mutated('take-5', { look: 'dots' }), /level 8 \(mixed-10\): the first level of addsub\.meaning\.mixed draws scene in dots/);
  assert.doesNotMatch(mutated('mixed-10', { structure: ['change-add', 'part-whole'] }), /real objects first|shared look/, 'the basket began in objects at level 6');
  // ...and in their shared look: symbols, which neither add nor take had, fails; so does dots, once take never had it.
  assert.match(mutated('mixed-10', { look: 'symbols' }), /level 8 \(mixed-10\): the mixed level of addsub\.meaning\.mixed starts in symbols, which structure change-add, change-take had no earlier level in/);
  assert.match(mutated('take-10', { look: 'objects' }), /structure change-take had no earlier level in: a mixed level starts in its structures' shared look/);
  assert.doesNotMatch(mutated('add-5', { look: 'dots', model: 'frame' }), /real objects first/);
  assert.match(checkGame({ ...parts, levels: [{ ...parts.levels[0], model: 'tree' }] }).join(), /level 1 \(split-5\): the first level of num\.parts\.split draws tree in dots/);
  // down: false (3.4): make-ten builds on split, so 'ten' steps down to split-sym; a skill that does not needs the field.
  assert.doesNotMatch(checkGame(parts).join('\n'), /down: false/);
  const teen = { ...parts.levels[3], id: 'teen', skill: 'pv.teens.ten-and', model: 'bundles', min: 10, max: 20 };
  assert.match(checkGame({ ...parts, levels: [...parts.levels, teen] }).join('\n'), /level 5 \(teen\): down: false is needed: the level below \(ten\) is num\.parts\.make-ten/);
  assert.doesNotMatch(checkGame({ ...parts, levels: [...parts.levels, { ...teen, down: false }] }).join('\n'), /down: false/);
  // A budget the game sets (architecture 4.2): a wrong choice whose display does not fit.
  const narrow = { ...parts, budget: (r, c) => (c.rule === 'op.other' ? 'too wide' : null) };
  assert.match(checkRound(narrow, level, 1, good).join('\n'), /budget: \d+ \(op\.other\): too wide/);
  // The displays a game draws (architecture 2.1): a wrong card's display among them, and canShow's yes where exported.
  assert.match(checkRound({ ...parts, displays: ['flash', 'empty-plate', 'count-up'] }, level, 1, good).join('\n'), /R5: \d+ \(op\.other\): overflow is not in the game's displays/);
  assert.match(checkRound({ ...parts, canShow: (r, c) => c.rule !== 'given.part' }, level, 1, good).join('\n'), /R5: \d+ \(given\.part\): canShow says the picture cannot draw its flash/);
  assert.match(checkGame({ ...parts, displays: undefined }).join('\n'), /displays must be exported/);
  assert.match(checkGame({ ...parts, displays: ['flash', 'jump', 'flash'] }).join('\n'), /flash is listed twice[^]*jump is no display of the §4\.2 catalogue/);
});

test('the demo check catches a demo with the round\'s answer or row, and an edge round on a demo level (R9)', () => {
  const level = { ...parts.levels[0], demo: true };
  /** @type {(make: (r: Rng) => any) => Game} a game that deals only these rounds */
  const dealing = (make) => ({ ...parts, makeRound: (_, r) => make(r) });
  const one = checkDemo(dealing(() => ({ equation: { left: [2, '+', '?'], right: [5] }, answer: 3, picture: [] })), level);
  assert.match(one[0], /^seed 1: the demo's answer is the round's/);
  const pairs = dealing((r) => {
    const a = r.int(1, 4);
    return { equation: { left: ['?', '+', '?'], right: [5] }, answer: [a, 5 - a], picture: [] };
  });
  assert.ok(checkDemo(pairs, level).some((p) => /the demo's row is the round's/.test(p)));
  // Only doubles: the answer is always the given part.
  const edges = dealing((r) => {
    const n = r.int(1, 9);
    return { equation: { left: [n, '+', '?'], right: [2 * n] }, answer: n, picture: [] };
  });
  assert.match(checkDemo(edges, level)[0], /^seed 1: the demo is no plain round: \{"left":\[(\d),"\+","\?"\],"right":\[\d+\]\} = \1$/);
  assert.deepEqual(checkDemo(edges, { ...level, demo: false }), [], 'only a demo level must find a plain round');
});

test('the session check catches the demo\'s exercise dealt again and an exercise twice in a row (architecture 3.3, hunt 2 #2, #11)', () => {
  // The shell before 2026-11-01: the rounds dealt, the planned seed after TRIES, and the demo not counted.
  /** @type {Deal} */
  const before = {
    counted: false,
    apartSeed: (/** @type {(s: number) => string} */ key, /** @type {number} */ seed, /** @type {Map<string, number>} */ seen) => {
      for (let n = 0; n < TRIES && seen.has(key(seed)); n++) seed = (seed + 1) >>> 0;
      return seed;
    },
    demoSeedFor: (/** @type {(s: number) => Round} */ make, /** @type {number} */ seed) => demoSeedFor(make, seed),
  };
  assert.match(checkSession(parts, parts.levels[0], before).join('\n'), /round [234] is the demo's exercise/);
  const same = { ...before, apartSeed: () => 1 };
  assert.match(checkSession(parts, parts.levels[0], same).join('\n'), /twice in a row, rounds 1 and 2/);
  assert.deepEqual(checkSession(parts, parts.levels[0]), []);
  assert.deepEqual(checkSession(parts, parts.levels[1], same), [], 'a level without a demo is not checked');
});

test('the undrawn checks catch a rule the picture cannot draw that the level does not name, and a stale one (architecture 2.2)', () => {
  const level = parts.levels[1];
  assert.deepEqual(checkUndrawn(parts, level), []);
  // A rule whose display the game does not draw, or that canShow says no to, is skipped in silence: the level names it.
  const flat = { ...parts, displays: ['flash', 'empty-plate', 'count-up'] };
  assert.match(checkUndrawn(flat, level).join('\n'), /^op\.other has a card whose overflow the picture cannot draw/m);
  assert.deepEqual(checkUndrawn(flat, { ...level, undrawn: ['op.other'] }), []);
  const noPart = { ...parts, canShow: (r, c) => c.rule !== 'given.part' };
  assert.match(checkUndrawn(noPart, level).join('\n'), /^given\.part has a card whose flash/m);
  assert.match(checkUndrawn(parts, { ...level, undrawn: ['op.other'] }).join('\n'), /undrawn lists op\.other, but every round draws it/);
  // On some rounds is enough: a count-up that gives 9 on the bundle's 10 (B6; teen-bundle deals 10 to 19).
  const tenFrame = GAMES.find((g) => g.meta.id === 'ten-frame');
  const down = { ...tenFrame, rules: { ...tenFrame.rules, 'slip.near': (r) => r.answer - 1 } };
  assert.match(checkUndrawn(down, tenFrame.levels.find((l) => l.id === 'teen-bundle')).join('\n'), /^slip\.near has a card whose count-up/m);
  // The list itself: rules of the skill's list, each once.
  const listing = (undrawn) => checkGame({ ...parts, levels: parts.levels.map((l, i) => (i === 1 ? { ...l, undrawn } : l)) }).join('\n');
  assert.doesNotMatch(listing(['op.other']), /undrawn/);
  assert.match(listing(['equal.copy']), /undrawn \["equal\.copy"\]: rules of num\.parts\.split's list, each once/);
  assert.match(listing(['op.other', 'op.other']), /undrawn \["op\.other","op\.other"\]/);
});

test('the deal checks catch forms and answers that do not match the level', () => {
  const sym = parts.levels.findIndex((l) => l.id === 'split-sym');
  const level = parts.levels[sym];
  const withLevel = (change) => checkGame({ ...parts, levels: parts.levels.map((l, i) => (i === sym ? { ...l, ...change } : l)) }).join('\n');
  assert.doesNotMatch(withLevel({}), /forms|exclude|R8/);
  assert.match(withLevel({ forms: undefined, eqform: ['standard', 'reversed'] }), /eqform is one value/);
  assert.match(withLevel({ forms: [{ eqform: 'reversed', w: 1 }, { eqform: 'standard', w: 9 }] }), /R8: the forms give 10% not standard/);
  assert.match(withLevel({ forms: [{ unknown: 'whole', w: 1 }, { eqform: 'reversed', w: 1 }] }), /unknown whole is not among/);
  assert.match(withLevel({ forms: [{ eqform: 'reversed', w: 1 }, { eqform: 'reversed', w: 1 }] }), /part\/reversed is listed twice/);
  assert.match(withLevel({ exclude: [11] }), /exclude \[11\]/);
  const either = scale.levels.find((l) => l.id === 'either');
  assert.match(checkGame({ ...scale, levels: [{ ...either, forms: undefined }] }).join('\n'), /a mixed unknown needs forms/);
  assert.deepEqual(checkDeal(parts, level), []);
  // Shares from the level's weights, not the code's: a generator that keeps its own 1 in 2 is about 10 points off 40%.
  const own = (forms) => ({ ...parts, makeRound: (l, r) => parts.makeRound({ ...l, forms }, r) });
  assert.match(checkDeal(own([{ eqform: 'reversed', w: 1 }, { eqform: 'standard', w: 1 }]), level).join('\n'), /part\/reversed is \d+\.\d% of 5000 rounds; its weight gives 40\.0%/);
  // The tolerance follows the weight: 3.6 points off, the balance's old drift at 20% (architecture 6), is caught at 40% too.
  assert.match(checkDeal(own([{ eqform: 'reversed', w: 0.364 }, { eqform: 'standard', w: 0.636 }]), level).join('\n'), /part\/reversed is 3\d\.\d% of 5000 rounds; its weight gives 40\.0% \(±2\.8\)/);
  assert.match(checkDeal(own([{ eqform: 'standard', w: 1 }]), level).join('\n'), /part\/reversed is never dealt/);
  // Answers: every number of the range, or listed in exclude, and nothing listed that is dealt.
  assert.match(checkDeal(parts, { ...level, exclude: [0] }).join('\n'), /^10 never dealt as an answer/m);
  assert.match(checkDeal(parts, { ...level, exclude: [0, 10, 3] }).join('\n'), /exclude lists 3, but it is dealt/);
});

test('the deal checks catch an answer that keeps its card: 80% of the rounds on one card fails, unless samePlace says why (R4, decisions.md 2026-10-31)', () => {
  const level = parts.levels[1];
  assert.deepEqual(checkDeal(parts, level), []);
  // The cards as they come, the answer always last: the old balance level 1 and ten-frame levels 10-12.
  const last = { ...parts, makeRound: (l, r) => {
    const round = parts.makeRound(l, r);
    return { ...round, choices: [...round.choices.filter((c) => c.rule !== null), round.choices.find((c) => c.rule === null)] };
  } };
  assert.match(checkDeal(last, level).join('\n'), /card 4 holds the answer in 100\.0% of 5000 rounds: vary its place \(R4\), or say why in samePlace/);
  assert.deepEqual(checkDeal(last, { ...level, samePlace: 'a test of the opt-out' }), []);
  assert.match(checkDeal(parts, { ...level, samePlace: 'a test of the opt-out' }).join('\n'), /samePlace says why the answer keeps its card, but no card holds it in 80%/);
  const reason = (samePlace) => checkGame({ ...parts, levels: parts.levels.map((l, i) => (i === 1 ? { ...l, samePlace } : l)) }).join('\n');
  assert.doesNotMatch(reason('the answer is a relation, always last'), /samePlace/);
  assert.match(reason(true), /samePlace is the reason, in words/);
  assert.match(reason(' '), /samePlace is the reason, in words/);
});

test('the deal checks catch a form of a mixed level whose answer keeps its card, though the level\'s cards vary (R4, hunt 2 #4)', () => {
  const level = parts.levels.find((l) => l.id === 'split-sym');
  assert.deepEqual(checkDeal(parts, level), []);
  // The reversed form's answer always last, the standard form's as dealt: the balance's ? = a + b before 2026-11-01.
  const last = { ...parts, makeRound: (l, r) => {
    const round = parts.makeRound(l, r);
    if (round.eqform !== 'reversed') return round;
    return { ...round, choices: [...round.choices.filter((c) => c.rule !== null), round.choices.find((c) => c.rule === null)] };
  } };
  const caught = checkDeal(last, level).join('\n');
  assert.match(caught, /card 4 holds the answer in 100\.0% of the \d+ rounds of part\/reversed: vary its place \(R4\), or say why in samePlace/);
  assert.doesNotMatch(caught, /of 5000 rounds/, 'the level as a whole passes');
  assert.doesNotMatch(caught, /part\/standard/);
  assert.deepEqual(checkDeal(last, { ...level, samePlace: 'a test of the opt-out' }), []);
  // A form in fewer than 250 of the 5000 rounds is not checked alone (its share fails the deal here, not its card).
  const rare = { ...last, makeRound: (l, r) => last.makeRound({ ...l, forms: [{ eqform: 'reversed', w: 0.04 }, { eqform: 'standard', w: 0.96 }] }, r) };
  assert.doesNotMatch(checkDeal(rare, level).join('\n'), /holds the answer/);
});

test('the deal checks catch an answer found by a simple rule other than its card: a landmark set aside, or a neighbouring pair (decisions.md 2026-10-31)', () => {
  // 6 + 7 = ?, the bridge's two sets before 2026-10-31: the answer on card 3 or 2, but always the second card that is not 10.
  const bridge = cues([{ values: [3, 10, 13, 17], card: 2 }, { values: [3, 13, 14, 17], card: 1 }]);
  /** @type {(rule: string) => number | undefined} */
  const found = (rule) => bridge.find((c) => c.rule.startsWith(rule))?.found;
  assert.equal(found('card 3'), 1);
  assert.equal(found('card 2 of those that are not 10'), 2);
  // A landmark that is the answer is set aside too: the rule misses it.
  assert.equal(cues([{ values: [3, 10, 13, 17], card: 1 }]).find((c) => c.rule.startsWith('card 2 of those that are not 10'))?.found, 0);
  assert.equal(found('the smaller of the one pair of neighbouring numbers, else card 3'), 2);
  assert.equal(found('the larger of the one pair of neighbouring numbers, else card 3'), 1);
  // A slip always over the answer, as it stood on one side: the answer moves, the smaller of the pair finds it.
  const level = parts.levels[1];
  const beside = { ...parts, makeRound: (l, r) => {
    const round = parts.makeRound(l, r);
    const a = round.answer;
    const values = r.next() < 0.5 ? [a - 7, a - 5, a, a + 1] : [a, a + 1, a + 5, a + 7];
    return { ...round, choices: values.map((value) => ({ value, rule: value === a ? null : 'slip.near' })) };
  } };
  const caught = checkDeal(beside, level).join('\n');
  assert.match(caught, /"the smaller of the one pair of neighbouring numbers, else card 1" finds the answer in 100\.0% of 5000 rounds: vary its place \(R4\), or say why in samePlace/);
  assert.doesNotMatch(caught, /^card \d holds/m);
  assert.deepEqual(checkDeal(beside, { ...level, samePlace: 'a test of the opt-out' }), []);
});

test('R4 with the answer\'s place: a real error on no card leaves room only to rules before it on its side, but for a slip that crossed for another (lib/place.js)', () => {
  const order = SKILLS.find((s) => s.id === 'num.parts.split').rules;
  /** 3 + ? = 7 (answer 4): given.whole 7 and op.other 10 over it, given.part 3 under it, slips 3 and 5. */
  const round = structuredClone(parts.makeRound(parts.levels[1], rng(1)));
  Object.assign(round, { equation: { left: [3, '+', '?'], right: [7] }, answer: 4 });
  round.picture = [{ role: 'whole', count: 7, shown: 'tag' }, { role: 'part', count: 3, shown: 'items' }, { role: 'unknown', count: 4, shown: 'covered' }];
  const cards = (...wrong) => ({ ...round, choices: [{ value: 4, rule: null }, ...wrong.map(([value, rule]) => ({ value, rule }))].sort((a, b) => a.value - b.value) });
  const left = (...wrong) => checkLeftOut(parts, cards(...wrong), order).join('\n');
  // The free deal, and the answer moved down: given.part, the last real error under it, gives way to a slip over it.
  assert.equal(left([7, 'given.whole'], [3, 'given.part'], [10, 'op.other']), '');
  assert.equal(left([7, 'given.whole'], [5, 'slip.near'], [10, 'op.other']), '');
  // A slip on given.part's side, 3 under the answer: a slip in place of a real error that fits.
  assert.match(left([7, 'given.whole'], [10, 'op.other'], [2, 'slip.near']), /slip\.near is offered, but given\.part gives 3, a real error not on a card/);
  // op.other, a later rule, and a slip over the answer while given.whole is on no card there.
  assert.match(left([3, 'given.part'], [10, 'op.other'], [5, 'slip.near']), /is offered, but given\.whole gives 7, a real error not on a card/);
  assert.equal(sideOf([2, 5], [2, 3]), 1);
  assert.equal(sideOf(3, 4), -1);
  assert.equal(sideOf({ left: [1], right: [1] }, 2), null);
});

test('R2: the first level of a structure keeps the ceiling of its §4.6 row, not a grade', () => {
  const r2 = (game, level, round) => checkRound(game, level, 0, round).filter((p) => p.startsWith('R2'));
  // A story structure starts up to 5: the parts fixture's first level, with a whole of 6.
  const split = parts.levels[0];
  const story = structuredClone(parts.makeRound(split, rng(3)));
  assert.deepEqual(r2(parts, split, story), []);
  story.picture.find((g) => g.role === 'whole').count = 6;
  story.equation.right = [6];
  assert.match(r2(parts, split, story).join(), /first level of part-whole goes above 5/);
  // frac.unit.of-set level 1 (§4.11): half of 2-10 on 2 plates, no equation yet. share starts up to 12.
  const half = { id: 'half', skill: 'frac.unit.of-set', demo: true, structure: 'share', unknown: 'group-size', max: 10, model: 'plates', look: 'objects', options: 3, terms: true };
  const plates = (whole) => ({ skill: half.skill, structure: 'share', unknown: 'group-size', look: 'objects', model: 'plates', eqform: 'standard',
    text: '', terms: [], helpPicture: null, equation: null, answer: whole / 2, choices: [],
    picture: [{ role: 'whole', count: whole, shown: 'tag' }, { role: 'unknown', count: whole / 2, shown: 'covered' }, { role: 'part', count: whole / 2, shown: 'items' }] });
  const game = { ...parts, levels: [half] };
  assert.equal(FORMS.find((f) => f.structure === 'share')?.start, 12);
  assert.deepEqual(r2(game, half, plates(10)), []);
  assert.match(r2(game, half, plates(14)).join(), /first level of share goes above 12/);
  // equation has no ceiling (§6 starts it at 10 and 20).
  assert.equal(FORMS.find((f) => f.structure === 'equation')?.start, null);
});
