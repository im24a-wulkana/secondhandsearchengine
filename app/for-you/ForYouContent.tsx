'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { AlertTriangle, RefreshCw, Sparkles, Trash2 } from 'lucide-react';
import type { Item } from '@/lib/types';
import {
  clearHistory,
  getHistorySnapshot,
  getHistoryServerSnapshot,
  subscribeHistory,
} from '@/lib/history';
import ItemCard from '@/components/ItemCard';

export default function ForYouContent() {
  // Reading through the store keeps React in sync with localStorage without
  // a setState-in-effect hop, and picks up writes from other tabs.
  const history = useSyncExternalStore(
    subscribeHistory,
    getHistorySnapshot,
    getHistoryServerSnapshot,
  );

  const [items, setItems] = useState<Item[]>([]);
  const [interests, setInterests] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Record<string, boolean>>({});
  const [reloadKey, setReloadKey] = useState(0);

  const toggleFavorite = useCallback((item: Item) => {
    setFavorites((prev) => ({ ...prev, [item.id]: !prev[item.id] }));
  }, []);

  // Refetch when the set of remembered queries changes, or on manual refresh.
  const historyKey = history.map((r) => `${r.query}:${r.count}`).join('|');

  useEffect(() => {
    if (history.length === 0) return;

    const controller = new AbortController();

    (async () => {
      // Set inside the async body rather than the effect body so the loading
      // flag doesn't trigger a synchronous cascading render.
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/recommendations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ history }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(String(response.status));
        const data = await response.json();
        setItems(Array.isArray(data.data) ? data.data : []);
        setInterests(Array.isArray(data.interests) ? data.interests : []);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setError('We couldn’t build your feed just now. Try refreshing.');
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    })();

    return () => controller.abort();
    // `history` is intentionally tracked via historyKey, which ignores the
    // timestamp churn that would otherwise refetch on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyKey, reloadKey]);

  const onClear = () => {
    clearHistory();
    setItems([]);
    setInterests([]);
    setError(null);
  };

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-[var(--r-lg)] border border-dashed border-[var(--hairline)] px-6 py-20 text-center">
        <Sparkles size={28} className="text-[var(--text-faint)]" strokeWidth={1.5} />
        <p className="font-display text-lg">Your feed builds itself</p>
        <p className="max-w-sm text-sm text-[var(--text-muted)]">
          Search for a few things you like. We’ll use what you look for to surface
          listings worth a second look — no account needed.
        </p>
        <Link href="/" className="btn btn-primary mt-2">
          Start searching
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[var(--text-faint)]">Based on:</span>
          {interests.map((term) => (
            <Link
              key={term}
              href={`/search?q=${encodeURIComponent(term)}`}
              className="rounded-[var(--r-pill)] border border-[var(--hairline)] px-3 py-1 text-xs text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              {term}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            disabled={isLoading}
            className="btn btn-secondary text-sm"
          >
            <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button type="button" onClick={onClear} className="btn btn-ghost text-sm">
            <Trash2 size={15} />
            Clear history
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-6 flex items-start gap-3 rounded-[var(--r-md)] border border-[var(--danger)] bg-[var(--danger-wash)] px-4 py-3 text-sm text-[var(--danger)]"
        >
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {isLoading ? (
        <FeedSkeleton />
      ) : items.length === 0 && !error ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-[var(--r-lg)] border border-dashed border-[var(--hairline)] px-6 py-20 text-center">
          <Sparkles size={28} className="text-[var(--text-faint)]" strokeWidth={1.5} />
          <p className="font-display text-lg">Nothing to show yet</p>
          <p className="max-w-sm text-sm text-[var(--text-muted)]">
            Your recent searches didn’t turn up any live listings. Try searching for
            something else.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
          {items.map((item, i) => (
            <ItemCard
              key={item.id}
              item={item}
              index={i}
              isFavorite={favorites[item.id] ?? false}
              onFavoriteToggle={toggleFavorite}
            />
          ))}
        </div>
      )}
    </>
  );
}

function FeedSkeleton() {
  return (
    <div
      className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4"
      aria-busy="true"
      aria-label="Loading your feed"
    >
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="card overflow-hidden">
          <div className="skeleton aspect-square !rounded-none" />
          <div className="flex flex-col gap-2 p-3">
            <div className="skeleton h-3 w-full" />
            <div className="skeleton h-3 w-2/3" />
            <div className="skeleton mt-1 h-4 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}
