import { NextResponse } from 'next/server';
import { isSupabaseConfigured } from '@/lib/supabase';

const NOT_CONFIGURED = NextResponse.json(
  { error: 'Accounts are not configured on this deployment.' },
  { status: 503 },
);

export async function GET() {
  if (!isSupabaseConfigured) return NOT_CONFIGURED;
  // TODO: read the session and return this user's favorites.
  return NextResponse.json({ success: true, data: [] });
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured) return NOT_CONFIGURED;
  try {
    const { item } = await request.json();
    if (!item?.external_url) {
      return NextResponse.json({ error: 'An item is required.' }, { status: 400 });
    }
    // TODO: read the session and insert into `favorites`.
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  if (!isSupabaseConfigured) return NOT_CONFIGURED;
  try {
    const { itemId } = await request.json();
    if (!itemId) {
      return NextResponse.json({ error: 'An item id is required.' }, { status: 400 });
    }
    // TODO: read the session and delete from `favorites`.
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
}
