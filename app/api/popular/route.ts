import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';

/**
 * Most-run searches on this site over the last 30 days.
 *
 * Until there's real traffic the list is thin, so a curated set fills the gap —
 * the homepage never renders an empty row, and it switches to real data on its
 * own as searches accumulate.
 */
const CURATED = [
  'Carhartt Detroit jacket',
  'Levi’s 501 vintage',
  'Arc’teryx shell',
  'Doc Martens 1460',
  'Acne Studios knit',
];

const LIMIT = 6;
/** Below this a term isn't meaningfully "popular" — one person searching twice. */
const MIN_SEARCHES = 3;

export const revalidate = 300;

export async function GET() {
  const sql = getSql();
  if (!sql) {
    return NextResponse.json({ terms: CURATED, source: 'curated' });
  }

  try {
    const rows = (await sql`
      select query, search_count
      from popular_searches
      where search_count >= ${MIN_SEARCHES}
      limit ${LIMIT}
    `) as { query: string; search_count: number }[];

    const terms = rows.map((r) => r.query);
    if (terms.length === 0) {
      return NextResponse.json({ terms: CURATED, source: 'curated' });
    }

    // Top up a short list with curated terms the real data doesn't already cover.
    if (terms.length < LIMIT) {
      const seen = new Set(terms.map((t) => t.toLowerCase()));
      for (const term of CURATED) {
        if (terms.length >= LIMIT) break;
        if (!seen.has(term.toLowerCase())) terms.push(term);
      }
      return NextResponse.json({ terms, source: 'mixed' });
    }

    return NextResponse.json({ terms, source: 'searches' });
  } catch (error) {
    console.error('Popular searches error:', error);
    return NextResponse.json({ terms: CURATED, source: 'curated' });
  }
}
