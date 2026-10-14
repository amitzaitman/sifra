// Consistency checks for the docs: skill ids, prerequisites, error rules, displays,
// models, totals, meteg and links. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const SKILLS = 'docs/skills.md';
const DEPTH = 'docs/depth';
const SHARED = `${DEPTH}/README.md`; // §4 and §4.1
const ERRORS = `${DEPTH}/errors.md`; // §4.2

const SKILL_ID = /^[a-z]+\.[a-z0-9]+(?:-[a-z0-9]+)*\.[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RULE_ID = /^[a-z]+\.[a-z0-9]+(?:-[a-z0-9]+)*$/;
// A strand.topic.skill token inside any text; group 1 is the strand.
const SKILL_TOKEN = /(?<![\w./])([a-z]+)\.[a-z0-9]+(?:-[a-z0-9]+)*\.[a-z0-9]+(?:-[a-z0-9]+)*(?![\w/-]|\.[a-z0-9])/g;
// A conditional prerequisite: `[max>20] pv.numeral.read`.
const CONDITION = /^\[([a-zA-Z]+)(>=|<=|>|<|=)([A-Za-z0-9.-]+)\]\s*(.+)$/;
const FILE_NAME = /\.(?:md|js|mjs|json|css|html|svg|png|pdf)$/;
const TOTALS = /בסך הכול (\d+) מיומנויות פעילות: (\d+) בעומק.*?(\d+) של\s+כיתות א–ב ברמת מפה, ו-(\d+) של כיתה ג/s;
const METEG = '\u05BD';
const NO_PREREQS = '\u2014'; // the dash in an empty prerequisites cell

// ---------- helpers ----------

/**
 * Reads a repo file.
 * @param {string} file path from the repo root
 * @returns {string}
 */
function read(file) {
  return readFileSync(join(ROOT, file), 'utf8');
}

/**
 * Repo files with one of the extensions, as sorted repo-relative paths with '/'.
 * Skips .git and node_modules.
 * @param {string[]} exts e.g. ['.md']
 * @param {string} [dir] absolute folder to search
 * @returns {string[]}
 */
function listFiles(exts, dir = ROOT) {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        return entry.name === '.git' || entry.name === 'node_modules' ? [] : listFiles(exts, path);
      }
      return exts.some((ext) => entry.name.endsWith(ext)) ? [relative(ROOT, path).split(sep).join('/')] : [];
    })
    .sort();
}

/**
 * The lines of a markdown text with fenced code blocks blanked, so line numbers still match.
 * @param {string} text
 * @returns {string[]}
 */
function proseLines(text) {
  let fence = '';
  return text.split('\n').map((line) => {
    const m = line.match(/^\s*(`{3,}|~{3,})/);
    const closes = m && fence && m[1][0] === fence[0] && m[1].length >= fence.length;
    if (m && (!fence || closes)) {
      fence = fence ? '' : m[1];
      return '';
    }
    return fence ? '' : line;
  });
}

/**
 * The contents of the inline code spans in a text (the docs keep each span on one line).
 * @param {string} text
 * @returns {string[]}
 */
function ticked(text) {
  return [...text.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]);
}

/**
 * A line with its inline code spans removed.
 * @param {string} line
 * @returns {string}
 */
function withoutCode(line) {
  return line.replace(/`[^`\n]*`/g, ' ');
}

/**
 * The trimmed cells of a markdown table row.
 * @param {string} line
 * @returns {string[]}
 */
function cells(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

/**
 * The ids in the first column of a table: rows whose first cell is one code span.
 * @param {string} text
 * @returns {string[]}
 */
function tableIds(text) {
  return text
    .split('\n')
    .filter((line) => line.startsWith('| `'))
    .map((line) => cells(line)[0].replace(/^`|`$/g, ''));
}

/**
 * The text under a heading, up to the next heading of the same or a higher level.
 * @param {string} text
 * @param {string} heading the whole heading line, e.g. '### מזהי תצוגה'
 * @returns {string | null} null when the heading is missing
 */
function underHeading(text, heading) {
  const lines = text.split('\n');
  const start = lines.indexOf(heading);
  if (start < 0) return null;
  const level = heading.indexOf(' ');
  const end = lines.findIndex((line, i) => i > start && /^#+ /.test(line) && line.indexOf(' ') <= level);
  return lines.slice(start + 1, end < 0 ? undefined : end).join('\n');
}

/**
 * The sections that start with a heading of the given level, each up to the next heading
 * of the same or a higher level.
 * @param {string} text
 * @param {number} level 3 for '###'
 * @returns {{ heading: string, body: string }[]}
 */
function sections(text, level) {
  const lines = text.split('\n');
  const isHeading = (line, max) => /^#+ /.test(line) && line.indexOf(' ') <= max;
  const found = [];
  lines.forEach((line, i) => {
    if (!isHeading(line, level) || line.indexOf(' ') !== level) return;
    const end = lines.findIndex((next, j) => j > i && isHeading(next, level));
    found.push({ heading: line, body: lines.slice(i + 1, end < 0 ? undefined : end).join('\n') });
  });
  return found;
}

/**
 * A block that starts with a bold label and runs to the next line that starts with bold or a heading.
 * @param {string} text
 * @param {string} label e.g. 'תצוגות התוצאה'
 * @returns {string | null}
 */
function boldBlock(text, label) {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => line.startsWith(`**${label}`));
  if (start < 0) return null;
  const end = lines.findIndex((line, i) => i > start && /^(\*\*|#)/.test(line));
  return lines.slice(start, end < 0 ? undefined : end).join('\n');
}

/**
 * The text between `<!-- name -->` and `<!-- /name -->`.
 * @param {string} text
 * @param {string} name
 * @returns {string | null}
 */
function marked(text, name) {
  const m = text.match(new RegExp(`<!-- ${name} -->([\\s\\S]*?)<!-- /${name} -->`));
  return m ? m[1] : null;
}

/**
 * Values that appear more than once.
 * @param {string[]} list
 * @returns {string[]}
 */
function duplicates(list) {
  return [...new Set(list.filter((x, i) => list.indexOf(x) !== i))];
}

/**
 * Problems for ids that are in only one of two lists.
 * @param {string} what e.g. 'model ids'
 * @param {[string, string[]]} a [where, ids]
 * @param {[string, string[]]} b [where, ids]
 * @returns {string[]}
 */
function compareIds(what, [aName, a], [bName, b]) {
  const problems = [];
  const onlyA = a.filter((x) => !b.includes(x));
  const onlyB = b.filter((x) => !a.includes(x));
  if (onlyA.length) problems.push(`${what} only in ${aName}: ${onlyA.join(', ')}`);
  if (onlyB.length) problems.push(`${what} only in ${bName}: ${onlyB.join(', ')}`);
  return problems;
}

/**
 * Fails the test with one line per problem.
 * @param {string[]} problems
 */
function assertNone(problems) {
  assert.ok(problems.length === 0, `${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
}

// ---------- parsing skills.md and the catalogue ----------

/**
 * @typedef {object} Param
 * @property {string[]} values the listed values
 * @property {[number, number] | null} range for a row written "`0` עד `10`"
 */

/**
 * The level parameters table in skills.md.
 * @param {string} text skills.md
 * @returns {Map<string, Param>}
 */
function parseParams(text) {
  const params = new Map();
  for (const line of (underHeading(text, '### פרמטרים של רמה') ?? '').split('\n')) {
    if (!line.startsWith('| `')) continue;
    const [name, values] = cells(line);
    const range = values.match(/^`(\d+)` עד `(\d+)`/);
    params.set(name.replace(/`/g, ''), {
      values: ticked(values),
      range: range ? [Number(range[1]), Number(range[2])] : null,
    });
  }
  return params;
}

/**
 * The strands table in skills.md: strand id -> Hebrew name.
 * @param {string} text skills.md
 * @returns {Map<string, string>}
 */
function parseStrands(text) {
  const strands = new Map();
  for (const line of (underHeading(text, '## התחומים') ?? '').split('\n')) {
    if (line.startsWith('| `')) strands.set(cells(line)[0].replace(/`/g, ''), cells(line)[1]);
  }
  return strands;
}

/**
 * @typedef {object} Skill
 * @property {string} id
 * @property {string} grade e.g. 'א–ב [ת]'
 * @property {string} prereqs the raw cell
 * @property {string} depth 'עומק' or 'מפה', maybe with a note
 * @property {string} rules the raw cell
 */

/**
 * The skill table in skills.md, and any malformed rows.
 * @param {string} text skills.md
 * @param {Map<string, string>} strands
 * @returns {{ skills: Map<string, Skill>, problems: string[] }}
 */
function parseSkills(text, strands) {
  const skills = new Map();
  const problems = [];
  const table = underHeading(text, '## הטבלה');
  if (table === null) problems.push(`${SKILLS}: heading "## הטבלה" not found`);
  for (const line of (table ?? '').split('\n')) {
    if (!line.startsWith('| `')) continue;
    const row = cells(line);
    const id = row[0].replace(/^`|`$/g, '');
    if (row.length !== 8) {
      problems.push(`${SKILLS}: ${id}: row has ${row.length} cells, expected 8`);
      continue;
    }
    const [, strandName, grade, , prereqs, , depth, rules] = row;
    const strand = id.split('.')[0];
    if (!SKILL_ID.test(id)) problems.push(`${SKILLS}: bad skill id "${id}"`);
    if (skills.has(id)) problems.push(`${SKILLS}: duplicate skill ${id}`);
    if (!strands.has(strand)) problems.push(`${SKILLS}: ${id}: strand "${strand}" is not in the strands table`);
    else if (strands.get(strand) !== strandName) {
      const want = strands.get(strand);
      problems.push(`${SKILLS}: ${id}: strand column says "${strandName}", the strands table says "${want}"`);
    }
    skills.set(id, { id, grade, prereqs, depth, rules });
  }
  return { skills, problems };
}

/**
 * The prerequisites in a skills.md cell: plain ids, and conditional ones written
 * `[param>value] id, id`. Conditions are separated by ';'.
 * @param {string} cell
 * @returns {{ ids: string[], conditions: { param: string, op: string, value: string }[], malformed: string[] }}
 */
function parsePrereqs(cell) {
  const result = { ids: [], conditions: [], malformed: [] };
  const split = (ids) => ids.split(',').map((id) => id.trim());
  for (const token of ticked(cell)) {
    const m = token.match(CONDITION);
    if (m) {
      result.conditions.push({ param: m[1], op: m[2], value: m[3] });
      result.ids.push(...split(m[4]));
    } else if (token.startsWith('[')) {
      result.malformed.push(token);
    } else {
      result.ids.push(...split(token));
    }
  }
  // Outside the code spans only separators may remain.
  const rest = withoutCode(cell).replaceAll(NO_PREREQS, '').replace(/[\s,;]/g, '');
  if (rest) result.malformed.push(rest);
  return result;
}

/**
 * Whether a condition value fits its parameter: a listed value (or one in the range)
 * for '=', a number for comparisons on a numeric parameter.
 * @param {Param} param
 * @param {string} op
 * @param {string} value
 * @returns {boolean}
 */
function allows(param, op, value) {
  const isNumber = /^\d+$/.test(value);
  const [low, high] = param.range ?? [NaN, NaN];
  const inRange = isNumber && low <= Number(value) && Number(value) <= high;
  if (op === '=') return param.values.includes(value) || inRange;
  return isNumber && param.values.some((v) => /^\d+$/.test(v));
}

/**
 * Prerequisite cycles found by a depth-first search (at least one per loop), each as a
 * path that ends where it starts.
 * @param {Map<string, string[]>} graph skill -> prerequisites
 * @returns {string[][]}
 */
function findCycles(graph) {
  const state = new Map();
  const cycles = [];
  const visit = (node, path) => {
    if (state.get(node) === 'open') {
      cycles.push([...path.slice(path.indexOf(node)), node]);
      return;
    }
    if (state.get(node) === 'done') return;
    state.set(node, 'open');
    for (const next of graph.get(node) ?? []) if (graph.has(next)) visit(next, [...path, node]);
    state.set(node, 'done');
  };
  for (const node of graph.keys()) visit(node, []);
  return cycles;
}

/**
 * Whether a skill is in grades 1-2 (א or ב, by the first letter of the grade cell).
 * @param {Skill} skill
 * @returns {boolean}
 */
function isEarly(skill) {
  return skill.grade.startsWith('א') || skill.grade.startsWith('ב');
}

/**
 * 'depth', 'map12' (grade 1-2 map), 'upper' (grade 3+ map) or 'other' (bad depth cell).
 * @param {Skill} skill
 * @returns {'depth' | 'map12' | 'upper' | 'other'}
 */
function kindOf(skill) {
  if (skill.depth.startsWith('עומק')) return 'depth';
  if (skill.depth.startsWith('מפה')) return isEarly(skill) ? 'map12' : 'upper';
  return 'other';
}

/**
 * The §4.2 catalogue: rule id -> its display ids, the listed candidates and the closed ones.
 * @param {string} text errors.md
 * @returns {{ rules: Map<string, string[]>, candidates: Set<string>, retired: Set<string>, problems: string[] }}
 */
function parseCatalogue(text) {
  const rules = new Map();
  const problems = [];
  const table = marked(text, 'catalog');
  if (table === null) problems.push(`${ERRORS}: the <!-- catalog --> markers are missing`);
  for (const line of (table ?? '').split('\n')) {
    if (!line.startsWith('| `')) continue;
    const row = cells(line);
    const id = row[0].replace(/^`|`$/g, '');
    if (row.length !== 7) {
      problems.push(`${ERRORS}: catalogue row ${id} has ${row.length} cells, expected 7`);
      continue;
    }
    if (rules.has(id)) problems.push(`${ERRORS}: duplicate catalogue rule ${id}`);
    rules.set(id, ticked(row[4]));
  }
  const retired = new Set([...(marked(text, 'retired') ?? '').matchAll(/^- `([^`]+)`/gm)].map((m) => m[1]));
  const listed = ticked(marked(text, 'candidates') ?? '').filter((t) => RULE_ID.test(t));
  const candidates = new Set(listed.filter((id) => !retired.has(id)));
  return { rules, candidates, retired, problems };
}

const skillsText = read(SKILLS);
const params = parseParams(skillsText);
const strands = parseStrands(skillsText);
const { skills, problems: tableProblems } = parseSkills(skillsText, strands);
const catalogue = parseCatalogue(read(ERRORS));
const docFiles = listFiles(['.md'], join(ROOT, 'docs'));
const strandFiles = docFiles.filter((f) => f.startsWith(`${DEPTH}/`) && f !== SHARED && f !== ERRORS);

/**
 * The skill ids mentioned in one line: a code span that is a whole skill id, and any
 * strand.topic.skill token, in code or prose, whose strand is in the strands table.
 * @param {string} line
 * @returns {Set<string>}
 */
function skillMentions(line) {
  const found = ticked(line).filter((t) => SKILL_ID.test(t) && !FILE_NAME.test(t));
  for (const m of line.matchAll(SKILL_TOKEN)) if (strands.has(m[1])) found.push(m[0]);
  return new Set(found);
}

/**
 * The link targets in one line: `[text](target)` and `![alt](target)`, without a title.
 * @param {string} line
 * @returns {string[]}
 */
function linkTargets(line) {
  const links = line.matchAll(/!?\[[^\]]*\]\(\s*(<[^>]*>|[^)\s]+)(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g);
  return [...links].map((m) => m[1].replace(/^<|>$/g, ''));
}

// ---------- the checks ----------

test('1. every skill id mentioned in docs/, CLAUDE.md and README.md is in skills.md', () => {
  const problems = [];
  for (const file of [...docFiles, 'CLAUDE.md', 'README.md']) {
    proseLines(read(file)).forEach((line, i) => {
      for (const id of skillMentions(line)) {
        if (!skills.has(id)) problems.push(`${file}:${i + 1}: unknown skill ${id}`);
      }
    });
  }
  assertNone(problems);
});

test('2. the skill table is well formed, prerequisites resolve, and there are no cycles', () => {
  const problems = [...tableProblems];
  const graph = new Map();
  for (const skill of skills.values()) {
    const where = `${SKILLS}: ${skill.id}`;
    const { ids, conditions, malformed } = parsePrereqs(skill.prereqs);
    for (const bad of malformed) problems.push(`${where}: malformed prerequisite "${bad}"`);
    for (const { param, op, value } of conditions) {
      if (!params.has(param)) problems.push(`${where}: condition on unknown parameter "${param}"`);
      else if (!allows(params.get(param), op, value)) {
        problems.push(`${where}: condition [${param}${op}${value}]: ${value} is not a value of ${param}`);
      }
    }
    for (const id of ids) if (!skills.has(id)) problems.push(`${where}: unknown prerequisite ${id}`);
    graph.set(skill.id, ids);
  }
  const cycles = new Set(findCycles(graph).map((cycle) => cycle.join(' > ')));
  for (const cycle of cycles) problems.push(`${SKILLS}: prerequisite cycle ${cycle}`);
  assertNone(problems);
});

test('3. each depth section lists exactly the rules of its skills.md row', () => {
  const problems = [];
  const sectionFile = new Map();
  for (const file of strandFiles) {
    for (const { heading, body } of sections(proseLines(read(file)).join('\n'), 3)) {
      if (!heading.startsWith('### `')) continue;
      const id = ticked(heading)[0];
      const skill = skills.get(id);
      if (sectionFile.has(id)) problems.push(`${file}: ${id}: second depth section, first in ${sectionFile.get(id)}`);
      sectionFile.set(id, file);
      if (!skill) {
        problems.push(`${file}: depth section for unknown skill ${id}`);
        continue;
      }
      if (kindOf(skill) !== 'depth') {
        problems.push(`${file}: ${id} has a depth section, but skills.md marks it "${skill.depth}"`);
        continue;
      }
      const bullet = body.match(/\n- \*\*טעויות[^*\n]*\*\*([\s\S]*?)(?=\n- \*\*|$)/);
      if (!bullet) {
        problems.push(`${file}: ${id}: no "טעויות" bullet`);
        continue;
      }
      const inSection = [...new Set(ticked(bullet[1]).filter((t) => RULE_ID.test(t)))];
      problems.push(
        ...compareIds(`${file}: ${id}: rules`, ['the section', inSection], [SKILLS, ticked(skill.rules)]),
      );
    }
  }
  for (const skill of skills.values()) {
    if (kindOf(skill) === 'depth' && !sectionFile.has(skill.id)) {
      problems.push(`${DEPTH}: no depth section for ${skill.id}`);
    }
  }
  assertNone(problems);
});

test('4. every rule a skill uses is in the errors.md catalogue, and every catalogue rule is used', () => {
  const problems = [...catalogue.problems];
  const used = new Map(); // rule -> skills
  const candidates = new Map(); // candidate rule -> map skills
  for (const skill of skills.values()) {
    const ids = ticked(skill.rules);
    const target = skill.rules.includes('מועמדים') ? candidates : used;
    for (const rule of ids) {
      if (!RULE_ID.test(rule)) problems.push(`${SKILLS}: ${skill.id}: bad rule id "${rule}"`);
      target.set(rule, [...(target.get(rule) ?? []), skill.id]);
    }
    if (kindOf(skill) === 'depth' && !ids.length) {
      problems.push(`${SKILLS}: ${skill.id}: depth skill without rules`);
    }
  }
  const { rules, candidates: listed, retired } = catalogue;
  for (const [rule, by] of used) {
    if (!rules.has(rule)) {
      problems.push(`${SKILLS}: rule ${rule} (used by ${by.join(', ')}) is not in the ${ERRORS} catalogue`);
    }
  }
  for (const rule of rules.keys()) {
    if (!used.has(rule)) problems.push(`${ERRORS}: catalogue rule ${rule} is used by no skill`);
  }
  for (const [rule, by] of candidates) {
    if (!listed.has(rule) && !rules.has(rule)) {
      const where = `${SKILLS}: candidate ${rule} (${by.join(', ')})`;
      problems.push(`${where} is neither listed in ${ERRORS} nor a catalogue rule`);
    }
  }
  for (const rule of listed) {
    if (rules.has(rule)) problems.push(`${ERRORS}: listed candidate ${rule} is already a catalogue rule`);
  }
  for (const rule of retired) {
    if (rules.has(rule) || listed.has(rule)) problems.push(`${ERRORS}: closed candidate ${rule} is still active`);
  }
  // Any rule-shaped id in docs/ must be a catalogue rule, a candidate or a closed candidate.
  for (const file of docFiles) {
    proseLines(read(file)).forEach((line, i) => {
      for (const t of ticked(line)) {
        if (!RULE_ID.test(t) || FILE_NAME.test(t)) continue;
        const known = rules.has(t) || listed.has(t) || retired.has(t);
        if (!known) problems.push(`${file}:${i + 1}: unknown rule ${t}`);
      }
    });
  }
  assertNone(problems);
});

test('5. every display is defined once in §4.1, counted, used, and listed in skills.md', () => {
  const problems = [];
  const block = boldBlock(read(SHARED), 'תצוגות התוצאה');
  if (block === null) problems.push(`${SHARED}: the "**תצוגות התוצאה**" block was not found`);
  const displays = tableIds(block ?? '');
  const stated = (block ?? '').match(/יש (\d+) תצוגות משותפות/);
  if (!stated || Number(stated[1]) !== displays.length) {
    problems.push(`${SHARED}: §4.1 says ${stated?.[1] ?? '?'} displays, its table has ${displays.length}`);
  }
  for (const id of duplicates(displays)) problems.push(`${SHARED}: duplicate display ${id}`);
  const listed = ticked(underHeading(skillsText, '### מזהי תצוגה') ?? '');
  problems.push(...compareIds('display ids', [SHARED, displays], [SKILLS, listed]));
  const usedDisplays = new Set();
  for (const [rule, ids] of catalogue.rules) {
    if (ids.length !== 1) {
      problems.push(`${ERRORS}: ${rule} names ${ids.length} displays (${ids.join(', ')}), expected one`);
    }
    for (const id of ids) {
      usedDisplays.add(id);
      if (!displays.includes(id)) problems.push(`${ERRORS}: ${rule}: display ${id} is not defined in ${SHARED}`);
    }
  }
  for (const id of displays) {
    if (!usedDisplays.has(id)) problems.push(`${SHARED}: display ${id} is used by no catalogue rule`);
  }
  assertNone(problems);
});

test('6. the model ids in §4.1 match the model parameter in skills.md', () => {
  const problems = [];
  const block = boldBlock(read(SHARED), 'המודלים (R3)');
  if (block === null) problems.push(`${SHARED}: the "**המודלים (R3).**" block was not found`);
  const models = tableIds(block ?? '');
  for (const id of duplicates(models)) problems.push(`${SHARED}: duplicate model ${id}`);
  const param = params.get('model');
  if (!param) problems.push(`${SKILLS}: no \`model\` row in the parameters table`);
  problems.push(...compareIds('model ids', [SHARED, models], [SKILLS, param?.values ?? []]));
  assertNone(problems);
});

test('7. the totals sentence in skills.md matches the table', (t) => {
  const problems = [];
  const counts = { all: skills.size, depth: 0, map12: 0, upper: 0 };
  for (const skill of skills.values()) {
    const kind = kindOf(skill);
    if (kind !== 'other') counts[kind] += 1;
    else problems.push(`${SKILLS}: ${skill.id}: depth cell "${skill.depth}" is neither עומק nor מפה`);
    if (kind === 'depth' && !isEarly(skill)) {
      problems.push(`${SKILLS}: ${skill.id}: depth skill outside grades 1-2 (grade "${skill.grade}")`);
    }
  }
  const { all, depth, map12, upper } = counts;
  t.diagnostic(`skills ${all}: depth ${depth}, grade 1-2 map ${map12}, grade 3+ map ${upper}`);
  const m = skillsText.match(TOTALS);
  if (!m) problems.push(`${SKILLS}: the totals sentence ("בסך הכול ...") was not found`);
  else {
    const said = m.slice(1).map(Number).join(', ');
    const table = [all, depth, map12, upper].join(', ');
    if (said !== table) problems.push(`${SKILLS}: the totals sentence says ${said}, the table gives ${table}`);
  }
  assertNone(problems);
});

test('8. no meteg (U+05BD) in any .md file (or .js, .json, .html, .css)', () => {
  const problems = [];
  for (const file of listFiles(['.md', '.js', '.json', '.html', '.css'])) {
    read(file).split('\n').forEach((line, i) => {
      const n = line.split(METEG).length - 1;
      if (n) problems.push(`${file}:${i + 1}: ${n} meteg`);
    });
  }
  assertNone(problems);
});

test('9. every relative link in the .md files points to an existing file', () => {
  const problems = [];
  for (const file of listFiles(['.md'])) {
    proseLines(read(file)).forEach((line, i) => {
      for (const target of linkTargets(withoutCode(line))) {
        // Skip web and mail links, and links to a heading in the same file.
        if (/^(?:https?|mailto):/i.test(target) || target.startsWith('#')) continue;
        let path = target.replace(/[#?].*$/, '');
        try {
          path = decodeURI(path);
        } catch {
          // keep the raw path; existsSync reports it
        }
        const absolute = path.startsWith('/') ? join(ROOT, path) : join(ROOT, dirname(file), path);
        if (!existsSync(absolute)) problems.push(`${file}:${i + 1}: broken link (${target})`);
      }
    });
  }
  assertNone(problems);
});
