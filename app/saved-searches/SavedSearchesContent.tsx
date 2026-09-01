'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Bookmark, RefreshCw, Trash2 } from 'lucide-react';
import type { Filters } from '@/lib/types';
import { countActiveFilters } from '@/components/FilterPanel';

type SavedSearch = {
  id: string;
  name: string;
  query: string;
  filters: Filters;
  newCount: number;
  totalAtLastCheck: number;
  lastCheckedAt: string | null;
};

function relativeTime(iso: string | null): string {
  if (!iso) return 'never';
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function SavedSearchesContent() {
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch('/api/saved-searches', { signal });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setSearches(Array.isArray(data.data) ? data.data : []);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setError('We couldn’t load your saved searches.');
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    // Every setState inside load() runs after an await, so none of them
    // executes synchronously within this effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const checkAll = async () => {
    setIsChecking(true);
    setNote(null);
    setError(null);
    try {
      const res = await fetch('/api/saved-searches/check', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'failed');

      const found = (data.results ?? []).reduce(
        (sum: number, r: { newCount: number }) => sum + r.newCount,
        0,
      );
      setNote(
        found > 0
          ? `${found} new listing${found === 1 ? '' : 's'} across ${data.checked} search${data.checked === 1 ? '' : 'es'}.`
          : `Checked ${data.checked} search${data.checked === 1 ? '' : 'es'} — nothing new.`,
      );
      await load();
    } catch {
      setError('Could not check for new listings. Try again.');
    } finally {
      setIsChecking(false);
    }
  };

  /** Clears the badge without a full re-check, since the user is about to look. */
  const remove = async (id: string) => {
    const previous = searches;
    setSearches((s) => s.filter((x) => x.id !== id));
    try {
      const res = await fetch('/api/saved-searches', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      setSearches(previous);
      setError('That search couldn’t be removed.');
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading saved searches">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card flex flex-col gap-2 p-4">
            <div className="skeleton h-4 w-1/3" />
            <div className="skeleton h-3 w-1/4" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      {error && (
        <div
          role="alert"
          className="mb-5 flex items-start gap-3 rounded-[var(--r-md)] border border-[var(--danger)] bg-[var(--danger-wash)] px-4 py-3 text-sm text-[var(--danger)]"
        >
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {searches.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={checkAll}
            disabled={isChecking}
            className="btn btn-secondary text-sm"
          >
            <RefreshCw size={15} className={isChecking ? 'animate-spin' : ''} />
            {isChecking ? 'Checking…' : 'Check for new listings'}
          </button>
          {note && (
            <span className="text-xs text-[var(--text-muted)]" role="status">
              {note}
            </span>
          )}
        </div>
      )}

      {searches.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-[var(--r-lg)] border border-dashed border-[var(--hairline)] px-6 py-20 text-center">
          <Bookmark size={28} className="text-[var(--text-faint)]" strokeWidth={1.5} />
          <p className="font-display text-lg">No saved searches yet</p>
          <p className="max-w-sm text-sm text-[var(--text-muted)]">
            Run a search, then hit <strong className="text-[var(--text)]">Save search</strong> to
            keep an eye on it. We’ll count what’s appeared since you last looked.
          </p>
          <Link href="/" className="btn btn-primary mt-2">
            Start searching
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {searches.map((s) => {
            const activeFilters = countActiveFilters(s.filters);
            const params = new URLSearchParams({ q: s.query });
            return (
              <li key={s.id} className="card flex items-center gap-4 p-4">
                <Link href={`/search?${params}`} className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-base text-[var(--text)]">{s.name}</span>
                    {s.newCount > 0 && (
                      <span className="tnum rounded-[var(--r-pill)] bg-[var(--accent)] px-2 py-0.5 text-xs font-semibold text-[var(--accent-contrast)]">
                        {s.newCount} new
                      </span>
                    )}
                  </span>
                  <span className="mt-1 block text-xs text-[var(--text-faint)]">
                    <span className="tnum">{s.totalAtLastCheck}</span> listings
                    {activeFilters > 0 && ` · ${activeFilters} filter${activeFilters === 1 ? '' : 's'}`}
                    {' · checked '}
                    {relativeTime(s.lastCheckedAt)}
                  </span>
                </Link>

                <button
                  type="button"
                  onClick={() => remove(s.id)}
                  aria-label={`Remove saved search ${s.name}`}
                  className="btn btn-ghost !p-2 text-[var(--text-faint)] hover:text-[var(--danger)]"
                >
                  <Trash2 size={16} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
