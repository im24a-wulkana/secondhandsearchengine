'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Globe, Loader2, ShieldQuestion, X } from 'lucide-react';
import Link from 'next/link';
import type { Item } from '@/lib/types';
import { useSession } from './SessionProvider';

type Concern = { area: string; observation: string; severity: 'low' | 'medium' | 'high' };
type Positive = { area: string; observation: string };
type Result = {
  summary: string;
  photoQuality: 'sufficient' | 'limited' | 'insufficient';
  concerns: Concern[];
  positives: Positive[];
  checkBeforeBuying: string[];
};

const SEVERITY_STYLE: Record<Concern['severity'], string> = {
  high: 'border-[var(--danger)] text-[var(--danger)]',
  medium: 'border-[var(--warn)] text-[var(--warn)]',
  low: 'border-[var(--hairline-strong)] text-[var(--text-muted)]',
};

export default function AuthenticityCheck({
  item,
  images,
  imagesLoading = false,
}: {
  item: Item;
  /**
   * The photos actually on screen. Grailed and Mercari return one thumbnail in
   * search and fetch the rest on open, so `item.images` alone would send a
   * single cover shot even once the full gallery is visible.
   */
  images?: string[];
  /** True while the on-demand gallery is still being fetched. */
  imagesLoading?: boolean;
}) {
  const { user, isLoading: sessionLoading } = useSession();
  const [result, setResult] = useState<Result | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [deep, setDeep] = useState(false);

  const run = async (deepResearch = false) => {
    setIsLoading(true);
    setError(null);
    setOpen(true);
    setDeep(deepResearch);
    try {
      const res = await fetch('/api/authenticate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: item.title,
          brand: item.brand,
          price: item.price,
          currency: item.currency,
          platform: item.platform,
          description: item.description,
          images:
            images?.length
              ? images
              : item.images?.length
                ? item.images
                : [item.image_url],
          deepResearch,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? 'The check failed.');
        return;
      }
      setResult(data.result);
      setRemaining(typeof data.remaining === 'number' ? data.remaining : null);
      setDeep(Boolean(data.deepResearch));
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Nothing until the session check settles, so the control doesn't flicker.
  if (sessionLoading) return null;

  if (!user) {
    return (
      <Link href="/login" className="btn btn-secondary w-full text-sm">
        <ShieldQuestion size={15} />
        Sign in to check for counterfeit signs
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => run(false)}
        disabled={isLoading || imagesLoading}
        className="btn btn-secondary w-full text-sm"
        title={imagesLoading ? 'Waiting for the full photo set…' : undefined}
      >
        {isLoading || imagesLoading ? (
          <Loader2 size={15} className="animate-spin" />
        ) : (
          <ShieldQuestion size={15} />
        )}
        {isLoading
          ? 'Checking photos…'
          : imagesLoading
            ? 'Loading photos…'
            : 'Check for counterfeit signs'}
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
            aria-labelledby="auth-title"
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

            <h2 id="auth-title" className="font-display text-xl">
              Counterfeit signs
            </h2>
            <p className="mt-1 text-xs text-[var(--text-faint)]">
              Not an authentication service — a review of what these photos show.
            </p>

            {isLoading && (
              <div className="mt-6 flex flex-col gap-2">
                <div className="skeleton h-3 w-full" />
                <div className="skeleton h-3 w-4/5" />
                <div className="skeleton h-3 w-2/3" />
                <p className="mt-2 text-xs text-[var(--text-faint)]">
                  {deep
                    ? 'Researching brand markers — this takes a couple of minutes…'
                    : 'Reading tags, stitching and hardware…'}
                </p>
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

            {result && !isLoading && (
              <div className="mt-5 flex flex-col gap-5">
                <p className="text-sm leading-relaxed text-[var(--text-muted)]">{result.summary}</p>

                {result.photoQuality !== 'sufficient' && (
                  <p className="rounded-[var(--r-md)] border border-[var(--hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-muted)]">
                    {result.photoQuality === 'insufficient'
                      ? 'These photos do not show enough to judge much. Ask the seller for tag and stitching close-ups.'
                      : 'Photo coverage is limited, so this is a partial view only.'}
                  </p>
                )}

                {result.concerns.length > 0 && (
                  <section>
                    <h3 className="eyebrow mb-2">Concerns</h3>
                    <ul className="flex flex-col gap-2">
                      {result.concerns.map((c, i) => (
                        <li
                          key={i}
                          className={`rounded-[var(--r-md)] border-l-2 bg-[var(--surface)] px-3 py-2 ${SEVERITY_STYLE[c.severity]}`}
                        >
                          <span className="text-xs font-semibold uppercase tracking-wide">
                            {c.area} · {c.severity}
                          </span>
                          <p className="mt-1 text-sm text-[var(--text)]">{c.observation}</p>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {result.positives.length > 0 && (
                  <section>
                    <h3 className="eyebrow mb-2">Looks consistent</h3>
                    <ul className="flex flex-col gap-1.5">
                      {result.positives.map((p, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-[var(--ok)]" />
                          <span className="text-[var(--text-muted)]">
                            <strong className="text-[var(--text)]">{p.area}:</strong>{' '}
                            {p.observation}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {result.checkBeforeBuying.length > 0 && (
                  <section>
                    <h3 className="eyebrow mb-2">Before you buy</h3>
                    <ul className="ml-4 list-disc text-sm text-[var(--text-muted)]">
                      {result.checkBeforeBuying.map((c, i) => (
                        <li key={i} className="mt-1">
                          {c}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {!deep && (
                  <button
                    type="button"
                    onClick={() => {
                      setDeep(true);
                      run(true);
                    }}
                    className="btn btn-ghost w-full text-sm"
                  >
                    <Globe size={15} />
                    Research this brand too (slower, ~2 min)
                  </button>
                )}

                {remaining !== null && (
                  <p className="text-xs text-[var(--text-faint)]">
                    {remaining} check{remaining === 1 ? '' : 's'} left today.
                  </p>
                )}

                <p className="border-t border-[var(--hairline)] pt-3 text-xs text-[var(--text-faint)]">
                  This is an automated read of listing photos, not authentication. It cannot see
                  stitch density, hardware weight or material feel. For anything expensive, use a
                  professional authentication service before buying.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
