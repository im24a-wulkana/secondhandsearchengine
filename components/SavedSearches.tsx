'use client';

import { useEffect, useRef, useState } from 'react';
import { Bookmark, ChevronDown } from 'lucide-react';
import type { Filters } from '@/lib/types';

export interface SavedSearch {
  id: string;
  name: string;
  query: string;
  filters?: Filters;
}

interface SavedSearchesProps {
  searches: SavedSearch[];
  onSelect?: (search: SavedSearch) => void;
}

export default function SavedSearches({ searches, onSelect }: SavedSearchesProps) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape, so the menu never gets stranded open.
  useEffect(() => {
    if (!isOpen) return;

    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setIsOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  if (searches.length === 0) return null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className="btn btn-secondary text-sm"
      >
        <Bookmark size={16} />
        Saved searches
        <ChevronDown
          size={15}
          className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <div
          role="menu"
          className="thin-scroll absolute right-0 top-full z-40 mt-2 max-h-72 w-64 overflow-y-auto rounded-[var(--r-md)] border border-[var(--hairline)] bg-[var(--surface)] py-1 shadow-[var(--shadow-lg)]"
        >
          {searches.map((search) => (
            <button
              key={search.id}
              type="button"
              role="menuitem"
              onClick={() => {
                onSelect?.(search);
                setIsOpen(false);
              }}
              className="block w-full px-3.5 py-2.5 text-left transition hover:bg-[var(--bg-subtle)]"
            >
              <span className="block text-sm font-medium text-[var(--text)]">{search.name}</span>
              <span className="block truncate text-xs text-[var(--text-faint)]">
                {search.query}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
