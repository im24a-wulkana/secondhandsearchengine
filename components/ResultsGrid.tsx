'use client';

import { useMemo } from 'react';
import { SearchX } from 'lucide-react';
import type { Item, Filters } from '@/lib/types';
import { normalizeSize } from '@/lib/sizes';
import ItemCard from './ItemCard';

export type SortKey = 'relevance' | 'price-low' | 'price-high' | 'newest';

interface ResultsGridProps {
  items: Item[];
  filters: Filters;
  sortBy?: SortKey;
  isLoading?: boolean;
  favorites?: Record<string, boolean>;
  onFavoriteToggle?: (item: Item) => void;
  onClearFilters?: () => void;
}

const GRID = 'grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4';

export function applyFilters(items: Item[], filters: Filters, sortBy: SortKey): Item[] {
  let result = items;

  if (filters.platforms?.length) {
    result = result.filter((i) => filters.platforms!.includes(i.platform));
  }
  if (filters.minPrice !== undefined) {
    result = result.filter((i) => i.price >= filters.minPrice!);
  }
  if (filters.maxPrice !== undefined) {
    result = result.filter((i) => i.price <= filters.maxPrice!);
  }
  if (filters.size) {
    // Compare normalised values so "US 10", "EU 44", "2XL" and "40 R" all
    // match the corresponding selection.
    const want = normalizeSize(filters.size) ?? filters.size.toUpperCase();
    result = result.filter((i) => normalizeSize(i.size) === want);
  }
  if (filters.condition) {
    const want = filters.condition.toLowerCase();
    result = result.filter((i) => i.condition?.toLowerCase() === want);
  }

  // Copy before sorting so we never mutate the caller's array.
  const sorted = [...result];
  switch (sortBy) {
    case 'price-low':
      sorted.sort((a, b) => a.price - b.price);
      break;
    case 'price-high':
      sorted.sort((a, b) => b.price - a.price);
      break;
    case 'newest':
      sorted.sort((a, b) => {
        // Undated listings sink to the bottom rather than freezing the order.
        const at = a.listed_at ? new Date(a.listed_at).getTime() : -Infinity;
        const bt = b.listed_at ? new Date(b.listed_at).getTime() : -Infinity;
        return bt - at;
      });
      break;
  }
  return sorted;
}

export default function ResultsGrid({
  items,
  filters,
  sortBy = 'relevance',
  isLoading = false,
  favorites = {},
  onFavoriteToggle,
  onClearFilters,
}: ResultsGridProps) {
  const visible = useMemo(() => applyFilters(items, filters, sortBy), [items, filters, sortBy]);

  if (isLoading) {
    return (
      <div className={GRID} aria-busy="true" aria-label="Loading results">
        {Array.from({ length: 12 }).map((_, i) => (
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

  if (visible.length === 0) {
    const filtered = items.length > 0;
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-[var(--r-lg)] border border-dashed border-[var(--hairline)] px-6 py-20 text-center">
        <SearchX size={28} className="text-[var(--text-faint)]" strokeWidth={1.5} />
        <p className="font-display text-lg text-[var(--text)]">
          {filtered ? 'Nothing matches those filters' : 'No listings found'}
        </p>
        <p className="max-w-sm text-sm text-[var(--text-muted)]">
          {filtered
            ? `All ${items.length} results were filtered out. Try widening your price range or clearing a filter.`
            : 'Try a different search term, or check that your platform API keys are configured.'}
        </p>
        {filtered && onClearFilters && (
          <button type="button" onClick={onClearFilters} className="btn btn-secondary mt-1">
            Clear filters
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={GRID}>
      {visible.map((item, i) => (
        <ItemCard
          key={item.id}
          item={item}
          index={i}
          isFavorite={favorites[item.id] ?? false}
          onFavoriteToggle={onFavoriteToggle}
        />
      ))}
    </div>
  );
}
