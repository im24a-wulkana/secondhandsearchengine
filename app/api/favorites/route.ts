import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

const UNAUTHORIZED = () =>
  NextResponse.json({ error: 'Sign in to manage saved listings.' }, { status: 401 });

const NOT_CONFIGURED = () =>
  NextResponse.json({ error: 'Accounts are not configured on this deployment.' }, { status: 503 });

export async function GET() {
  const sql = getSql();
  if (!sql) return NOT_CONFIGURED();

  const user = await getSessionUser();
  if (!user) return UNAUTHORIZED();

  const rows = await sql`
    select item_id, platform, title, price, currency, size, condition,
           image_url, external_url, listed_at
    from favorites
    where user_id = ${user.id}
    order by saved_at desc
  `;

  // Reshape to the client's Item type; price comes back as a numeric string.
  const data = (rows as Record<string, unknown>[]).map((row) => ({
    id: row.item_id as string,
    platform: row.platform as string,
    title: row.title as string,
    price: row.price != null ? Number(row.price) : 0,
    currency: (row.currency as string) ?? 'USD',
    size: (row.size as string) ?? null,
    condition: (row.condition as string) ?? null,
    image_url: (row.image_url as string) ?? '',
    external_url: row.external_url as string,
    listed_at: row.listed_at ? new Date(row.listed_at as string).toISOString() : null,
  }));

  return NextResponse.json({ success: true, data });
}

export async function POST(request: Request) {
  const sql = getSql();
  if (!sql) return NOT_CONFIGURED();

  const user = await getSessionUser();
  if (!user) return UNAUTHORIZED();

  try {
    const { item } = await request.json();
    if (!item?.id || !item?.external_url || !item?.title) {
      return NextResponse.json({ error: 'A complete item is required.' }, { status: 400 });
    }

    // Idempotent: saving twice updates the row instead of erroring.
    await sql`
      insert into favorites (
        user_id, item_id, platform, title, price, currency,
        size, condition, image_url, external_url, listed_at
      ) values (
        ${user.id}, ${item.id}, ${item.platform}, ${item.title},
        ${item.price ?? null}, ${item.currency ?? null}, ${item.size ?? null},
        ${item.condition ?? null}, ${item.image_url ?? null}, ${item.external_url},
        ${item.listed_at ?? null}
      )
      on conflict (user_id, item_id) do update set
        price = excluded.price,
        saved_at = now()
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Favorites POST error:', error);
    return NextResponse.json({ error: 'Could not save that listing.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const sql = getSql();
  if (!sql) return NOT_CONFIGURED();

  const user = await getSessionUser();
  if (!user) return UNAUTHORIZED();

  try {
    const { itemId } = await request.json();
    if (!itemId) {
      return NextResponse.json({ error: 'An item id is required.' }, { status: 400 });
    }

    await sql`delete from favorites where user_id = ${user.id} and item_id = ${itemId}`;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Favorites DELETE error:', error);
    return NextResponse.json({ error: 'Could not remove that listing.' }, { status: 500 });
  }
}
