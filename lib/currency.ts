/**
 * Currency conversion for listings priced outside USD.
 *
 * Rates come from a free, keyless API and are cached in memory. A stale rate is
 * far better than a failed search, so the cache is served past its TTL whenever
 * a refresh fails, and a conservative hardcoded fallback covers a cold start
 * with no network.
 */
const RATE_TTL = 6 * 60 * 60 * 1000;
const REQUEST_TIMEOUT = 4000;

/** Rough fallbacks, only used if the rate API is unreachable on a cold start. */
const FALLBACK_RATES: Record<string, number> = {
  JPY: 0.0063,
  EUR: 1.08,
  GBP: 1.27,
};

type CacheEntry = { rate: number; fetchedAt: number };
const cache = new Map<string, CacheEntry>();

async function fetchRate(from: string): Promise<number | null> {
  try {
    const res = await fetch(`https://api.frankfurter.app/latest?from=${from}&to=USD`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const rate = data?.rates?.USD;
    return typeof rate === 'number' && rate > 0 ? rate : null;
  } catch {
    return null;
  }
}

/** USD per 1 unit of `from`. Returns null only if there's no usable value at all. */
export async function getUsdRate(from: string): Promise<number | null> {
  const code = from?.toUpperCase();
  if (!code || code === 'USD') return 1;

  const cached = cache.get(code);
  if (cached && Date.now() - cached.fetchedAt < RATE_TTL) return cached.rate;

  const fresh = await fetchRate(code);
  if (fresh !== null) {
    cache.set(code, { rate: fresh, fetchedAt: Date.now() });
    return fresh;
  }

  // Serve a stale rate rather than dropping the listing's price.
  if (cached) return cached.rate;
  return FALLBACK_RATES[code] ?? null;
}

/** Converts to USD, rounded to whole dollars for prices above $10. */
export function toUsd(amount: number, rate: number): number {
  const usd = amount * rate;
  return usd >= 10 ? Math.round(usd) : Math.round(usd * 100) / 100;
}
