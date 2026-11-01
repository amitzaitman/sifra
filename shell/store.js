// Storage (architecture 3.9, pedagogy 5.11): one key with a schema number. The storage object
// comes from start(); every access is in try/catch, and when it fails the shell plays from memory.

export const KEY = 'sifra';
export const SCHEMA = 1;
export const CAPS = { attempts: 4000, events: 500 };

/** @type {(day: string) => Child} */
export const newChild = (day) => ({ created: day, sessions: 0, games: {}, skills: {}, attempts: [], events: [] });

// The stored records (types.d.ts): each key with a check of its value. Changing a key changes the
// stored shape and needs a SCHEMA step: tests/store.test.js pins SHAPE to each schema.
const text = (v) => typeof v === 'string';
const orNull = (ok) => (v) => v === null || ok(v);
const count = (v) => Number.isInteger(v) && v >= 0;
const list = (v) => Array.isArray(v);
const map = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const CHECKS = {
  child: { created: text, sessions: count, games: map, skills: map, attempts: list, events: list },
  ladder: { level: text, fast: orNull(text), streak: count, window: list, passed: list, at: map, demoSeen: list, demoDue: orNull(text), hold: orNull(text) },
  skill: { last: orNull(text), passedDay: orNull(text), box: count, due: orNull(text), reviewDays: list, lastReviewFirst: orNull((v) => typeof v === 'boolean') },
};
/** The keys of a child (newChild), a ladder (ladder.js startLadder) and a skill state (planner.js schedule). */
export const SHAPE = { child: Object.keys(CHECKS.child), ladder: Object.keys(CHECKS.ladder), skill: Object.keys(CHECKS.skill) };
/** @type {(level: string) => Ladder} a stored ladder's defaults: out of its fast climb */
const baseLadder = (level) => ({ level, fast: null, streak: 0, window: [], passed: [], at: {}, demoSeen: [], demoDue: null, hold: null });
/** @type {() => SkillState} */
const baseSkill = () => ({ last: null, passedDay: null, box: 0, due: null, reviewDays: [], lastReviewFirst: null });

/** @type {(when: { t: string, day: string }, lost: Record<string, any>) => Record<string, any>} stamped as app.js stamps events */
const repair = (when, lost) => ({ t: when.t, day: when.day, type: 'repair', lost });

/**
 * A record with every key of its shape: a missing value takes the default; so does a wrong-typed
 * one, whose value goes in lost under its path. Keys outside the shape stay.
 * @param {Record<string, any>} value
 * @param {Record<string, (v: any) => boolean>} checks
 * @param {Record<string, any>} base
 * @param {string} path
 * @param {Record<string, any>} lost
 * @returns {any}
 */
function fill(value, checks, base, path, lost) {
  const out = { ...value };
  for (const [k, ok] of Object.entries(checks)) {
    if (ok(out[k])) continue;
    if (Object.hasOwn(out, k)) lost[path + k] = out[k];
    out[k] = base[k];
  }
  return out;
}

/**
 * A stored child in this code's shape (architecture 3.9), so one bad record never stops the shell:
 * each record filled; a ladder whose level is not a string, or a skill state that is not an object,
 * dropped (a skill state comes back with the next round). What is replaced or dropped is kept, by
 * its path, in one `repair` event, so no progress goes silently and the export still holds it.
 * @param {Record<string, any>} stored
 * @param {{ t: string, day: string }} when the load's time and local day
 * @returns {Child}
 */
export function normaliseChild(stored, when) {
  /** @type {Record<string, any>} */
  const lost = {};
  const c = fill(stored, CHECKS.child, newChild(when.day), '', lost);
  /** @type {(records: Record<string, any>, path: string, keep: (r: any) => boolean, mend: (r: any, path: string) => any) => Record<string, any>} */
  const each = (records, path, keep, mend) => Object.fromEntries(Object.entries(records).flatMap(([id, r]) => {
    if (keep(r)) return [[id, mend(r, `${path}/${id}/`)]];
    lost[`${path}/${id}`] = r;
    return [];
  }));
  c.games = each(c.games, 'games', (l) => map(l) && text(l.level), (l, p) => fill(l, CHECKS.ladder, baseLadder(l.level), p, lost));
  c.skills = each(c.skills, 'skills', map, (s, p) => fill(s, CHECKS.skill, baseSkill(), p, lost));
  if (Object.keys(lost).length) c.events = [...c.events, repair(when, lost)].slice(-CAPS.events);
  return c;
}

/** @type {(storage: Storage | null) => string | null} */
const readRaw = (storage) => { try { return storage.getItem(KEY); } catch { return null; } };
/** @type {(raw: string | null) => any} the parsed value, or the raw text when it does not parse */
const parse = (raw) => { try { return raw === null ? null : JSON.parse(raw); } catch { return raw; } };

/** @type {(data: any) => boolean} a schema newer than this code */
const newer = (data) => Number.isInteger(data?.schema) && data.schema > SCHEMA;
/** @type {(data: any) => boolean} a stored value this code reads: a schema, children, and the current child */
const valid = (data) => map(data) && Number.isInteger(data.schema) && data.schema >= 1 && map(data.children) && map(data.children[data.current]);

/**
 * Parses and upgrades a stored value. A schema newer than this code, whatever its shape: a new
 * value that is never written, so the newer data stays. Missing, unparsable or broken (no current
 * child object): a new value, whose repair event keeps what was stored under `*`, as the first save
 * overwrites it. Then each child is brought to this code's shape (normaliseChild).
 * @param {string | null} raw
 * @param {() => string} newId
 * @param {{ t: string, day: string }} when the load's time and local day
 * @returns {{ data: Stored, writable: boolean }}
 */
export function migrate(raw, newId, when) {
  const data = parse(raw);
  const id = newId();
  const fresh = { schema: SCHEMA, current: id, children: { [id]: newChild(when.day) } };
  if (newer(data)) return { data: fresh, writable: false };
  if (!valid(data)) {
    if (raw) fresh.children[id].events.push(repair(when, { '*': data }));
    return { data: fresh, writable: true };
  }
  // Each new schema adds a step here, e.g. if (data.schema === 1) { ...; data.schema = 2; }
  for (const [cid, c] of Object.entries(data.children)) if (map(c)) data.children[cid] = normaliseChild(c, when);
  return { data, writable: true };
}

/** @type {(storage: Storage | null, newId: () => string, when: { t: string, day: string }) => Store} reads and migrates; never throws */
export const load = (storage, newId, when) => {
  const raw = readRaw(storage);
  return { storage, raw, ...migrate(raw, newId, when) };
};

/**
 * Reads storage again before a write (architecture 3.9): another tab of the site may have written since this one
 * read or wrote, and a save writes the whole store, so it would undo that tab's progress. A stored text other than
 * the last one this tab read or wrote replaces memory (migrated), when this code can read it. A newer schema keeps
 * memory, and the tab writes no more, so the newer data stays (decisions.md 2026-11-01). A failed read, nothing
 * stored, or a broken value keeps memory, and the next save writes it.
 * @param {Store} store
 * @param {() => string} newId
 * @param {{ t: string, day: string }} when
 * @returns {boolean} whether memory was replaced
 */
export function refresh(store, newId, when) {
  const raw = readRaw(store.storage);
  if (raw === null || raw === store.raw) return false;
  const data = parse(raw);
  if (newer(data)) {
    // Not a new child in memory: the open tab keeps its child, levels and demos seen.
    Object.assign(store, { raw, writable: false });
    return false;
  }
  if (!valid(data)) return false;
  Object.assign(store, { raw, ...migrate(raw, newId, when) });
  return true;
}

/** @type {(store: Store) => Child} */
export const childOf = (store) => store.data.children[store.data.current];

/** @type {(list: unknown[], item: unknown, cap: number) => void} adds a record, oldest out past the cap */
export function capped(list, item, cap) {
  list.push(item);
  list.splice(0, Math.max(0, list.length - cap));
}

/** @type {(err: any) => boolean} */
const isQuota = (err) => ['QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED'].includes(err?.name) || err?.code === 22;

/**
 * Writes the store. On a quota error the oldest half of the attempts is set aside and it tries once
 * more; if the retry fails too, nothing was written, so the half comes back: memory never loses what
 * the next save could still write (bug hunt #21).
 * @param {Store} store
 * @returns {boolean} whether it was written
 */
export function save(store) {
  if (!store.writable) return false;
  const write = () => {
    const text = JSON.stringify(store.data);
    store.storage.setItem(KEY, text);
    store.raw = text;
  };
  try {
    write();
    return true;
  } catch (err) {
    if (!isQuota(err)) return false;
  }
  const { attempts } = childOf(store);
  const dropped = attempts.splice(0, Math.ceil(attempts.length / 2));
  try {
    write();
    return true;
  } catch {
    attempts.unshift(...dropped);
    return false;
  }
}

/**
 * The export file (dev-spec A.4): the stored value as is, with the key and the code's schema.
 * @param {Storage | null} storage
 * @param {Date} now
 * @param {boolean | null} persisted
 * @param {string} day the local day of now (planner dayOf), for the file name
 * @returns {{ name: string, text: string }}
 */
export function exportFile(storage, now, persisted, day) {
  const data = parse(readRaw(storage));
  const name = `sifra-${data?.current ?? 'none'}-${day}.json`;
  return { name, text: JSON.stringify({ key: KEY, schema: SCHEMA, exported: now.toISOString(), persisted, data }, null, 2) };
}
