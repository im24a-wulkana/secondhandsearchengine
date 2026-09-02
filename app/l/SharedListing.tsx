'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, LinkIcon, SearchX } from 'lucide-react';
import type { Item } from '@/lib/types';
import { decodeListing } from '@/lib/share';
import ListingDetail from '@/components/ListingDetail';
import SearchBar from '@/components/SearchBar';
import { useFavorites } from '@/lib/useFavorites';

/**
 * Renders a listing someone was sent. The payload lives in the URL fragment,
 * which is never sent to the server, so decoding necessarily happens here after
 * mount rather than during the server render.
 */
export default function SharedListing() {
  const [item, setItem] = useState<Item | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'invalid'>('loading');
  const { favorites, toggleFavorite } = useFavorites();

  useEffect(() => {
    const read = () => {
      const token = window.location.hash.replace(/^#/, '');
      if (!token) {
        setState('invalid');
        return;
      }
      const decoded = decodeListing(token);
      setItem(decoded);
      setState(decoded ? 'ready' : 'invalid');
    };

    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);

  if (state === 'loading') {
    return (
      <main id="main" className="mx-auto max-w-md px-4 py-24">
        <div className="skeleton mx-auto h-4 w-40" />
      </main>
    );
  }

  if (state === 'invalid' || !item) {
    return (
      <main id="main" className="mx-auto max-w-md px-4 py-24 text-center sm:px-6">
        <SearchX size={30} className="mx-auto text-[var(--text-faint)]" strokeWidth={1.5} />
        <h1 className="mt-4 font-display text-2xl">That link didn’t open</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          It may have been cut short when it was sent — shared listing links are long, and some
          apps trim them. Ask for the link again, or search for the piece yourself.
        </p>
        <div className="mt-8">
          <SearchBar />
        </div>
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] transition hover:text-[var(--accent)]"
        >
          <ArrowLeft size={15} />
          Back to home
        </Link>
      </main>
    );
  }

  return (
    <main id="main" className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6 sm:py-8">
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] transition hover:text-[var(--accent)]"
      >
        <ArrowLeft size={15} />
        Back to OneRail
      </Link>

      <p className="mb-4 inline-flex items-center gap-2 rounded-[var(--r-pill)] border border-[var(--hairline)] bg-[var(--bg-subtle)] px-3 py-1.5 text-xs text-[var(--text-muted)]">
        <LinkIcon size={13} />
        Shared listing — details are from when the link was created.
      </p>

      {/* The detail view is the modal, shown inline: closing it should leave
          the visitor somewhere useful rather than a blank page. */}
      <ListingDetail
        item={item}
        onClose={() => {
          window.location.href = '/';
        }}
        isFavorite={favorites[item.id] ?? false}
        onFavoriteToggle={toggleFavorite}
      />
    </main>
  );
}
