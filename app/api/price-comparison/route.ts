import { NextResponse } from 'next/server';
import { comparePrice, MIN_SAMPLE } from '@/lib/sold';

/**
 * Prices a listing against what comparable items actually sold for across
 * every platform that exposes sold data — not just the one it came from.
 *
 * Free: it hits the same public endpoints as search, so no quota is needed.
 */
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    const price = Number(body?.price);

    if (!title) {
      return NextResponse.json({ error: 'A listing title is required.' }, { status: 400 });
    }
    if (!Number.isFinite(price) || price <= 0) {
      return NextResponse.json({ error: 'A valid price is required.' }, { status: 400 });
    }

    const currency = typeof body?.currency === 'string' ? body.currency : 'USD';
    // An explicit query lets the client retry with a broader term.
    const query = typeof body?.query === 'string' && body.query.trim() ? body.query.trim() : undefined;

    const result = await comparePrice({ title, price, currency }, query);

    if (!result) {
      return NextResponse.json({
        success: true,
        result: null,
        reason: `Fewer than ${MIN_SAMPLE} comparable sales were found, so any average would be misleading.`,
      });
    }

    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error('Price comparison error:', error);
    return NextResponse.json({ error: 'Could not compare prices.' }, { status: 500 });
  }
}
