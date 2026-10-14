// Parsers for the docs, shared by tests/docs.test.js, scripts/gen-data.js and the game tests.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

export const ROOT = resolve(import.meta.dirname, '..');
export const SKILLS = 'docs/skills.md';
export const DEPTH = 'docs/depth';
export const SHARED = `${DEPTH}/README.md`; // §4 and §4.1
export const ERRORS = `${DEPTH}/errors.md`; // §4.2
export const MEANING = `${DEPTH}/addsub-meaning.md`; // §4.6, the R2 table

export const SKILL_ID = /^[a-z]+\.[a-z0-9]+(?:-[a-z0-9]+)*\.[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const RULE_ID = /^[a-z]+\.[a-z0-9]+(?:-[a-z0-9]+)*$/;
// A strand.topic.skill token inside any text; group 1 is the strand.
export const SKILL_TOKEN = /(?<![\w./])([a-z]+)\.[a-z0-9]+(?:-[a-z0-9]+)*\.[a-z0-9]+(?:-[a-z0-9]+)*(?![\w/-]|\.[a-z0-9])/g;
// A conditional prerequisite: `[max>20] pv.numeral.read`.
export const CONDITION = /^\[([a-zA-Z]+)(>=|<=|>|<|=)([A-Za-z0-9.-]+)\]\s*(.+)$/;
export const FILE_NAME = /\.(?:md|js|mjs|json|css|html|svg|png|pdf)$/;
export const METEG = '\u05BD';
export const NO_PREREQS = '\u2014'; // the dash in an empty prerequisites cell

/**
 * Reads a repo file.
 * @param {string} file path from the repo root
 * @returns {string}
 */
export function read(file) {
  return readFileSync(join(ROOT, file), 'utf8');
}

/**
 * Repo files with one of the extensions, as sorted repo-relative paths with '/'.
 * Skips .git, node_modules and the Playwright output folders.
 * @param {string[]} exts e.g. ['.md']
 * @param {string} [dir] absolute folder to search
 * @returns {string[]}
 */
export function listFiles(exts, dir = ROOT) {
  const skip = new Set(['.git', 'node_modules', 'test-results', 'playwright-report']);
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return skip.has(entry.name) ? [] : listFiles(exts, path);
      return exts.some((ext) => entry.name.endsWith(ext)) ? [relative(ROOT, path).split(sep).join('/')] : [];
    })
    .sort();
}

/**
 * The lines of a markdown text with fenced code blocks blanked, so line numbers still match.
 * @param {string} text
 * @returns {string[]}
 */
export function proseLines(text) {
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
export function ticked(text) {
  return [...text.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]);
}

/**
 * A line with its inline code spans removed.
 * @param {string} line
 * @returns {string}
 */
export function withoutCode(line) {
  return line.replace(/`[^`\n]*`/g, ' ');
}

/**
 * The trimmed cells of a markdown table row.
 * @param {string} line
 * @returns {string[]}
 */
export function cells(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

/**
 * The ids in the first column of a table: rows whose first cell is one code span.
 * @param {string} text
 * @returns {string[]}
 */
export function tableIds(text) {
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
export function underHeading(text, heading) {
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
export function sections(text, level) {
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
export function boldBlock(text, label) {
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
export function marked(text, name) {
  const m = text.match(new RegExp(`<!-- ${name} -->([\\s\\S]*?)<!-- /${name} -->`));
  return m ? m[1] : null;
}

/**
 * The body of a top-level bold bullet (`- **label...**`) in a section, to the next bold bullet.
 * @param {string} body
 * @param {string} label e.g. 'טעויות'
 * @returns {string | null}
 */
export function bullet(body, label) {
  const m = body.match(new RegExp(`\\n- \\*\\*${label}[^*\\n]*\\*\\*([\\s\\S]*?)(?=\\n- \\*\\*|$)`));
  return m ? m[1] : null;
}

// ---------- skills.md ----------

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
export function parseParams(text) {
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
export function parseStrands(text) {
  const strands = new Map();
  for (const line of (underHeading(text, '## התחומים') ?? '').split('\n')) {
    if (line.startsWith('| `')) strands.set(cells(line)[0].replace(/`/g, ''), cells(line)[1]);
  }
  return strands;
}

/**
 * @typedef {object} SkillRow
 * @property {string} id
 * @property {string} grade e.g. 'א–ב [ת]'
 * @property {string} prereqs the raw cell
 * @property {string} depth 'עומק' or 'מפה', maybe with a note
 * @property {string} rules the raw cell
 */

/**
 * The skill table in skills.md, in written order, and any malformed rows.
 * @param {string} text skills.md
 * @param {Map<string, string>} strands
 * @returns {{ skills: Map<string, SkillRow>, problems: string[] }}
 */
export function parseSkills(text, strands) {
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
export function parsePrereqs(cell) {
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
 * The prerequisites of a skills.md cell in the shape the code reads:
 * `{ base: [...], when: [{ if: { max: '>20' }, add: [...] }] }`.
 * @param {string} cell
 * @returns {{ base: string[], when: { if: Record<string, string>, add: string[] }[] }}
 */
export function parseRequires(cell) {
  const requires = { base: [], when: [] };
  const split = (ids) => ids.split(',').map((id) => id.trim());
  for (const token of ticked(cell)) {
    const m = token.match(CONDITION);
    if (m) requires.when.push({ if: { [m[1]]: `${m[2]}${m[3]}` }, add: split(m[4]) });
    else requires.base.push(...split(token));
  }
  return requires;
}

/**
 * Whether a condition value fits its parameter: a listed value (or one in the range)
 * for '=', a number for comparisons on a numeric parameter.
 * @param {Param} param
 * @param {string} op
 * @param {string} value
 * @returns {boolean}
 */
export function allows(param, op, value) {
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
export function findCycles(graph) {
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
 * @param {SkillRow} skill
 * @returns {boolean}
 */
export function isEarly(skill) {
  return skill.grade.startsWith('א') || skill.grade.startsWith('ב');
}

/**
 * 'depth', 'map12' (grade 1-2 map), 'upper' (grade 3+ map) or 'other' (bad depth cell).
 * @param {SkillRow} skill
 * @returns {'depth' | 'map12' | 'upper' | 'other'}
 */
export function kindOf(skill) {
  if (skill.depth.startsWith('עומק')) return 'depth';
  if (skill.depth.startsWith('מפה')) return isEarly(skill) ? 'map12' : 'upper';
  return 'other';
}

// ---------- the §4.2 catalogue ----------

const TYPE_WORDS = { 'מספר': 'number', 'יחס': 'relation', 'תמונה': 'picture', 'כרטיס': 'card', 'סדר': 'order' };

/**
 * The value types of a catalogue "סוג" cell, e.g. 'יחס, תמונה או סדר'. 'לפי הסיבוב' is 'any'.
 * @param {string} cell
 * @returns {string[]}
 */
export function typesOf(cell) {
  if (cell.includes('לפי הסיבוב')) return ['any'];
  return cell.split(/,|\sאו\s/).map((word) => TYPE_WORDS[word.trim()] ?? `?${word.trim()}`);
}

/**
 * The §4.2 catalogue: rule id -> its display ids and its value types, the listed candidates
 * and the closed ones.
 * @param {string} text errors.md
 * @returns {{ rules: Map<string, string[]>, types: Map<string, string[]>, candidates: Set<string>, retired: Set<string>, problems: string[] }}
 */
export function parseCatalogue(text) {
  const rules = new Map();
  const types = new Map();
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
    types.set(id, typesOf(row[3]));
  }
  const retired = new Set([...(marked(text, 'retired') ?? '').matchAll(/^- `([^`]+)`/gm)].map((m) => m[1]));
  const listed = ticked(marked(text, 'candidates') ?? '').filter((t) => RULE_ID.test(t));
  const candidates = new Set(listed.filter((id) => !retired.has(id)));
  return { rules, types, candidates, retired, problems };
}

// ---------- §4.6 forms and the model lines of §4.3-§4.14 ----------

/**
 * @typedef {{ left: string[], right: string[] }} Shape
 * Tokens: 'n' for a given number, '?', and '+', '−', '×', ':' or '∘' (any of + and −).
 */

/**
 * The shape of a §4.6 form such as `a + ? = c`: letters become 'n'.
 * @param {string} form
 * @returns {Shape}
 */
export function shapeOf(form) {
  const tokens = form.trim().split(/\s+/).map((t) => (/^[a-z]$/.test(t) ? 'n' : t));
  const eq = tokens.indexOf('=');
  return { left: tokens.slice(0, eq), right: tokens.slice(eq + 1) };
}

/**
 * The §4.6 table (structure, unknown, forms, reversed forms) as shapes.
 * @param {string} text addsub-meaning.md
 * @returns {{ structure: string, unknown: string, forms: Shape[], reversed: Shape[] }[]}
 */
export function parseForms(text) {
  return (boldBlock(text, 'טבלת ההתאמה') ?? '')
    .split('\n')
    .filter((line) => line.startsWith('| `'))
    .map((line) => {
      const [structure, unknown, forms, reversed] = cells(line);
      return {
        structure: ticked(structure)[0],
        unknown: ticked(unknown)[0],
        forms: ticked(forms).map(shapeOf),
        reversed: ticked(reversed).map(shapeOf),
      };
    });
}

/**
 * Each depth skill's allowed model order, from the "מודל" bullet of its section. A bullet that
 * says "like `other.skill`" copies that skill's order; a bullet with no model id gives [].
 * @param {string[]} texts the strand files
 * @param {string[]} models the model ids (the `model` parameter values)
 * @returns {Record<string, string[]>} in the order the sections are written
 */
export function parseModels(texts, models) {
  /** @type {Record<string, string[]>} */
  const order = {};
  const refs = new Map();
  for (const text of texts) {
    for (const { heading, body } of sections(proseLines(text).join('\n'), 3)) {
      if (!heading.startsWith('### `')) continue;
      const line = bullet(body, 'מודל');
      if (line === null) continue;
      const id = ticked(heading)[0];
      const found = ticked(line).filter((t) => models.includes(t));
      const ref = ticked(line).find((t) => SKILL_ID.test(t));
      order[id] = found;
      if (!found.length && ref) refs.set(id, ref);
    }
  }
  for (const [id, ref] of refs) order[id] = [...(order[ref] ?? [])];
  return order;
}
