'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';

interface SearchBarProps {
  /** Prefills the input, e.g. on the results page. */
  initialQuery?: string;
  size?: 'lg' | 'md';
  autoFocus?: boolean;
}

export default function SearchBar({
  initialQuery = '',
  size = 'lg',
  autoFocus = false,
}: SearchBarProps) {
  const [query, setQuery] = useState(initialQuery);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed) router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  };

  const large = size === 'lg';

  return (
    <form onSubmit={handleSubmit} role="search" className="w-full">
      <div className="flex items-center gap-2 rounded-[var(--r-lg)] border border-[var(--hairline)] bg-[var(--surface)] p-1.5 shadow-[var(--shadow-sm)] transition focus-within:border-[var(--accent)] focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_18%,transparent)]">
        <Search
          size={large ? 20 : 18}
          className="ml-2 shrink-0 text-[var(--text-faint)]"
          aria-hidden="true"
        />

        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus={autoFocus}
          aria-label="Search secondhand listings"
          placeholder="Try “Carhartt detroit jacket” or “Rick Owens size 48”"
          /* The wrapper renders the focus ring, so suppress the input's own. */
          className={`min-w-0 flex-1 bg-transparent text-[var(--text)] outline-none focus-visible:outline-none placeholder:text-[var(--text-faint)] [&::-webkit-search-cancel-button]:hidden ${
            large ? 'py-2.5 text-base' : 'py-1.5 text-sm'
          }`}
        />

        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            className="btn btn-ghost !p-1.5"
            aria-label="Clear search"
          >
            <X size={16} />
          </button>
        )}

        <button type="submit" className={`btn btn-primary ${large ? '' : '!py-1.5 !px-3 text-sm'}`}>
          Search
        </button>
      </div>
    </form>
  );
}
