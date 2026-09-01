'use client';

import { useState } from 'react';
import { AlertTriangle, Loader2, TrendingDown, TrendingUp, X, Scale } from 'lucide-react';
import type { Item, Platform } from '@/lib/types';
import { PLATFORMS, formatPrice } from '@/lib/platforms';

type SoldListing = {
  platform: Platform;
  title: string;
  price: number;
  askingPrice: number | null;
  soldAt: string | null;
  url: string;
};

type Result = {
  sampleSize: number;
  median: number;
  low: number;
  high: number;
  p25: number;
  p75: number;
  byPlatform: Partial<Record<Platform, number>>;
  verdict: 'below' | 'around' | 'above';
  percentDiff: number;
  percentOfAsking: number;
  recent: SoldListing[];
  unavailable: Platform[];
};

const VERDICT = {
  below: {
    label: 'Below the going rate',
    className: 'text-[var(--ok)]',
    Icon: TrendingDown,
  },
  around: {
    label: 'About the going rate',
    className: 'text-[var(--text-muted)]',
    Icon: Scale,
  },
  above: {
    label: 'Above the going rate',
    className: 'text-[var(--warn)]',
    Icon: TrendingUp,
  },
} as const;

export default function PriceComparison({ item }: { item: Item }) {
  const [result, setResult] = useState<Result | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const run = async () => {
    setIsLoading(true);
    setError(null);
    setReason(null);
    setResult(null);
    setOpen(true);
    try {
      const res = await fetch('/api/price-comparison', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: item.title,
          price: item.price,
          currency: item.currency,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? 'The comparison failed.');
        return;
      }
      if (!data.result) {
        setReason(data.reason ?? 'Not enough comparable sales.');
        return;
      }
      setResult(data.result);
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const verdict = result ? VERDICT[result.verdict] : null;

  // eBay and Vinted can never contribute, for structural reasons worth naming.
  // Any other absent platform just returned nothing for this particular query,
  // which is not the same thing and shouldn't be blamed on a restricted API.
  const blocked = (result?.unavailable ?? []).filter((p) => p === 'ebay' || p === 'vinted');
  const empty = (result?.unavailable ?? []).filter((p) => p !== 'ebay' && p !== 'vinted');
  const names = (list: Platform[]) =>
    list.map((p) => PLATFORMS[p].label).join(' and ');
  const missingNote = [
    blocked.length > 0
      ? `${names(blocked)} ${blocked.length === 1 ? 'does' : 'do'} not publish sold prices, so ${blocked.length === 1 ? 'it is' : 'they are'} not in this sample.`
      : '',
    empty.length > 0 ? `${names(empty)} returned no comparable sales for this search.` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <button
        type="button"
        onClick={run}
        disabled={isLoading}
        className="btn btn-secondary w-full text-sm"
      >
        {isLoading ? <Loader2 size={15} className="animate-spin" /> : <Scale size={15} />}
        {isLoading ? 'Checking sold prices…' : 'Compare with sold prices'}
      </button>

      {open && (
        <div className="fixed inset-0 z-[85] flex items-end justify-center sm:items-center sm:p-6">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="price-title"
            className="thin-scroll relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-[var(--r-lg)] border border-[var(--hairline)] bg-[var(--bg)] p-5 shadow-[var(--shadow-lg)] sm:rounded-[var(--r-lg)] sm:p-6"
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full text-[var(--text-muted)] transition hover:bg-[var(--bg-subtle)]"
            >
              <X size={17} />
            </button>

            <h2 id="price-title" className="font-display text-xl">
              Sold prices
            </h2>
            <p className="mt-1 text-xs text-[var(--text-faint)]">
              What comparable items actually sold for, not what sellers are asking.
            </p>

            {isLoading && (
              <div className="mt-6 flex flex-col gap-2">
                <div className="skeleton h-3 w-full" />
                <div className="skeleton h-3 w-3/5" />
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="mt-5 flex items-start gap-2.5 rounded-[var(--r-md)] border border-[var(--danger)] bg-[var(--danger-wash)] px-3.5 py-2.5 text-sm text-[var(--danger)]"
              >
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {reason && !isLoading && (
              <p className="mt-5 rounded-[var(--r-md)] border border-[var(--hairline)] bg-[var(--bg-subtle)] px-3.5 py-3 text-sm text-[var(--text-muted)]">
                {reason} This is common for one-off vintage pieces, where no true comparable
                exists.
              </p>
            )}

            {result && verdict && !isLoading && (
              <div className="mt-5 flex flex-col gap-5">
                <div>
                  <span
                    className={`flex items-center gap-2 font-display text-lg ${verdict.className}`}
                  >
                    <verdict.Icon size={18} />
                    {verdict.label}
                  </span>
                  <p className="mt-1.5 text-sm text-[var(--text-muted)]">
                    This listing is{' '}
                    <strong className="tnum text-[var(--text)]">
                      {formatPrice(item.price, item.currency)}
                    </strong>
                    , while comparable items sold for a median of{' '}
                    <strong className="tnum text-[var(--text)]">
                      {formatPrice(result.median, 'USD')}
                    </strong>
                    {result.percentOfAsking === 0 ? (
                      ' — the same.'
                    ) : (
                      <>
                        {' — '}
                        {Math.abs(result.percentOfAsking)}%{' '}
                        {result.percentOfAsking > 0 ? 'less' : 'more'} than the asking price.
                      </>
                    )}
                  </p>
                </div>

                <div className="rounded-[var(--r-md)] border border-[var(--hairline)] p-4">
                  <h3 className="eyebrow mb-3">Typical range</h3>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="tnum text-[var(--text-muted)]">
                      {formatPrice(result.p25, 'USD')}
                    </span>
                    <span className="tnum font-semibold text-[var(--accent)]">
                      {formatPrice(result.median, 'USD')}
                    </span>
                    <span className="tnum text-[var(--text-muted)]">
                      {formatPrice(result.p75, 'USD')}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-[var(--text-faint)]">
                    Half of sales fell in this band. Full spread{' '}
                    <span className="tnum">
                      {formatPrice(result.low, 'USD')}–{formatPrice(result.high, 'USD')}
                    </span>
                    .
                  </p>
                </div>

                <div>
                  <h3 className="eyebrow mb-2">
                    Based on <span className="tnum">{result.sampleSize}</span> sales
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(result.byPlatform).map(([id, count]) => (
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
                </div>

                {result.recent.length > 0 && (
                  <div>
                    <h3 className="eyebrow mb-2">Recent sales</h3>
                    <ul className="flex flex-col gap-1.5">
                      {result.recent.map((sale, i) => (
                        <li key={i} className="flex items-baseline justify-between gap-3 text-sm">
                          <a
                            href={sale.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="clamp-2 min-w-0 flex-1 text-[var(--text-muted)] hover:text-[var(--accent)]"
                          >
                            {sale.title || 'Untitled'}
                          </a>
                          <span className="tnum shrink-0 text-[var(--text)]">
                            {formatPrice(sale.price, 'USD')}
                            {sale.askingPrice && (
                              <span className="ml-1 text-xs text-[var(--text-faint)] line-through">
                                {formatPrice(sale.askingPrice, 'USD')}
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <p className="border-t border-[var(--hairline)] pt-3 text-xs text-[var(--text-faint)]">
                  {missingNote && <>{missingNote} </>}
                  Comparables are matched on title, so condition and exact variant may differ.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
