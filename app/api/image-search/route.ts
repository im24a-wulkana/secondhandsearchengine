import { NextResponse } from 'next/server';
import { getClaude, isAiConfigured, AI_MODEL } from '@/lib/ai';
import { checkQuota, recordUsage } from '@/lib/quota';

/**
 * Turns an uploaded photo into search terms.
 *
 * The marketplaces only accept text queries, so this is not a reverse-image
 * search — a vision model names what it sees, and the result is fed into the
 * normal multi-platform search.
 */
const SYSTEM = `You identify secondhand clothing from a photo so it can be searched on resale marketplaces.

Name only what you can actually see. If the brand is not visible on a tag or logo, leave it out rather than guessing from silhouette — a wrong brand makes the search useless.

Build a query the way a person would type it into a resale site: brand, then model or style name if identifiable, then garment type. Keep it short. Omit colour unless it is distinctive to that model, and never include size, condition, or filler words.`;

const MAX_UPLOAD_BYTES = 5_000_000;

export const maxDuration = 60;

export async function POST(request: Request) {
  if (!isAiConfigured) {
    return NextResponse.json(
      {
        error:
          'Image search is not configured on this deployment. Add an ANTHROPIC_API_KEY to enable it.',
      },
      { status: 503 },
    );
  }

  // Metered: this endpoint spends Anthropic credits, so it needs an identity.
  const quota = await checkQuota('image-search');
  if (!quota.allowed) {
    return NextResponse.json({ error: quota.error }, { status: quota.status });
  }

  try {
    const body = await request.json();
    const image = typeof body?.image === 'string' ? body.image : '';
    const mediaType = typeof body?.mediaType === 'string' ? body.mediaType : 'image/jpeg';

    if (!image) {
      return NextResponse.json({ error: 'An image is required.' }, { status: 400 });
    }

    // The client sends a bare base64 payload; guard the decoded size.
    const approxBytes = Math.ceil((image.length * 3) / 4);
    if (approxBytes > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: 'That image is too large. Use one under 5MB.' },
        { status: 413 },
      );
    }

    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(mediaType)) {
      return NextResponse.json(
        { error: 'Use a JPEG, PNG, WebP or GIF image.' },
        { status: 415 },
      );
    }

    const claude = getClaude()!;

    const response = await claude.messages.create({
      model: AI_MODEL,
      max_tokens: 4000,
      system: SYSTEM,
      thinking: { type: 'adaptive' },
      output_config: {
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['query', 'garment', 'confidence', 'notes'],
            properties: {
              query: {
                type: 'string',
                description: 'The search query, e.g. "Carhartt Detroit jacket".',
              },
              brand: { type: 'string', description: 'Only when visibly identifiable.' },
              garment: { type: 'string', description: 'e.g. jacket, sneakers, jeans.' },
              colour: { type: 'string' },
              confidence: {
                type: 'string',
                enum: ['high', 'medium', 'low'],
                description: 'How confident the identification is.',
              },
              notes: {
                type: 'string',
                description: 'What is uncertain, or what would narrow it down.',
              },
              alternatives: {
                type: 'array',
                items: { type: 'string' },
                description: 'Up to three other queries worth trying.',
              },
            },
          },
        },
      },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
                data: image,
              },
            },
            { type: 'text', text: 'Identify this item and give me a search query for it.' },
          ],
        },
      ],
    });

    if (response.stop_reason === 'refusal') {
      return NextResponse.json({ error: 'That image could not be processed.' }, { status: 422 });
    }

    const text = response.content.find((b) => b.type === 'text');
    if (!text || text.type !== 'text') {
      return NextResponse.json({ error: 'No result was returned.' }, { status: 502 });
    }

    await recordUsage('image-search', quota.user, quota.owner);

    return NextResponse.json({
      success: true,
      result: JSON.parse(text.text),
      remaining: quota.remaining,
    });
  } catch (error) {
    console.error('Image search error:', error);
    return NextResponse.json({ error: 'Could not identify that image.' }, { status: 500 });
  }
}
