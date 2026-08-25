'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { Clock, X } from 'lucide-react';
import {
  clearHistory,
  getHistorySnapshot,
  getHistoryServerSnapshot,
  removeSearch,
  subscribeHistory,
} from '@/lib/history';

interface SearchHistoryProps {
  /** How many recent searches to show. */
  limit?: number;
  className?: string;
}

export default function SearchHistory({ limit = 8, className = '' }: SearchHistoryProps) {
  // Read through the store so the list updates the moment a search is run,
  // including from another tab.
  const history = useSyncExternalStore(
    subscribeHistory,
    getHistorySnapshot,
    getHistoryServerSnapshot,
  );

  if (history.length === 0) return null;

  const recent = history.slice(0, limit);

  return (
    <div className={className}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="eyebrow inline-flex items-center gap-1.5">
          <Clock size={12} />
          Recent searches
        </span>
        <button
          type="button"
          onClick={() => clearHistory()}
          className="text-xs text-[var(--text-faint)] transition hover:text-[var(--accent)]"
        >
          Clear
        </button>
      </div>

      <ul className="flex flex-wrap gap-2">
        {recent.map((record) => (
          <li key={record.query} className="flex">
            {/* The chip is a link; the dismiss button sits beside it rather
                than inside, so it never nests inside an anchor. */}
            <Link
              href={`/search?q=${encodeURIComponent(record.query)}`}
              className="rounded-l-[var(--r-pill)] border border-r-0 border-[var(--hairline)] py-1 pl-3 pr-2 text-xs text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              {record.query}
            </Link>
            <button
              type="button"
              onClick={() => removeSearch(record.query)}
              aria-label={`Remove ${record.query} from recent searches`}
              className="grid place-items-center rounded-r-[var(--r-pill)] border border-l-0 border-[var(--hairline)] px-1.5 text-[var(--text-faint)] transition hover:border-[var(--danger)] hover:text-[var(--danger)]"
            >
              <X size={12} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
