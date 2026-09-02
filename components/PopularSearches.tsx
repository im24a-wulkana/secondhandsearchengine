'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

/**
 * Most-searched terms on this site. The API falls back to a curated list
 * until enough real searches exist, so this never renders empty.
 */
export default function PopularSearches({ initial }: { initial: string[] }) {
  const [terms, setTerms] = useState(initial);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch('/api/popular', { signal: controller.signal });
        const data = await res.json();
        if (Array.isArray(data?.terms) && data.terms.length > 0) setTerms(data.terms);
      } catch {
        // Keep the server-rendered list on failure.
      }
    })();
    return () => controller.abort();
  }, []);

  if (terms.length === 0) return null;

  return (
    <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
      <span className="text-xs text-[var(--text-faint)]">Popular:</span>
      {terms.map((term) => (
        <Link
          key={term}
          href={`/search?q=${encodeURIComponent(term)}`}
          className="inline-flex items-center rounded-[var(--r-pill)] border border-[var(--hairline)] px-3 py-2 text-xs sm:py-1 text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
        >
          {term}
        </Link>
      ))}
    </div>
  );
}
