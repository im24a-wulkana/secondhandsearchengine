import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { searchAllPlatforms } from '@/lib/scrapers';
import { filterApparel } from '@/lib/apparel';
import { rankByRelevance } from '@/lib/relevance';
import { applyFilters } from '@/lib/filters';
import type { Filters } from '@/lib/types';

/**
 * Re-runs each saved search and counts listings that were not present last
 * time. The comparison is by listing id against `seen_ids`, so "new" means
 * genuinely new to this user rather than merely a changed result count —
 * a total can stay flat while the contents turn over.
 */

/** Runs are sequential marketplace fan-outs, so keep the batch small. */
const MAX_PER_RUN = 5;
/**
 * Cap on stored ids. A search returning thousands would otherwise grow the
 * row without bound; the newest slice is what matters for diffing.
 */
const MAX_SEEN_IDS = 3000;

type Row = {
  id: string;
  name: string;
  query: string;
  filters: Filters;
  seen_ids: string[];
};

export const maxDuration = 300;

export async function POST(request: Request) {
  const sql = getSql();
  if (!sql) {
    return NextResponse.json({ error: 'Accounts are not configured.' }, { status: 503 });
  }

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in to check saved searches.' }, { status: 401 });
  }

  try {
    // An explicit id checks one search; otherwise the stalest few are refreshed.
    const body = await request.json().catch(() => ({}));
    const onlyId = typeof body?.id === 'string' ? body.id : null;

    const rows = onlyId
      ? ((await sql`
          select id, name, query, filters, seen_ids
          from saved_searches
          where id = ${onlyId} and user_id = ${user.id}
        `) as Row[])
      : ((await sql`
          select id, name, query, filters, seen_ids
          from saved_searches
          where user_id = ${user.id}
          order by last_checked_at asc nulls first
          limit ${MAX_PER_RUN}
        `) as Row[]);

    if (rows.length === 0) {
      return NextResponse.json({ success: true, checked: 0, results: [] });
    }

    const results: { id: string; name: string; newCount: number; total: number }[] = [];

    for (const row of rows) {
      let ids: string[] = [];
      let total = 0;

      try {
        const raw = await searchAllPlatforms(row.query);
        // Match what the user sees: same apparel filter, relevance ranking and
        // saved refinements, or the counts would not line up with the results.
        const { kept: wearable } = filterApparel(raw);
        const { kept } = rankByRelevance(wearable, row.query);
        const visible = applyFilters(kept, row.filters ?? {}, 'relevance');

        ids = visible.map((i) => i.id);
        total = visible.length;
      } catch {
        // A failed run is not evidence of change; leave the row untouched.
        continue;
      }

      const seen = new Set(row.seen_ids ?? []);
      const fresh = ids.filter((id) => !seen.has(id));

      // Union of old and new, newest first, so ids do not vanish and then
      // re-appear as "new" on a later run.
      const merged = [...ids, ...(row.seen_ids ?? [])].slice(0, MAX_SEEN_IDS);

      await sql`
        update saved_searches
        set seen_ids = ${merged},
            new_count = ${fresh.length},
            total_at_last_check = ${total},
            last_checked_at = now()
        where id = ${row.id}
      `;

      results.push({ id: row.id, name: row.name, newCount: fresh.length, total });
    }

    return NextResponse.json({ success: true, checked: results.length, results });
  } catch (error) {
    console.error('Saved search check error:', error);
    return NextResponse.json({ error: 'Could not check saved searches.' }, { status: 500 });
  }
}
