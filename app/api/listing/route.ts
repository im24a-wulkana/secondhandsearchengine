import { NextResponse } from 'next/server';

/**
 * On-demand detail lookup for platforms whose search payload is incomplete.
 *
 * Only Grailed needs this: its Algolia index ships a single cover shot and no
 * description, but the public listing API exposes both. Vinted and Poshmark
 * already return every photo in search, so they never reach here.
 */
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

const TIMEOUT = 7000;
/** Detail payloads are immutable enough to cache for the session. */
const CACHE_TTL = 30 * 60 * 1000;
const MAX_CACHE = 300;

type Detail = { images: string[]; description: string | null };

const cache = new Map<string, { value: Detail; expires: number }>();

function readCache(key: string): Detail | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expires < Date.now()) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function writeCache(key: string, value: Detail): void {
  // Bounded FIFO — this is a per-instance cache, not a store.
  if (cache.size >= MAX_CACHE) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { value, expires: Date.now() + CACHE_TTL });
}

async function fetchGrailed(id: string): Promise<Detail> {
  const headers = { 'User-Agent': USER_AGENT, Accept: 'application/json' };

  const [photosRes, listingRes] = await Promise.allSettled([
    fetch(`https://www.grailed.com/api/listings/${id}/photos`, {
      headers,
      signal: AbortSignal.timeout(TIMEOUT),
    }),
    fetch(`https://www.grailed.com/api/listings/${id}`, {
      headers,
      signal: AbortSignal.timeout(TIMEOUT),
    }),
  ]);

  const images: string[] = [];
  if (photosRes.status === 'fulfilled' && photosRes.value.ok) {
    const json = await photosRes.value.json().catch(() => null);
    for (const photo of json?.data ?? []) {
      if (photo?.url) images.push(`${photo.url}?w=1200&fit=clip&auto=format`);
    }
  }

  let description: string | null = null;
  if (listingRes.status === 'fulfilled' && listingRes.value.ok) {
    const json = await listingRes.value.json().catch(() => null);
    const listing = json?.data;
    description = typeof listing?.description === 'string' ? listing.description : null;
    // The listing payload also carries photos; use them if the photos call failed.
    if (images.length === 0) {
      for (const photo of listing?.photos ?? []) {
        if (photo?.url) images.push(`${photo.url}?w=1200&fit=clip&auto=format`);
      }
    }
  }

  return { images, description };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get('platform');
    const id = searchParams.get('id');

    if (platform !== 'grailed') {
      return NextResponse.json(
        { error: 'Only Grailed listings need a detail lookup.' },
        { status: 400 },
      );
    }
    // Grailed ids are numeric; reject anything else rather than proxying it.
    if (!id || !/^\d+$/.test(id)) {
      return NextResponse.json({ error: 'A numeric listing id is required.' }, { status: 400 });
    }

    const key = `grailed:${id}`;
    const cached = readCache(key);
    if (cached) return NextResponse.json({ success: true, ...cached, cached: true });

    const detail = await fetchGrailed(id);
    writeCache(key, detail);

    return NextResponse.json({ success: true, ...detail });
  } catch (error) {
    console.error('Listing detail error:', error);
    return NextResponse.json({ error: 'Could not load listing details.' }, { status: 500 });
  }
}
