import { NextRequest, NextResponse } from 'next/server';
import { searchAllPlatforms } from '@/lib/scrapers';
import { rankByRelevance } from '@/lib/relevance';

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
    const { kept, removed } = strict
      ? rankByRelevance(items, trimmed)
      : { kept: items, removed: 0 };

    return NextResponse.json({
      success: true,
      data: kept,
      total: kept.length,
      filtered: removed,
      query: trimmed,
    });
  } catch (error) {
    console.error('Search API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
