/**
 * Recent-search history, stored per browser.
 *
 * Stored per browser rather than per account, so it works signed out and
 * needs no round trip to render. Every read is defensive: private mode,
 * cleared storage, and hand-edited values all degrade to "no history".
 */

const KEY = 'thrifthound:searches';
const MAX_ENTRIES = 40;

export type SearchRecord = {
  query: string;
  /** Epoch ms of the most recent time this query was run. */
  at: number;
  /** How many times it has been searched. */
  count: number;
};

function isRecord(value: unknown): value is SearchRecord {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Partial<SearchRecord>;
  return (
    typeof r.query === 'string' &&
    r.query.trim().length > 0 &&
    typeof r.at === 'number' &&
    Number.isFinite(r.at) &&
    typeof r.count === 'number' &&
    Number.isFinite(r.count)
  );
}

/**
 * Subscription plumbing so components can read history through
 * useSyncExternalStore instead of a setState-in-effect round trip.
 */
const listeners = new Set<() => void>();
let snapshot: string | null = null;
let cached: SearchRecord[] = [];

export function subscribeHistory(onChange: () => void): () => void {
  listeners.add(onChange);
  // Another tab writing to localStorage should update this one too.
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY || e.key === null) onChange();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onStorage);
  };
}

/**
 * Returns a referentially stable array unless the stored value actually
 * changed — useSyncExternalStore loops forever on a fresh array each call.
 */
export function getHistorySnapshot(): SearchRecord[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    raw = null;
  }
  if (raw !== snapshot) {
    snapshot = raw;
    cached = readHistory();
  }
  return cached;
}

/** The server has no localStorage; an empty history is the safe render. */
export const getHistoryServerSnapshot = (): SearchRecord[] => EMPTY;
const EMPTY: SearchRecord[] = [];

function notify() {
  for (const listener of listeners) listener();
}

export function readHistory(): SearchRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecord).sort((a, b) => b.at - a.at);
  } catch {
    return [];
  }
}

/** Records a search, merging repeats into a single entry with a bumped count. */
export function recordSearch(query: string): SearchRecord[] {
  const trimmed = query.trim();
  if (typeof window === 'undefined' || !trimmed) return [];

  const normalized = trimmed.toLowerCase();
  const existing = readHistory();
  const previous = existing.find((r) => r.query.toLowerCase() === normalized);

  const next: SearchRecord[] = [
    {
      query: trimmed,
      at: Date.now(),
      count: (previous?.count ?? 0) + 1,
    },
    ...existing.filter((r) => r.query.toLowerCase() !== normalized),
  ].slice(0, MAX_ENTRIES);

  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked — the in-memory result is still correct.
  }
  notify();
  return next;
}

/** Drops a single remembered query, matched case-insensitively. */
export function removeSearch(query: string): void {
  if (typeof window === 'undefined') return;
  const normalized = query.trim().toLowerCase();
  const next = readHistory().filter((r) => r.query.toLowerCase() !== normalized);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Blocked storage — nothing to persist, but still notify subscribers.
  }
  notify();
}

export function clearHistory(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing to do; the caller re-reads and gets [].
  }
  notify();
}
