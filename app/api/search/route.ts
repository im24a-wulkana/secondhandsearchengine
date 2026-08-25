import { NextRequest, NextResponse } from 'next/server';
import { searchAllPlatforms } from '@/lib/scrapers';

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json();

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return NextResponse.json(
        { error: 'Query is required' },
        { status: 400 }
      );
    }

    const items = await searchAllPlatforms(query.trim());

    return NextResponse.json({
      success: true,
      data: items,
      total: items.length,
      query,
    });
  } catch (error) {
    console.error('Search API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
