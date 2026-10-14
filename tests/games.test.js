// The generic game test (architecture 4.2, dev-spec A.2, decisions.md condition 5): every
// registered game and both fixtures, every level, seeds 1-200, in Node with no DOM and no
// storage. A new game gets all of it without writing a test. Choice rounds only for now: the
// build and estimate checks of A.2 come with the first game that has such rounds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { GAMES } from './all-games.js';
import * as parts from './fixtures/parts/game.js';
import * as scale from './fixtures/scale/game.js';
import { rng } from '../lib/rng.js';
import { RULES } from '../data/errors.js';
import { FORMS } from '../data/forms.js';
import { MODEL_ORDER } from '../data/models.js';
import { SKILLS } from '../data/skills.js';
import { SKILLS as SKILLS_MD, parseParams, read } from '../scripts/docs-parse.js';

const SEEDS = 200;
const PARAMS = parseParams(read(SKILLS_MD));
const LOOKS = ['objects', 'dots', 'symbols'];
const RELATIONS = ['<', '>', '=', 'left', 'right', 'level'];
const OPERATORS = ['+', '−', '×', ':'];
const METEG = String.fromCharCode(0x05bd);
const REQUIRED = { id: 'string', skill: 'string', demo: 'boolean', options: 'number', model: 'string', look: 'string', terms: 'boolean' };

const skillOf = (id) => SKILLS.find((s) => s.id === id);
const show = (x) => JSON.stringify(x);
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

/** The levels as the planner passes them: one per structure (or ask) of a mixed level. */
function variants(level) {
  for (const key of ['structure', 'ask']) {
    if (Array.isArray(level[key])) return level[key].map((value) => ({ ...level, [key]: value }));
  }
  return [level];
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
  const ids = levels.map((l) => l.id);
  ids.forEach((id, i) => ids.indexOf(id) !== i && fail(`level id ${id} is used twice`));
  levels.forEach((level, i) => {
    const where = `level ${i + 1} (${level.id})`;
    for (const [key, type] of Object.entries(REQUIRED)) if (typeof level[key] !== type) fail(`${where}: ${key} must be a ${type}`);
    if (!skillOf(level.skill)) fail(`${where}: skill ${level.skill} is not in skills.md`);
    if (![3, 4].includes(level.options)) fail(`${where}: options must be 3 or 4`);
    for (const [key, value] of Object.entries(level)) {
      if (['id', 'skill', 'min'].includes(key)) continue;
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
    for (const key of ['structure', 'ask']) {
      if (!Array.isArray(level[key])) continue;
      if (level[key].length < 2) fail(`${where}: a mixed ${key} needs two values or more`);
      for (const value of level[key]) {
        if (!levels.slice(0, i).some((l) => l[key] === value)) fail(`${where}: mixed ${key} ${value} has no earlier level of its own (R3)`);
      }
    }
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
  for (const key of ['structure', 'unknown', 'eqform', 'ask']) {
    const allowed = level[key] === undefined ? [undefined, ...(key === 'eqform' ? ['standard'] : [])] : [level[key]].flat();
    if (!allowed.includes(round[key])) fail(`round.${key} ${round[key]} is not among the level's ${show(level[key])}`);
  }
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
    const earlier = order.slice(0, order.indexOf(rule)).find((q) => game.rules[q] && predicts(game.rules[q](round), value));
    if (earlier) fail(`R4: ${show(value)} is tagged ${rule}, but ${earlier} comes first${reversed ? ' in a reversed form' : ' in the skill\'s list'} and gives it too`);
  }
  const real = wrong.filter((c) => !c.rule.startsWith('slip.')).length;
  if (listed.filter((r) => !r.startsWith('slip.')).length >= 2 && real < Math.min(2, wrong.length)) fail(`R4: ${real} real error(s); two are needed`);
  const values = choices.map((c) => c.value);
  if (values.every((v) => typeof v === 'number') && values.some((v, i) => i > 0 && v <= values[i - 1])) fail(`R4: numbers not ascending: ${show(values)}`);
  for (const a of judging ? [...round.answer.left, ...round.answer.right] : [round.answer].flat()) {
    if (typeof a === 'number' && (a < (level.min ?? 0) || a > (level.max ?? Infinity))) fail(`R4: the answer ${a} is outside the level's range`);
  }
  return problems;
}

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
        if (Array.isArray(level.eqform) && other < SEEDS / 4) problems.push(`R8: ${other} of ${SEEDS} rounds are not standard; 25% are needed`);
      }
      const unique = [...new Set(problems)];
      assert.ok(unique.length === 0, `${unique.length} problem(s), the first:\n  ${unique.slice(0, 15).join('\n  ')}`);
    });
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
