// Consistency checks for the docs: skill ids, prerequisites, error rules, displays,
// models, totals, meteg and links. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  DEPTH, ERRORS, FILE_NAME, METEG, ROOT, RULE_ID, SHARED, SKILLS, SKILL_ID, SKILL_TOKEN,
  allows, boldBlock, bullet, findCycles, isEarly, kindOf, listFiles, parseCatalogue, parseParams,
  parsePrereqs, parseSkills, parseStrands, proseLines, read, sections, tableIds, ticked, underHeading,
  withoutCode,
} from '../scripts/docs-parse.js';

const TOTALS = /בסך הכול (\d+) מיומנויות פעילות: (\d+) בעומק.*?(\d+) של\s+כיתות א–ב ברמת מפה, ו-(\d+) של כיתה ג/s;

// ---------- helpers ----------

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
      const errors = bullet(body, 'טעויות');
      if (errors === null) {
        problems.push(`${file}: ${id}: no "טעויות" bullet`);
        continue;
      }
      const inSection = [...new Set(ticked(errors).filter((t) => RULE_ID.test(t)))];
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
