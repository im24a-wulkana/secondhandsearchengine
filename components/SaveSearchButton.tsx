'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { BookmarkPlus, Check, Loader2 } from 'lucide-react';
import type { Filters, Item } from '@/lib/types';
import { useSession } from './SessionProvider';

interface SaveSearchButtonProps {
  query: string;
  filters: Filters;
  /** The listings currently on screen — they become the "already seen" baseline. */
  items: Item[];
}

export default function SaveSearchButton({ query, filters, items }: SaveSearchButtonProps) {
  const { user, isLoading: sessionLoading } = useSession();
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);

  // A new query is a different thing to save, so drop the saved state.
  const [lastQuery, setLastQuery] = useState(query);
  if (lastQuery !== query) {
    setLastQuery(query);
    setState('idle');
    setError(null);
  }

  // Reflect whether this query is already saved, so the button doesn't
  // invite a duplicate.
  useEffect(() => {
    if (!user || !query) return;
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch('/api/saved-searches', { signal: controller.signal });
        if (!res.ok) return;
        const data = await res.json();
        const exists = (data.data ?? []).some(
          (s: { query: string }) => s.query.toLowerCase() === query.toLowerCase(),
        );
        if (exists) setState('saved');
      } catch {
        // Non-fatal: the button just shows as unsaved.
      }
    })();

    return () => controller.abort();
  }, [user, query]);

  const save = async () => {
    setState('saving');
    setError(null);
    try {
      const res = await fetch('/api/saved-searches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          filters,
          // Everything visible now counts as seen, so the first check only
          // reports listings that appeared afterwards.
          itemIds: items.map((i) => i.id),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? 'Could not save that search.');
        setState('idle');
        return;
      }
      setState('saved');
    } catch {
      setError('Could not reach the server.');
      setState('idle');
    }
  };

  if (sessionLoading || !query) return null;

  if (!user) {
    return (
      <Link href="/login" className="btn btn-ghost shrink-0 whitespace-nowrap text-sm" title="Sign in to save this search">
        <BookmarkPlus size={15} />
        Save search
      </Link>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      <button
        type="button"
        onClick={save}
        disabled={state !== 'idle'}
        className="btn btn-ghost shrink-0 whitespace-nowrap text-sm"
        title={state === 'saved' ? 'Already in your saved searches' : 'Save this search'}
      >
        {state === 'saving' ? (
          <Loader2 size={15} className="animate-spin" />
        ) : state === 'saved' ? (
          <Check size={15} className="text-[var(--ok)]" />
        ) : (
          <BookmarkPlus size={15} />
        )}
        {state === 'saved' ? 'Saved' : 'Save search'}
      </button>
      {error && <span className="text-xs text-[var(--danger)]">{error}</span>}
    </div>
  );
}
