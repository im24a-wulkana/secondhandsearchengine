import { Item } from '../types';

/**
 * Vinted's public catalog API rejects cold requests with 401 — it requires the
 * anonymous session cookies handed out by any page load. So we fetch the
 * homepage once, keep the Set-Cookie jar, and use it for the search.
 *
 * (A CSRF token used to be required too, but the `"CSRF_TOKEN"` value no
 * longer appears in the HTML and the API accepts requests without it.)
 */
const BASE = 'https://www.vinted.com';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

/** The API silently caps a page at 96 however large per_page is. */
const PER_PAGE = 96;
const DEFAULT_PAGES = 8;
const REQUEST_TIMEOUT = 7000;

/** Vinted's human-readable condition strings → the app's vocabulary. */
const CONDITION_MAP: Record<string, string> = {
  'new with tags': 'new',
  'new without tags': 'new',
  'very good': 'like new',
  good: 'good',
  satisfactory: 'fair',
};

type VintedItem = {
  id: number;
  title?: string;
  price?: { amount?: string; currency_code?: string };
  total_item_price?: { amount?: string; currency_code?: string };
  size_title?: string;
  status?: string;
  url?: string;
  path?: string;
  photo?: { url?: string; high_resolution?: { timestamp?: number } };
  photos?: { url?: string; full_size_url?: string }[];
  brand_title?: string;
  favourite_count?: number;
  user?: { login?: string };
};

/** Session cookies are reused across calls; they're cheap but not free. */
let cachedJar: { value: string; expires: number } | null = null;
const JAR_TTL = 10 * 60 * 1000;

async function getSessionCookies(): Promise<string | null> {
  if (cachedJar && cachedJar.expires > Date.now()) return cachedJar.value;

  const response = await fetch(`${BASE}/`, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT),
  });

  if (!response.ok) return null;
  // Drain the body so the connection can be reused.
  await response.text();

  const jar = (response.headers.getSetCookie?.() ?? [])
    .map((cookie) => cookie.split(';')[0])
    .join('; ');

  if (!jar) return null;
  cachedJar = { value: jar, expires: Date.now() + JAR_TTL };
  return jar;
}

export async function scrapeVinted(query: string, pages = DEFAULT_PAGES): Promise<Item[]> {
  try {
    const jar = await getSessionCookies();
    if (!jar) {
      console.error('Vinted: could not obtain session cookies');
      return [];
    }

    const headers = {
      'User-Agent': USER_AGENT,
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      Cookie: jar,
      Referer: `${BASE}/`,
    };

    // Pages are fetched in parallel; serially this takes ~11s and blows the
    // orchestrator's 8s budget.
    const responses = await Promise.allSettled(
      Array.from({ length: pages }, (_, i) => {
        const url =
          `${BASE}/api/v2/catalog/items?search_text=${encodeURIComponent(query)}` +
          `&per_page=${PER_PAGE}&page=${i + 1}`;
        return fetch(url, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT) }).then((r) =>
          r.ok ? r.json() : null,
        );
      }),
    );

    // Pages overlap slightly, so dedupe by listing id.
    const seen = new Set<number>();
    const items: Item[] = [];

    for (const response of responses) {
      if (response.status !== 'fulfilled' || !response.value) continue;
      for (const raw of (response.value.items ?? []) as VintedItem[]) {
        if (!raw?.id || seen.has(raw.id)) continue;
        seen.add(raw.id);
        items.push(toItem(raw));
      }
    }

    return items;
  } catch (error) {
    console.error('Vinted scraper error:', error);
    return [];
  }
}

function toItem(raw: VintedItem): Item {
  // `price` is a {amount, currency_code} object, not a flat string.
  const amount = Number.parseFloat(raw.price?.amount ?? '');
  const total = Number.parseFloat(raw.total_item_price?.amount ?? '');
  const totalAmount = Number.isFinite(total) ? total : null;
  const timestamp = raw.photo?.high_resolution?.timestamp;

  return {
    id: `vinted-${raw.id}`,
    platform: 'vinted',
    title: raw.title ?? 'Untitled listing',
    price: Number.isFinite(amount) ? amount : 0,
    currency: raw.price?.currency_code ?? 'EUR',
    size: raw.size_title?.trim() ? raw.size_title.trim().toUpperCase() : null,
    condition: raw.status ? (CONDITION_MAP[raw.status.toLowerCase()] ?? null) : null,
    image_url: raw.photo?.url ?? '',
    // `url` is absolute; `path` is the relative fallback.
    external_url: raw.url ?? (raw.path ? `${BASE}${raw.path}` : ''),
    listed_at: timestamp ? new Date(timestamp * 1000).toISOString() : null,

    // Vinted's search payload has no description, but does carry extra photos
    // and the fee-inclusive price.
    description: null,
    // The search payload already carries every photo (up to ~13).
    images: (raw.photos ?? [])
      .map((p) => p.full_size_url ?? p.url)
      .filter((u): u is string => Boolean(u)),
    brand: raw.brand_title ?? null,
    color: null,
    seller: { name: raw.user?.login ?? null, rating: null, location: null },
    total_price: totalAmount,
    favourites: raw.favourite_count ?? null,
  };
}
