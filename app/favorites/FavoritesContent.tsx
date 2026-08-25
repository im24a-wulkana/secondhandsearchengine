'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Heart } from 'lucide-react';
import type { Item } from '@/lib/types';
import ItemCard from '@/components/ItemCard';
import ListingDetail from '@/components/ListingDetail';

export default function FavoritesContent() {
  const [items, setItems] = useState<Item[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openItem, setOpenItem] = useState<Item | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch('/api/favorites', { signal: controller.signal });
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        setItems(Array.isArray(data.data) ? data.data : []);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setError('We couldn’t load your saved listings. Try refreshing.');
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    })();

    return () => controller.abort();
  }, []);

  /** Unsaving removes the card immediately, then persists. */
  const removeFavorite = useCallback(async (item: Item) => {
    const previous = items;
    setItems((current) => current.filter((i) => i.id !== item.id));
    setOpenItem(null);

    try {
      const res = await fetch('/api/favorites', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: item.id }),
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      // Put it back rather than leaving the UI lying about what's saved.
      setItems(previous);
      setError('That listing couldn’t be removed. Try again.');
    }
  }, [items]);

  if (isLoading) {
    return (
      <div
        className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4"
        aria-busy="true"
        aria-label="Loading saved listings"
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

  return (
    <>
      {error && (
        <div
          role="alert"
          className="mb-6 flex items-start gap-3 rounded-[var(--r-md)] border border-[var(--danger)] bg-[var(--danger-wash)] px-4 py-3 text-sm text-[var(--danger)]"
        >
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-[var(--r-lg)] border border-dashed border-[var(--hairline)] px-6 py-20 text-center">
          <Heart size={28} className="text-[var(--text-faint)]" strokeWidth={1.5} />
          <p className="font-display text-lg">Nothing saved yet</p>
          <p className="max-w-sm text-sm text-[var(--text-muted)]">
            Tap the heart on any listing to keep it here.
          </p>
          <Link href="/search" className="btn btn-primary mt-2">
            Browse listings
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
          {items.map((item, i) => (
            <ItemCard
              key={item.id}
              item={item}
              index={i}
              isFavorite
              onFavoriteToggle={removeFavorite}
              onOpen={setOpenItem}
            />
          ))}
        </div>
      )}

      <ListingDetail
        item={openItem}
        onClose={() => setOpenItem(null)}
        isFavorite
        onFavoriteToggle={removeFavorite}
      />
    </>
  );
}
