import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { searchAllPlatforms } from '@/lib/scrapers';
import type { Item } from '@/lib/types';

/**
 * Re-checks the current price of a user's saved listings.
 *
 * The marketplaces have no "fetch listing by id" endpoint we can rely on across
 * all five, so each saved item is re-found by searching its own title and
 * matching on `external_url`. That is why this runs on demand rather than on
 * every page load — it is several marketplace searches per batch.
 */
const MAX_REFRESH = 12;

type FavoriteRow = {
  id: string;
  item_id: string;
  title: string;
  price: string | null;
  currency: string | null;
  external_url: string;
};

export async function POST() {
  const sql = getSql();
  if (!sql) {
    return NextResponse.json({ error: 'Accounts are not configured.' }, { status: 503 });
  }

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in to refresh prices.' }, { status: 401 });
  }

  try {
    // Oldest-checked first, so repeated runs work through the whole list.
    const rows = (await sql`
      select id, item_id, title, price, currency, external_url
      from favorites
      where user_id = ${user.id}
      order by price_checked_at asc nulls first
      limit ${MAX_REFRESH}
    `) as FavoriteRow[];

    if (rows.length === 0) {
      return NextResponse.json({ success: true, checked: 0, changed: [] });
    }

    const changed: {
      itemId: string;
      title: string;
      oldPrice: number;
      newPrice: number;
      currency: string | null;
    }[] = [];
    let unavailable = 0;

    for (const row of rows) {
      const oldPrice = row.price != null ? Number(row.price) : null;

      let found: Item | undefined;
      try {
        const results = await searchAllPlatforms(row.title);
        found = results.find((i) => i.external_url === row.external_url);
      } catch {
        // A failed search is not evidence the listing is gone; skip it.
        continue;
      }

      if (!found) {
        // Absent from its own title search: most likely sold or delisted.
        await sql`
          update favorites
          set is_unavailable = true, price_checked_at = now()
          where id = ${row.id}
        `;
        unavailable += 1;
        continue;
      }

      const newPrice = found.price;
      const moved = oldPrice != null && Number.isFinite(newPrice) && newPrice !== oldPrice;

      await sql`
        update favorites
        set price = ${newPrice},
            currency = ${found.currency},
            is_unavailable = false,
            initial_price = coalesce(initial_price, ${oldPrice}),
            price_checked_at = now()
        where id = ${row.id}
      `;

      if (moved) {
        await sql`
          insert into price_history (favorite_id, price, currency)
          values (${row.id}, ${newPrice}, ${found.currency})
        `;
        changed.push({
          itemId: row.item_id,
          title: row.title,
          oldPrice: oldPrice!,
          newPrice,
          currency: found.currency,
        });
      }
    }

    return NextResponse.json({
      success: true,
      checked: rows.length,
      unavailable,
      changed,
    });
  } catch (error) {
    console.error('Price refresh error:', error);
    return NextResponse.json({ error: 'Could not refresh prices.' }, { status: 500 });
  }
}
