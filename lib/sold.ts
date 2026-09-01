import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';
import { getUsdRate, toUsd } from './currency';
import { queryTerms, scoreItem } from './relevance';
import type { Item, Platform } from './types';

/**
 * Sold-listing lookups, used to price a listing against what comparable items
 * actually fetched — not what other sellers are asking.
 *
 * Three of the five platforms expose sold data:
 *  - Grailed: a dedicated `Listing_sold_production` Algolia index, with both
 *    the sale price and the original ask.
 *  - Poshmark: `inventory_status: ['sold_out']` on the normal search.
 *  - Mercari: `STATUS_SOLD_OUT` on the normal search (JPY, converted here).
 *
 * eBay's sold data lives behind the Marketplace Insights API, which returns
 * 403 without a separate approved application. Vinted hides sold items
 * entirely. Both are simply absent from the sample rather than faked.
 */

export type SoldListing = {
  platform: Platform;
  title: string;
  /** Sale price in USD. */
  price: number;
  /** What the seller was asking, when the platform reports it. */
  askingPrice: number | null;
  soldAt: string | null;
  url: string;
};

const REQUEST_TIMEOUT = 7000;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

/* -------------------------------------------------------------------------- */
/* Grailed                                                                     */
/* -------------------------------------------------------------------------- */

const ALGOLIA_URL = 'https://mnrwefss2q-1.algolianet.com/1/indexes/*/queries';
const ALGOLIA_HEADERS = {
  accept: '*/*',
  'content-type': 'application/x-www-form-urlencoded',
  'x-algolia-api-key': 'bc9ee1c014521ccf312525a4ef324a16',
  'x-algolia-application-id': 'MNRWEFSS2Q',
};

async function grailedSold(query: string): Promise<SoldListing[]> {
  try {
    const params = new URLSearchParams({ query, hitsPerPage: '100', page: '0' }).toString();
    const response = await fetch(ALGOLIA_URL, {
      method: 'POST',
      headers: ALGOLIA_HEADERS,
      body: JSON.stringify({ requests: [{ indexName: 'Listing_sold_production', params }] }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    });
    if (!response.ok) return [];

    const data = await response.json();
    const hits = data?.results?.[0]?.hits ?? [];

    return hits
      .filter((h: { sold_price?: number }) => typeof h.sold_price === 'number' && h.sold_price > 0)
      .map(
        (h: {
          id: number;
          title?: string;
          sold_price: number;
          price?: number;
          sold_at?: string;
        }): SoldListing => ({
          platform: 'grailed',
          title: h.title ?? '',
          price: h.sold_price,
          // Only meaningful when it differs from what it sold for.
          askingPrice: typeof h.price === 'number' && h.price !== h.sold_price ? h.price : null,
          soldAt: h.sold_at ?? null,
          url: `https://www.grailed.com/listings/${h.id}`,
        }),
      );
  } catch {
    return [];
  }
}

/* -------------------------------------------------------------------------- */
/* Poshmark                                                                    */
/* -------------------------------------------------------------------------- */

async function poshmarkSold(query: string): Promise<SoldListing[]> {
  try {
    const request = {
      filters: { department: 'All', inventory_status: ['sold_out'] },
      query,
    };
    const url =
      `https://poshmark.com/vm-rest/posts?request=${encodeURIComponent(JSON.stringify(request))}` +
      `&count=48`;

    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    });
    if (!response.ok) return [];

    const data = await response.json();
    return (data?.data ?? [])
      .map(
        (p: {
          id?: string;
          title?: string;
          price_amount?: { val?: string };
          original_price_amount?: { val?: string };
          status_changed_at?: string;
          inventory?: { status_changed_at?: string };
        }): SoldListing | null => {
          const price = Number.parseFloat(p.price_amount?.val ?? '');
          if (!Number.isFinite(price) || price <= 0) return null;

          const original = Number.parseFloat(p.original_price_amount?.val ?? '');
          return {
            platform: 'poshmark',
            title: p.title ?? '',
            price,
            askingPrice: Number.isFinite(original) && original > price ? original : null,
            soldAt: p.inventory?.status_changed_at ?? p.status_changed_at ?? null,
            url: `https://poshmark.com/listing/${p.id}`,
          };
        },
      )
      .filter((x: SoldListing | null): x is SoldListing => x !== null);
  } catch {
    return [];
  }
}

/* -------------------------------------------------------------------------- */
/* Mercari                                                                     */
/* -------------------------------------------------------------------------- */

const MERCARI_URL = 'https://api.mercari.jp/v2/entities:search';
let mercariKeys: Promise<{ privateKey: CryptoKey; jwk: Record<string, unknown> }> | null = null;

function getMercariKeys() {
  if (!mercariKeys) {
    mercariKeys = (async () => {
      const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true });
      const full = await exportJWK(publicKey);
      return { privateKey, jwk: { crv: full.crv, kty: full.kty, x: full.x, y: full.y } };
    })();
  }
  return mercariKeys;
}

async function mercariSold(query: string): Promise<SoldListing[]> {
  try {
    const { privateKey, jwk } = await getMercariKeys();
    const dpop = await new SignJWT({ htu: MERCARI_URL, htm: 'POST', uuid: randomUUID() })
      .setProtectedHeader({ typ: 'dpop+jwt', alg: 'ES256', jwk })
      .setIssuedAt()
      .setJti(randomUUID())
      .sign(privateKey);

    const response = await fetch(MERCARI_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'User-Agent': USER_AGENT,
        dpop,
        'x-platform': 'web',
      },
      body: JSON.stringify({
        userId: '',
        pageSize: 120,
        pageToken: '',
        searchSessionId: randomUUID().replace(/-/g, ''),
        indexRouting: 'INDEX_ROUTING_UNSPECIFIED',
        searchCondition: {
          keyword: query,
          excludeKeyword: '',
          sort: 'SORT_SCORE',
          order: 'ORDER_DESC',
          status: ['STATUS_SOLD_OUT'],
        },
        defaultDatasets: ['DATASET_TYPE_MERCARI'],
        serviceFrom: 'suruga',
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    });
    if (!response.ok) return [];

    const data = await response.json();
    const rate = await getUsdRate('JPY');
    // Without a rate the yen figures would sit alongside dollars and skew the
    // median badly, so the platform is dropped rather than mixed in.
    if (!rate) return [];

    return (data?.items ?? [])
      .filter((i: { status?: string }) => i.status === 'ITEM_STATUS_SOLD_OUT')
      .map((i: { id?: string; name?: string; price?: string; updated?: number }): SoldListing | null => {
        const jpy = Number.parseFloat(i.price ?? '');
        if (!Number.isFinite(jpy) || jpy <= 0) return null;
        return {
          platform: 'mercari',
          title: i.name ?? '',
          price: toUsd(jpy, rate),
          askingPrice: null,
          soldAt: i.updated ? new Date(i.updated * 1000).toISOString() : null,
          url: `https://buyee.jp/mercari/item/${i.id}`,
        };
      })
      .filter((x: SoldListing | null): x is SoldListing => x !== null);
  } catch {
    return [];
  }
}

/* -------------------------------------------------------------------------- */
/* Aggregate                                                                   */
/* -------------------------------------------------------------------------- */

export type PriceComparison = {
  /** Sales judged comparable enough to include. */
  sampleSize: number;
  median: number;
  low: number;
  high: number;
  /** 25th and 75th percentile — a fairer "typical range" than min/max. */
  p25: number;
  p75: number;
  byPlatform: Partial<Record<Platform, number>>;
  /** How the listing's price compares, as a percentage of the median. */
  verdict: 'below' | 'around' | 'above';
  percentDiff: number;
  /**
   * The same gap as a share of the asking price. Phrasing it as "X% less than
   * the asking price" needs the ask as the base; using percentDiff there yields
   * impossible figures like "136% less".
   */
  percentOfAsking: number;
  recent: SoldListing[];
  /** Platforms with no usable sold data, so the UI can say why. */
  unavailable: Platform[];
};

/** Below this a median is noise rather than a signal. */
export const MIN_SAMPLE = 5;
/** Sold titles must match the query at least this well to count. */
const RELEVANCE_FLOOR = 0.6;

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

/**
 * Fetches sold listings across every platform that exposes them and summarises
 * them against `item`. Returns null when too few comparable sales exist — a
 * median drawn from two loosely-related items reads as authoritative and is
 * worse than saying nothing.
 */
export async function comparePrice(
  item: Pick<Item, 'title' | 'price' | 'currency'>,
  query?: string,
): Promise<PriceComparison | null> {
  const searchTerm = (query ?? item.title).trim();
  if (!searchTerm) return null;

  const [grailed, poshmark, mercari] = await Promise.all([
    grailedSold(searchTerm),
    poshmarkSold(searchTerm),
    mercariSold(searchTerm),
  ]);

  // Score every sold title against the query the same way search results are
  // ranked, so an unrelated sale can't drag the median around.
  const terms = queryTerms(searchTerm);
  const rarity = new Map<string, number>();
  for (const term of terms) rarity.set(term, 1);

  const all = [...grailed, ...poshmark, ...mercari].filter((sale) => {
    if (terms.length === 0) return true;
    const score = scoreItem(
      { title: sale.title, platform: sale.platform } as Item,
      terms,
      rarity,
    );
    return score >= RELEVANCE_FLOOR;
  });

  if (all.length < MIN_SAMPLE) return null;

  const prices = all.map((s) => s.price).sort((a, b) => a - b);
  const median = percentile(prices, 0.5);
  if (median <= 0) return null;

  const byPlatform: Partial<Record<Platform, number>> = {};
  for (const sale of all) byPlatform[sale.platform] = (byPlatform[sale.platform] ?? 0) + 1;

  // Derived after filtering, not from the raw fetches: a platform whose sold
  // items all fell below the relevance floor is just as absent from the median
  // as one that returned nothing, and the UI explains both.
  const unavailable: Platform[] = ['ebay', 'vinted'];
  for (const platform of ['grailed', 'poshmark', 'mercari'] as const) {
    if (!byPlatform[platform]) unavailable.push(platform);
  }

  const percentDiff = Math.round(((item.price - median) / median) * 100);
  const percentOfAsking =
    item.price > 0 ? Math.round(((item.price - median) / item.price) * 100) : 0;
  // A tenth either way is normal variation, not a deal or a markup.
  const verdict = percentDiff <= -10 ? 'below' : percentDiff >= 10 ? 'above' : 'around';

  const recent = [...all]
    .filter((s) => s.soldAt)
    .sort((a, b) => new Date(b.soldAt!).getTime() - new Date(a.soldAt!).getTime())
    .slice(0, 6);

  return {
    sampleSize: all.length,
    median: Math.round(median),
    low: Math.round(prices[0]),
    high: Math.round(prices[prices.length - 1]),
    p25: Math.round(percentile(prices, 0.25)),
    p75: Math.round(percentile(prices, 0.75)),
    byPlatform,
    verdict,
    percentDiff,
    percentOfAsking,
    recent,
    unavailable,
  };
}
