import { NextRequest, NextResponse } from 'next/server';
import { searchAllPlatforms } from '@/lib/scrapers';
import { rankByRelevance } from '@/lib/relevance';
import { filterApparel } from '@/lib/apparel';
import { getSql } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

/**
 * Records the search so the homepage "Popular" row reflects real usage.
 * Fire-and-forget: logging must never slow down or fail a search.
 */
async function logSearch(query: string, resultCount: number): Promise<void> {
  const sql = getSql();
  if (!sql) return;
  try {
    const user = await getSessionUser();
    await sql`
      insert into searches (user_id, query, query_key, result_count)
      values (${user?.id ?? null}, ${query}, ${query.toLowerCase()}, ${resultCount})
    `;
  } catch (error) {
    console.error('Search logging failed:', error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const query = body?.query;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    // Opt-out so the UI can show the unfiltered pool on request.
    const strict = body?.strict !== false;
    const trimmed = query.trim();
    const items = await searchAllPlatforms(trimmed);

    // Platform search is loose, so re-rank against the query and drop the
    // clearly-unrelated tail. Ordering is by relevance, which is what the
    // client's default "Relevance" sort expects.
    // Drop non-wearable stock first (fragrance, cosmetics, homeware), then
    // rank what's left. Doing it in this order keeps the relevance floor from
    // being computed against noise.
    const apparelOnly = body?.apparelOnly !== false;
    const { kept: wearable, removed: nonApparel } = apparelOnly
      ? filterApparel(items)
      : { kept: items, removed: 0 };

    const { kept, removed } = strict
      ? rankByRelevance(wearable, trimmed)
      : { kept: wearable, removed: 0 };

    // Awaited rather than floated: serverless functions can be frozen the
    // moment a response is returned, which would drop an in-flight insert.
    await logSearch(trimmed, kept.length);

    return NextResponse.json({
      success: true,
      data: kept,
      total: kept.length,
      filtered: removed,
      nonApparelFiltered: nonApparel,
      query: trimmed,
    });
  } catch (error) {
    console.error('Search API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
