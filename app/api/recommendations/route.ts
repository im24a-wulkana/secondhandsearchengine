import { NextResponse } from 'next/server';
import { searchAllPlatforms } from '@/lib/scrapers';
import type { Item } from '@/lib/types';
import type { SearchRecord } from '@/lib/history';
import { buildTermProfile, topInterests, rankItems, diversify } from '@/lib/recommend';
import { getSessionUser } from '@/lib/auth';

/** How many past searches to actually spend network requests on. */
const MAX_INTERESTS = 3;
const MAX_RESULTS = 60;

type Body = { history?: unknown };

function parseHistory(value: unknown): SearchRecord[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is SearchRecord => {
      if (typeof entry !== 'object' || entry === null) return false;
      const r = entry as Partial<SearchRecord>;
      return (
        typeof r.query === 'string' &&
        r.query.trim().length > 0 &&
        typeof r.at === 'number' &&
        Number.isFinite(r.at) &&
        typeof r.count === 'number' &&
        Number.isFinite(r.count)
      );
    })
    // Trust the client for ordering only; cap the volume it can make us fetch.
    .slice(0, 40);
}

export async function POST(request: Request) {
  try {
    // For You is a members feature; the page gate alone wouldn't protect this.
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'Sign in to use your feed.' }, { status: 401 });
    }

    const body: Body = await request.json();
    const history = parseHistory(body.history);

    if (history.length === 0) {
      return NextResponse.json({ success: true, data: [], interests: [] });
    }

    const interests = topInterests(history, MAX_INTERESTS);

    // Run the interest searches in parallel; one failing shouldn't empty the feed.
    const settled = await Promise.allSettled(
      interests.map((interest) => searchAllPlatforms(interest.query)),
    );

    const pooled: Item[] = [];
    const seen = new Set<string>();
    for (const result of settled) {
      if (result.status !== 'fulfilled') continue;
      for (const item of result.value) {
        // The same listing can surface under two different interests.
        if (seen.has(item.external_url)) continue;
        seen.add(item.external_url);
        pooled.push(item);
      }
    }

    const profile = buildTermProfile(history);
    const ranked = diversify(rankItems(pooled, profile)).slice(0, MAX_RESULTS);

    return NextResponse.json({
      success: true,
      data: ranked.map((entry) => entry.item),
      interests: interests.map((i) => i.query),
    });
  } catch (error) {
    console.error('Recommendations API error:', error);
    return NextResponse.json({ error: 'Could not build recommendations.' }, { status: 500 });
  }
}
