import { NextResponse } from 'next/server';
import { isSupabaseConfigured } from '@/lib/supabase';

const NOT_CONFIGURED = NextResponse.json(
  { error: 'Accounts are not configured on this deployment.' },
  { status: 503 },
);

export async function GET() {
  if (!isSupabaseConfigured) return NOT_CONFIGURED;
  // TODO: read the session and return this user's saved searches.
  return NextResponse.json({ success: true, data: [] });
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured) return NOT_CONFIGURED;
  try {
    const { name, query } = await request.json();
    if (!name || !query) {
      return NextResponse.json({ error: 'A name and query are required.' }, { status: 400 });
    }
    // TODO: read the session and insert into `saved_searches`.
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  if (!isSupabaseConfigured) return NOT_CONFIGURED;
  try {
    const { searchId } = await request.json();
    if (!searchId) {
      return NextResponse.json({ error: 'A search id is required.' }, { status: 400 });
    }
    // TODO: read the session and delete from `saved_searches`.
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
}
