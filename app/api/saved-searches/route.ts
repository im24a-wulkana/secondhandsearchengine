import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import type { Filters } from '@/lib/types';

/**
 * Saved searches: a pinned query plus its filters, with a count of listings
 * that have appeared since the user last looked.
 */

const UNAUTHORIZED = () =>
  NextResponse.json({ error: 'Sign in to manage saved searches.' }, { status: 401 });
const NOT_CONFIGURED = () =>
  NextResponse.json({ error: 'Accounts are not configured on this deployment.' }, { status: 503 });

const MAX_SAVED = 20;

type Row = {
  id: string;
  name: string;
  query: string;
  filters: Filters;
  new_count: number;
  total_at_last_check: number;
  last_checked_at: string | null;
  created_at: string;
};

export async function GET() {
  const sql = getSql();
  if (!sql) return NOT_CONFIGURED();

  const user = await getSessionUser();
  if (!user) return UNAUTHORIZED();

  const rows = (await sql`
    select id, name, query, filters, new_count, total_at_last_check,
           last_checked_at, created_at
    from saved_searches
    where user_id = ${user.id}
    order by created_at desc
  `) as Row[];

  return NextResponse.json({
    success: true,
    data: rows.map((r) => ({
      id: r.id,
      name: r.name,
      query: r.query,
      filters: r.filters ?? {},
      newCount: r.new_count,
      totalAtLastCheck: r.total_at_last_check,
      lastCheckedAt: r.last_checked_at ? new Date(r.last_checked_at).toISOString() : null,
      createdAt: new Date(r.created_at).toISOString(),
    })),
  });
}

export async function POST(request: Request) {
  const sql = getSql();
  if (!sql) return NOT_CONFIGURED();

  const user = await getSessionUser();
  if (!user) return UNAUTHORIZED();

  try {
    const body = await request.json();
    const query = typeof body?.query === 'string' ? body.query.trim() : '';
    if (!query) {
      return NextResponse.json({ error: 'A search query is required.' }, { status: 400 });
    }

    const [{ count }] = (await sql`
      select count(*)::int as count from saved_searches where user_id = ${user.id}
    `) as { count: number }[];
    if (count >= MAX_SAVED) {
      return NextResponse.json(
        { error: `You can save up to ${MAX_SAVED} searches. Remove one first.` },
        { status: 409 },
      );
    }

    const name = typeof body?.name === 'string' && body.name.trim() ? body.name.trim() : query;
    const filters = body?.filters && typeof body.filters === 'object' ? body.filters : {};
    // The ids visible when saving become the baseline, so nothing already on
    // screen is counted as new on the first check.
    const ids: string[] = Array.isArray(body?.itemIds)
      ? body.itemIds.filter((i: unknown): i is string => typeof i === 'string')
      : [];

    const rows = (await sql`
      insert into saved_searches
        (user_id, name, query, filters, seen_ids, total_at_last_check, last_checked_at)
      values
        (${user.id}, ${name}, ${query}, ${JSON.stringify(filters)}::jsonb,
         ${ids}, ${ids.length}, now())
      on conflict (user_id, lower(query)) do update set
        name = excluded.name,
        filters = excluded.filters,
        seen_ids = excluded.seen_ids,
        total_at_last_check = excluded.total_at_last_check,
        new_count = 0,
        last_checked_at = now()
      returning id
    `) as { id: string }[];

    return NextResponse.json({ success: true, id: rows[0]?.id });
  } catch (error) {
    console.error('Saved search POST error:', error);
    return NextResponse.json({ error: 'Could not save that search.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const sql = getSql();
  if (!sql) return NOT_CONFIGURED();

  const user = await getSessionUser();
  if (!user) return UNAUTHORIZED();

  try {
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: 'An id is required.' }, { status: 400 });

    await sql`delete from saved_searches where id = ${id} and user_id = ${user.id}`;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Saved search DELETE error:', error);
    return NextResponse.json({ error: 'Could not remove that search.' }, { status: 500 });
  }
}
