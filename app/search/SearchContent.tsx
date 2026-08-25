'use client';

import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Filter, SearchX } from 'lucide-react';
import type { Item, Filters, Platform } from '@/lib/types';
import FilterPanel, { countActiveFilters } from '@/components/FilterPanel';
import ResultsGrid, { applyFilters, type SortKey } from '@/components/ResultsGrid';
import SearchBar from '@/components/SearchBar';
import { PLATFORMS } from '@/lib/platforms';
import { recordSearch } from '@/lib/history';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'price-low', label: 'Price: low to high' },
  { value: 'price-high', label: 'Price: high to low' },
  { value: 'newest', label: 'Newest first' },
];

export default function SearchContent() {
  const searchParams = useSearchParams();
  const query = searchParams.get('q') ?? '';

  const [items, setItems] = useState<Item[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(query));
  const [filters, setFilters] = useState<Filters>({});
  const [sortBy, setSortBy] = useState<SortKey>('relevance');
  const [error, setError] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Record<string, boolean>>({});
  // Number of loosely-matching listings the relevance filter removed.
  const [filteredOut, setFilteredOut] = useState(0);
  const [strict, setStrict] = useState(true);

  // Reset refinements when the search term changes. Adjusting state during
  // render (rather than in an effect) avoids a second render pass showing the
  // previous query's filters. See react.dev "You Might Not Need an Effect".
  const [lastQuery, setLastQuery] = useState(query);
  if (lastQuery !== query) {
    setLastQuery(query);
    setFilters({});
    setSortBy('relevance');
    setFilteredOut(0);
    // Clearing the query has no fetch to run, so settle the list here.
    if (!query) {
      setItems([]);
      setError(null);
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }
  }

  useEffect(() => {
    if (!query) return;

    // Abort the in-flight request if the query changes mid-fetch, so a slow
    // earlier response can't overwrite a newer one.
    const controller = new AbortController();

    (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, strict }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Search failed (${response.status})`);
        const data = await response.json();
        const results: Item[] = Array.isArray(data.data) ? data.data : [];
        setItems(results);
        setFilteredOut(typeof data.filtered === 'number' ? data.filtered : 0);
        // Only remember searches that actually found something, so typos and
        // dead ends don't pollute the For You feed.
        if (results.length > 0) recordSearch(query);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setError("We couldn't reach the marketplaces just now. Try again in a moment.");
        setItems([]);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    })();

    return () => controller.abort();
  }, [query, strict]);

  const counts = useMemo(() => {
    const acc: Partial<Record<Platform, number>> = {};
    for (const item of items) acc[item.platform] = (acc[item.platform] ?? 0) + 1;
    return acc;
  }, [items]);

  const visibleCount = useMemo(
    () => applyFilters(items, filters, sortBy).length,
    [items, filters, sortBy],
  );

  const toggleFavorite = useCallback((item: Item) => {
    setFavorites((prev) => ({ ...prev, [item.id]: !prev[item.id] }));
  }, []);

  const activeFilters = countActiveFilters(filters);

  if (!query) {
    return (
      <main id="main" className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
        <SearchX size={30} className="mx-auto text-[var(--text-faint)]" strokeWidth={1.5} />
        <h1 className="mt-4 font-display text-2xl">What are you hunting for?</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Enter a brand, garment, or size to search all seven marketplaces.
        </p>
        <div className="mt-8">
          <SearchBar autoFocus />
        </div>
      </main>
    );
  }

  return (
    <main id="main" className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">
      <div className="mb-8 max-w-2xl">
        <SearchBar initialQuery={query} size="md" />
      </div>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl">
            {query}
          </h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]" aria-live="polite">
            {isLoading ? (
              'Searching seven marketplaces…'
            ) : (
              <>
                <span className="tnum font-medium text-[var(--text)]">{visibleCount}</span>{' '}
                {visibleCount === 1 ? 'listing' : 'listings'}
                {activeFilters > 0 && items.length !== visibleCount && (
                  <span className="text-[var(--text-faint)]"> of {items.length}</span>
                )}
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {(filteredOut > 0 || !strict) && (
            <button
              type="button"
              onClick={() => setStrict((v) => !v)}
              className="btn btn-ghost text-sm"
              title={
                strict
                  ? 'Show listings that only loosely match your search'
                  : 'Hide listings that don’t closely match your search'
              }
            >
              {strict ? (
                <>
                  <Filter size={15} />
                  <span className="tnum">{filteredOut}</span> loose match
                  {filteredOut === 1 ? '' : 'es'} hidden
                </>
              ) : (
                <>
                  <Filter size={15} />
                  Hide loose matches
                </>
              )}
            </button>
          )}
          <label htmlFor="sort" className="sr-only">
            Sort results
          </label>
          <select
            id="sort"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            className="field !w-auto !py-2 text-sm"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
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

      {/* Result-source summary: shows which marketplaces actually returned rows. */}
      {!isLoading && !error && items.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          {Object.entries(counts).map(([id, count]) => (
            <span
              key={id}
              className="inline-flex items-center gap-1.5 rounded-[var(--r-pill)] border border-[var(--hairline)] px-2.5 py-1 text-xs text-[var(--text-muted)]"
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: PLATFORMS[id as Platform].color }}
                aria-hidden="true"
              />
              {PLATFORMS[id as Platform].label}
              <span className="tnum text-[var(--text-faint)]">{count}</span>
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-6 md:flex-row md:gap-8">
        <FilterPanel filters={filters} onFiltersChange={setFilters} counts={counts} />

        <div className="min-w-0 flex-1">
          <ResultsGrid
            items={items}
            filters={filters}
            sortBy={sortBy}
            isLoading={isLoading}
            favorites={favorites}
            onFavoriteToggle={toggleFavorite}
            onClearFilters={() => setFilters({})}
          />
        </div>
      </div>
    </main>
  );
}
