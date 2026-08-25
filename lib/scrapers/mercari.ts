import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';
import type { Item } from '../types';
import { getUsdRate, toUsd } from '../currency';
import { translateToEnglish } from '../translate';

/**
 * Mercari Japan's public search API.
 *
 * It requires a DPoP proof (RFC 9449) — a self-signed ES256 JWT — but not an
 * account: the keypair is generated here and never registered anywhere. Without
 * the header the API returns 401 "missing auth token".
 *
 * Listings ship within Japan only, so `external_url` points at Buyee, a
 * forwarding service, and each item is flagged so the UI can say so.
 */
const ENDPOINT = 'https://api.mercari.jp/v2/entities:search';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

/** The API caps a page at 120. */
const PAGE_SIZE = 120;
const DEFAULT_PAGES = 3;
const REQUEST_TIMEOUT = 7000;

/** Mercari's 1–5 condition scale, mapped to the app's vocabulary. */
const CONDITION_MAP: Record<string, string> = {
  '1': 'new', // 新品、未使用
  '2': 'like new', // 未使用に近い
  '3': 'good', // 目立った傷や汚れなし
  '4': 'good', // やや傷や汚れあり
  '5': 'fair', // 傷や汚れあり
};

type MercariItem = {
  id?: string;
  name?: string;
  price?: string;
  status?: string;
  created?: number;
  updated?: number;
  thumbnails?: string[];
  itemConditionId?: string;
  itemBrand?: { name?: string };
  itemSize?: { name?: string };
};

/**
 * One keypair per process. Mercari only checks that the proof is internally
 * consistent, so regenerating per request would be wasted CPU.
 */
let keyPromise: Promise<{ privateKey: CryptoKey; jwk: Record<string, unknown> }> | null = null;

function getKeys() {
  if (!keyPromise) {
    keyPromise = (async () => {
      const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true });
      const full = await exportJWK(publicKey);
      // Only the public coordinates belong in the proof header.
      return { privateKey, jwk: { crv: full.crv, kty: full.kty, x: full.x, y: full.y } };
    })();
  }
  return keyPromise;
}

async function createDpop(): Promise<string> {
  const { privateKey, jwk } = await getKeys();
  return new SignJWT({ htu: ENDPOINT, htm: 'POST', uuid: randomUUID() })
    .setProtectedHeader({ typ: 'dpop+jwt', alg: 'ES256', jwk })
    .setIssuedAt()
    .setJti(randomUUID())
    .sign(privateKey);
}

export async function scrapeMercari(query: string, pages = DEFAULT_PAGES): Promise<Item[]> {
  try {
    const raw: MercariItem[] = [];
    const seen = new Set<string>();
    let pageToken = '';

    // Pages chain through a cursor, so they can't be fetched in parallel.
    for (let page = 0; page < pages; page += 1) {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: '*/*',
          'User-Agent': USER_AGENT,
          dpop: await createDpop(),
          'x-platform': 'web',
        },
        body: JSON.stringify({
          userId: '',
          pageSize: PAGE_SIZE,
          pageToken,
          searchSessionId: randomUUID().replace(/-/g, ''),
          indexRouting: 'INDEX_ROUTING_UNSPECIFIED',
          searchCondition: {
            keyword: query,
            excludeKeyword: '',
            sort: 'SORT_SCORE',
            order: 'ORDER_DESC',
            status: ['STATUS_ON_SALE'],
          },
          defaultDatasets: ['DATASET_TYPE_MERCARI'],
          serviceFrom: 'suruga',
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      });

      if (!response.ok) {
        console.error(`Mercari search failed: ${response.status}`);
        break;
      }

      const data = await response.json();
      const items: MercariItem[] = data?.items ?? [];
      if (items.length === 0) break;

      for (const item of items) {
        if (!item?.id || seen.has(item.id)) continue;
        seen.add(item.id);
        raw.push(item);
      }

      pageToken = data?.meta?.nextPageToken ?? '';
      if (!pageToken) break;
    }

    if (raw.length === 0) return [];

    // Prices are JPY and titles are Japanese; resolve both before mapping.
    const [rate, titles] = await Promise.all([
      getUsdRate('JPY'),
      translateToEnglish(raw.map((i) => i.name ?? '')),
    ]);

    return raw.map((item, i) => toItem(item, titles[i] ?? item.name ?? '', rate));
  } catch (error) {
    console.error('Mercari scraper error:', error);
    return [];
  }
}

function toItem(raw: MercariItem, title: string, rate: number | null): Item {
  const jpy = Number.parseFloat(raw.price ?? '');
  const hasPrice = Number.isFinite(jpy);
  // Fall back to the yen figure rather than showing $0 if the rate is missing.
  const converted = hasPrice && rate ? toUsd(jpy, rate) : 0;

  return {
    id: `mercari-${raw.id}`,
    platform: 'mercari',
    title: title || 'Untitled listing',
    price: rate ? converted : hasPrice ? jpy : 0,
    currency: rate ? 'USD' : 'JPY',
    size: raw.itemSize?.name?.trim() ? raw.itemSize.name.trim().toUpperCase() : null,
    condition: raw.itemConditionId ? (CONDITION_MAP[raw.itemConditionId] ?? null) : null,
    image_url: raw.thumbnails?.[0] ?? '',
    // Mercari sellers don't ship abroad; Buyee forwards the purchase.
    external_url: `https://buyee.jp/mercari/item/${raw.id}`,
    listed_at: raw.created ? new Date(raw.created * 1000).toISOString() : null,

    images: raw.thumbnails ?? [],
    brand: raw.itemBrand?.name ?? null,
    description: null,
    seller: null,
    proxy: {
      service: 'Buyee',
      note: 'Ships from Japan via a forwarding service. Fees apply at checkout.',
    },
    original_price: hasPrice && rate ? { amount: jpy, currency: 'JPY' } : null,
  };
}
