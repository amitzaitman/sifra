// Storage (architecture 3.9, pedagogy 5.11): one key with a schema number. The storage object
// comes from start(); every access is in try/catch, and when it fails the shell plays from memory.

export const KEY = 'sifra';
export const SCHEMA = 1;
export const CAPS = { attempts: 4000, events: 500 };

/** @type {(day: string) => Child} */
export const newChild = (day) => ({ created: day, sessions: 0, games: {}, skills: {}, attempts: [], events: [] });

/** @type {(storage: Storage | null) => string | null} */
const readRaw = (storage) => { try { return storage.getItem(KEY); } catch { return null; } };
/** @type {(raw: string | null) => any} the parsed value, or the raw text when it does not parse */
const parse = (raw) => { try { return raw === null ? null : JSON.parse(raw); } catch { return raw; } };

/**
 * Parses and upgrades a stored value. A schema newer than this code, whatever its shape: a new
 * value that is never written, so the newer data stays. Missing, unparsable or broken: a new value.
 * @param {string | null} raw
 * @param {() => string} newId
 * @param {string} day
 * @returns {{ data: Stored, writable: boolean }}
 */
export function migrate(raw, newId, day) {
  const data = parse(raw);
  const id = newId();
  const fresh = { schema: SCHEMA, current: id, children: { [id]: newChild(day) } };
  if (Number.isInteger(data?.schema) && data.schema > SCHEMA) return { data: fresh, writable: false };
  const valid = data && typeof data === 'object' && Number.isInteger(data.schema) && data.schema >= 1;
  if (!valid || !data.children?.[data.current]) return { data: fresh, writable: true };
  // Each new schema adds a step here, e.g. if (data.schema === 1) { ...; data.schema = 2; }
  return { data, writable: true };
}

/** @type {(storage: Storage | null, newId: () => string, day: string) => Store} reads and migrates; never throws */
export const load = (storage, newId, day) => ({ storage, ...migrate(readRaw(storage), newId, day) });

/** @type {(store: Store) => Child} */
export const childOf = (store) => store.data.children[store.data.current];

/** @type {(list: unknown[], item: unknown, cap: number) => void} adds a record, oldest out past the cap */
export function capped(list, item, cap) {
  list.push(item);
  list.splice(0, Math.max(0, list.length - cap));
}

/**
 * Writes the store. On a quota error the oldest half of the attempts goes and it tries once more.
 * @param {Store} store
 * @returns {boolean} whether it was written
 */
export function save(store) {
  for (let tries = 0; store.writable && tries < 2; tries++) {
    try {
      store.storage.setItem(KEY, JSON.stringify(store.data));
      return true;
    } catch (err) {
      if (!['QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED'].includes(err?.name) && err?.code !== 22) return false;
      childOf(store).attempts.splice(0, Math.ceil(childOf(store).attempts.length / 2));
    }
  }
  return false;
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
