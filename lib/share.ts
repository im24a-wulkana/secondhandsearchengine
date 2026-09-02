import type { Item, Platform } from './types';

/**
 * Shareable listing links.
 *
 * A listing only exists in OneRail for as long as a search holds it in memory —
 * nothing is persisted, and the detail API covers only Grailed and Mercari (and
 * only for photos and description). So a recipient who never ran the search has
 * no way to look the listing up, and the link has to carry the listing itself.
 *
 * The payload is packed into short keys, base64url-encoded, and placed in the
 * URL fragment. The fragment never reaches the server, which keeps these links
 * out of access logs and referrer headers, and means the page renders them
 * entirely client-side.
 */

/** Only the fields the detail view actually renders, with terse keys. */
type Packed = {
  i: string; // id
  p: Platform;
  t: string; // title
  r: number; // price
  c: string; // currency
  u: string; // external_url
  g: string; // image_url
  s?: string; // size
  n?: string; // condition
  d?: string; // description
  m?: string[]; // images
  b?: string; // brand
  l?: string; // listed_at
  o?: [number, string]; // original_price [amount, currency]
};

/** Base64url has no padding and is safe in a URL fragment unescaped. */
function toBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * Descriptions run to several thousand characters on Poshmark and Grailed, and
 * would dominate the link. The detail view clamps them anyway, so a share keeps
 * enough to be useful and drops the rest.
 */
const MAX_DESCRIPTION = 400;
/** Extra gallery shots past this add length for diminishing value. */
const MAX_IMAGES = 6;

export function encodeListing(item: Item): string {
  const packed: Packed = {
    i: item.id,
    p: item.platform,
    t: item.title,
    r: item.price,
    c: item.currency,
    u: item.external_url,
    g: item.image_url,
  };

  if (item.size) packed.s = item.size;
  if (item.condition) packed.n = item.condition;
  if (item.brand) packed.b = item.brand;
  if (item.listed_at) packed.l = item.listed_at;
  if (item.description) packed.d = item.description.slice(0, MAX_DESCRIPTION);
  if (item.original_price) packed.o = [item.original_price.amount, item.original_price.currency];

  // The cover shot is already in `g`, so only the additional ones travel.
  const extra = (item.images ?? []).filter((src) => src && src !== item.image_url);
  if (extra.length > 0) packed.m = extra.slice(0, MAX_IMAGES);

  return toBase64Url(JSON.stringify(packed));
}

/** Returns null for anything malformed — a truncated or hand-edited link. */
export function decodeListing(token: string): Item | null {
  try {
    const packed = JSON.parse(fromBase64Url(token)) as Partial<Packed>;

    // Guard the fields the detail view cannot render without.
    if (
      typeof packed.i !== 'string' ||
      typeof packed.p !== 'string' ||
      typeof packed.t !== 'string' ||
      typeof packed.r !== 'number' ||
      typeof packed.u !== 'string'
    ) {
      return null;
    }

    // Only ever hand back links to the marketplaces this app knows about, so a
    // crafted token cannot turn the page into an open redirect.
    if (!/^https:\/\//i.test(packed.u)) return null;

    return {
      id: packed.i,
      platform: packed.p as Platform,
      title: packed.t,
      price: packed.r,
      currency: typeof packed.c === 'string' ? packed.c : 'USD',
      size: packed.s ?? null,
      condition: packed.n ?? null,
      image_url: typeof packed.g === 'string' ? packed.g : '',
      external_url: packed.u,
      listed_at: packed.l ?? null,
      description: packed.d ?? null,
      images: Array.isArray(packed.m)
        ? [packed.g, ...packed.m].filter((src): src is string => typeof src === 'string' && !!src)
        : undefined,
      brand: packed.b ?? null,
      original_price:
        Array.isArray(packed.o) && typeof packed.o[0] === 'number'
          ? { amount: packed.o[0], currency: String(packed.o[1] ?? 'USD') }
          : null,
    };
  } catch {
    return null;
  }
}

/** The absolute URL to hand someone, e.g. https://onerail.app/l#<token>. */
export function shareUrl(item: Item, origin: string): string {
  return `${origin}/l#${encodeListing(item)}`;
}
