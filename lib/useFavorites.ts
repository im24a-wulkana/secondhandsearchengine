'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Item } from './types';
import { useSession } from '@/components/SessionProvider';

/**
 * Saved-listing state shared by the search and For You grids.
 *
 * Toggling updates the UI immediately and persists in the background; a failed
 * write rolls the icon back rather than leaving it lying about what's saved.
 * Signed-out visitors get `requiresAuth`, so the caller can prompt instead of
 * silently dropping the click.
 */
export function useFavorites() {
  const { user } = useSession();
  const [favorites, setFavorites] = useState<Record<string, boolean>>({});
  const [requiresAuth, setRequiresAuth] = useState(false);

  // Clear during render on sign-out rather than in an effect, which would
  // cost an extra pass showing the previous user's hearts.
  const userId = user?.id ?? null;
  const [lastUserId, setLastUserId] = useState(userId);
  if (lastUserId !== userId) {
    setLastUserId(userId);
    setFavorites({});
  }

  // Load the existing set once signed in, so hearts survive a reload.
  useEffect(() => {
    if (!user) return;

    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch('/api/favorites', { signal: controller.signal });
        if (!res.ok) return;
        const data = await res.json();
        const saved: Record<string, boolean> = {};
        for (const item of data.data ?? []) saved[item.id] = true;
        setFavorites(saved);
      } catch {
        // Non-fatal: hearts start empty and toggling still works.
      }
    })();

    return () => controller.abort();
  }, [user]);

  const toggleFavorite = useCallback(
    async (item: Item) => {
      if (!user) {
        setRequiresAuth(true);
        return;
      }

      const wasSaved = favorites[item.id] ?? false;
      setFavorites((prev) => ({ ...prev, [item.id]: !wasSaved }));

      try {
        const res = wasSaved
          ? await fetch('/api/favorites', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ itemId: item.id }),
            })
          : await fetch('/api/favorites', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ item }),
            });
        if (!res.ok) throw new Error(String(res.status));
      } catch {
        // Roll back so the icon matches what's actually stored.
        setFavorites((prev) => ({ ...prev, [item.id]: wasSaved }));
      }
    },
    [user, favorites],
  );

  return {
    favorites,
    toggleFavorite,
    requiresAuth,
    dismissAuthPrompt: useCallback(() => setRequiresAuth(false), []),
  };
}
