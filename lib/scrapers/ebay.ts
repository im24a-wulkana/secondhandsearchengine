import { Item } from '../types';

/**
 * eBay Browse API - the one platform here with an official, sanctioned API.
 *
 * Access tokens expire after ~2 hours, so rather than reading a pasted token
 * this mints one from the client credentials and caches it until just before
 * expiry. That keeps the platform working unattended.
 */
const TOKEN_URL = 'https://api.ebay.com/identity/v1/oauth2/token';
const SEARCH_URL = 'https://api.ebay.com/buy/browse/v1/item_summary/search';
const SCOPE = 'https://api.ebay.com/oauth/api_scope';

/** The API caps a page at 200; offsets are independent so pages run in parallel. */
const PAGE_SIZE = 200;
const DEFAULT_PAGES = 3;
const REQUEST_TIMEOUT = 7000;
/** Refresh a minute early so a token cannot expire mid-flight. */
const TOKEN_SKEW_MS = 60_000;

/** Every buyable condition id. */
const CONDITION_FILTER = 'conditionIds:{1000|1500|2000|2500|3000|4000|5000|6000}';

/**
 * Condition strings vary by category; ids are stable, so map on those.
 * eBay uses finer-grained ids than its documented set (2990 "Excellent",
 * 3010 "Fair", 1750 "New with imperfections"), so unlisted ids fall back to
 * a range check rather than being dropped.
 */
const CONDITION_MAP: Record<string, string> = {
  '1000': 'new', // New with tags
  '1500': 'new', // New without tags
  '1750': 'like new', // New with imperfections
  '2000': 'like new', // Certified refurbished
  '2500': 'like new', // Seller refurbished
  '2750': 'like new',
  '2990': 'like new', // Pre-owned - Excellent
  '3000': 'good', // Pre-owned - Good
  '3010': 'fair', // Pre-owned - Fair
  '4000': 'good',
  '5000': 'fair',
  '6000': 'fair',
  '7000': 'fair', // For parts or not working
};

/** Buckets any id eBay adds later, so a listing never loses its condition. */
function mapCondition(conditionId?: string): string | null {
  if (!conditionId) return null;
  const known = CONDITION_MAP[conditionId];
  if (known) return known;

  const n = Number.parseInt(conditionId, 10);
  if (!Number.isFinite(n)) return null;
  if (n < 2000) return 'new';
  if (n < 3000) return 'like new';
  if (n < 3010) return 'good';
  return 'fair';
}

type EbayItem = {
  itemId?: string;
  title?: string;
  price?: { value?: string; currency?: string };
  conditionId?: string;
  image?: { imageUrl?: string };
  thumbnailImages?: { imageUrl?: string }[];
  additionalImages?: { imageUrl?: string }[];
  itemWebUrl?: string;
  itemCreationDate?: string;
  seller?: { username?: string; feedbackPercentage?: string };
  itemLocation?: { country?: string };
  categories?: { categoryId?: string; categoryName?: string }[];
};

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string | null> {
  const id = process.env.EBAY_CLIENT_ID;
  const secret = process.env.EBAY_CLIENT_SECRET;
  if (!id || !secret) return null;

  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;

  try {
    const credentials = Buffer.from(id + ':' + secret).toString('base64');
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + credentials,
      },
      body: 'grant_type=client_credentials&scope=' + encodeURIComponent(SCOPE),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    });

    if (!response.ok) {
      console.error('eBay token request failed: ' + response.status);
      return null;
    }

    const data = await response.json();
    if (!data?.access_token) return null;

    cachedToken = {
      value: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 7200) * 1000 - TOKEN_SKEW_MS,
    };
    return cachedToken.value;
  } catch (error) {
    console.error('eBay token error:', error);
    return null;
  }
}

export async function scrapeEbay(query: string, pages = DEFAULT_PAGES): Promise<Item[]> {
  // No credentials simply means the platform is off; not worth logging per search.
  const token = await getAccessToken();
  if (!token) return [];

  try {
    const headers = {
      Authorization: 'Bearer ' + token,
      Accept: 'application/json',
      'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
    };

    // Offsets are independent, so every page goes out at once.
    const responses = await Promise.allSettled(
      Array.from({ length: pages }, (_, i) => {
        const params = new URLSearchParams({
          q: query,
          limit: String(PAGE_SIZE),
          offset: String(i * PAGE_SIZE),
          filter: CONDITION_FILTER,
        });
        return fetch(SEARCH_URL + '?' + params.toString(), {
          headers,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT),
        }).then((r) => (r.ok ? r.json() : null));
      }),
    );

    const seen = new Set<string>();
    const items: Item[] = [];

    for (const response of responses) {
      if (response.status !== 'fulfilled' || !response.value) continue;
      for (const raw of (response.value.itemSummaries ?? []) as EbayItem[]) {
        if (!raw?.itemId || seen.has(raw.itemId)) continue;
        seen.add(raw.itemId);
        items.push(toItem(raw));
      }
    }

    return items;
  } catch (error) {
    console.error('eBay scraper error:', error);
    return [];
  }
}

/** Pulls a size out of the title; the Browse API exposes it only as free text. */
function extractSize(title: string): string | null {
  const patterns = [
    /\bsize[:\s]+([0-9]{1,2}(?:\.5)?|XXS|XS|S|M|L|XL|XXL|[0-9]{2}[SRL])\b/i,
    /\b(XXS|XS|S|M|L|XL|XXL|XXXL)\b/,
  ];
  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match) return match[1].toUpperCase();
  }
  return null;
}

function toItem(raw: EbayItem): Item {
  const title = raw.title ?? 'Untitled listing';
  const amount = Number.parseFloat(raw.price?.value ?? '');
  const cover = raw.image?.imageUrl ?? raw.thumbnailImages?.[0]?.imageUrl ?? '';
  const extra = (raw.additionalImages ?? [])
    .map((i) => i.imageUrl)
    .filter((u): u is string => Boolean(u));

  const feedback = Number.parseFloat(raw.seller?.feedbackPercentage ?? '');

  return {
    id: 'ebay-' + raw.itemId,
    platform: 'ebay',
    title,
    price: Number.isFinite(amount) ? amount : 0,
    currency: raw.price?.currency ?? 'USD',
    size: extractSize(title),
    condition: mapCondition(raw.conditionId),
    image_url: cover,
    external_url: raw.itemWebUrl ?? '',
    listed_at: raw.itemCreationDate ?? null,

    images: cover ? [cover, ...extra] : extra,
    description: null,
    brand: null,
    // Comma-joined ids so the apparel filter can test the whole tree.
    category: (raw.categories ?? []).map((c) => c.categoryId).filter(Boolean).join(','),
    seller: {
      name: raw.seller?.username ?? null,
      // Feedback is a 0-100 percentage; show it on the same 5-point scale.
      rating: Number.isFinite(feedback) ? Math.round((feedback / 20) * 10) / 10 : null,
      location: raw.itemLocation?.country ?? null,
    },
  };
}
