import { NextResponse } from 'next/server';
import { getClaude, isAiConfigured, AI_MODEL, fetchImageBlocks } from '@/lib/ai';
import { checkQuota, recordUsage } from '@/lib/quota';

/**
 * Counterfeit red-flag assistant.
 *
 * Deliberately NOT an authentication service. A vision model reading listing
 * photos cannot do what a professional authenticator does — stitch counts,
 * hardware weight, date codes and in-hand feel are not recoverable from a
 * seller's phone pictures. It reports specific, checkable observations and
 * says what to verify before buying; it never returns a real/fake verdict.
 */
const SYSTEM = `You help secondhand shoppers spot counterfeit warning signs in marketplace listing photos.

You are NOT an authentication service and must never claim an item is authentic or fake. You have listing photos only — not the item — so you cannot see stitch density, hardware weight, material feel, or date codes. Say so when it matters.

Look for concrete, visible signals:
- Brand tags and labels: typeface, letter spacing, spelling, stitching around the label, placement
- Embroidery and logos: stitch neatness, thread density, symmetry, logo proportions
- Size and care labels: expected format for the brand and era, language, laundry symbols
- Hardware: zip pulls, buttons, rivets, engraving depth and alignment
- Construction: seam alignment, pattern matching, lining, edge finishing
- Listing quality: stock photos rather than the actual item, missing tag shots, unusually low price for the model

When web search is available, use it for documented authentication markers (tag formats by era, serial layouts, known counterfeit tells) and prefer sourced facts over general advice. When it is not available, work only from what the photos show and from what you already know — do not invent brand-specific claims you cannot support.

Return findings as concerns and positives, each tied to what you can actually see. If the photos do not show enough — no tag shots, low resolution — say that plainly rather than speculating. Assume the buyer will act on what you write, so be precise about certainty.`;

type Body = {
  title?: string;
  brand?: string | null;
  price?: number;
  currency?: string;
  images?: string[];
  description?: string | null;
  platform?: string;
  /**
   * Opt in to brand research. Measured cost: ~15s without, ~170s with — the
   * searches dominate the turn — so it is off unless asked for.
   */
  deepResearch?: boolean;
};

export const maxDuration = 120;

export async function POST(request: Request) {
  if (!isAiConfigured) {
    return NextResponse.json(
      {
        error:
          'Authenticity checks are not configured on this deployment. Add an ANTHROPIC_API_KEY to enable them.',
      },
      { status: 503 },
    );
  }

  // Metered: this endpoint spends Anthropic credits, so it needs an identity.
  const quota = await checkQuota('authenticate');
  if (!quota.allowed) {
    return NextResponse.json({ error: quota.error }, { status: quota.status });
  }

  try {
    const body: Body = await request.json();
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) {
      return NextResponse.json({ error: 'A listing title is required.' }, { status: 400 });
    }

    const images = Array.isArray(body.images) ? body.images : [];
    const imageBlocks = await fetchImageBlocks(images);

    if (imageBlocks.length === 0) {
      return NextResponse.json(
        { error: 'None of this listing’s photos could be loaded, so there is nothing to check.' },
        { status: 422 },
      );
    }

    const facts = [
      `Title: ${title}`,
      body.brand ? `Brand: ${body.brand}` : null,
      body.price ? `Price: ${body.price} ${body.currency ?? 'USD'}` : null,
      body.platform ? `Marketplace: ${body.platform}` : null,
      body.description ? `Seller description: ${body.description.slice(0, 1500)}` : null,
      `Photos provided: ${imageBlocks.length}`,
    ]
      .filter(Boolean)
      .join('\n');

    const claude = getClaude()!;

    const response = await claude.messages.create({
      model: AI_MODEL,
      max_tokens: 8000,
      system: SYSTEM,
      thinking: { type: 'adaptive' },
      // Web search is what makes this slow (~15s vs ~170s), so it is opt-in.
      ...(body.deepResearch
        ? { tools: [{ type: 'web_search_20260209' as const, name: 'web_search', max_uses: 2 }] }
        : {}),
      output_config: {
        // `medium` roughly halves the turn: this is observation from photos
        // rather than deep reasoning, so the quality cost is small.
        effort: 'medium',
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['summary', 'concerns', 'positives', 'checkBeforeBuying', 'photoQuality'],
            properties: {
              summary: {
                type: 'string',
                description: 'Two or three sentences on what the photos do and do not show.',
              },
              photoQuality: {
                type: 'string',
                enum: ['sufficient', 'limited', 'insufficient'],
                description: 'Whether the photos support any meaningful assessment.',
              },
              concerns: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['area', 'observation', 'severity'],
                  properties: {
                    area: { type: 'string', description: 'e.g. Brand tag, Embroidery, Hardware' },
                    observation: {
                      type: 'string',
                      description: 'What is visible and why it is a concern.',
                    },
                    severity: { type: 'string', enum: ['low', 'medium', 'high'] },
                  },
                },
              },
              positives: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['area', 'observation'],
                  properties: {
                    area: { type: 'string' },
                    observation: { type: 'string' },
                  },
                },
              },
              checkBeforeBuying: {
                type: 'array',
                items: { type: 'string' },
                description: 'Specific things to ask the seller or inspect in person.',
              },
            },
          },
        },
      },
      messages: [
        {
          role: 'user',
          content: [
            ...imageBlocks,
            {
              type: 'text',
              text: `Review this listing for counterfeit warning signs.\n\n${facts}`,
            },
          ],
        },
      ],
    });

    if (response.stop_reason === 'refusal') {
      return NextResponse.json(
        { error: 'This listing could not be reviewed.' },
        { status: 422 },
      );
    }

    const text = response.content.find((b) => b.type === 'text');
    if (!text || text.type !== 'text') {
      return NextResponse.json({ error: 'No result was returned.' }, { status: 502 });
    }

    // Recorded only on success, so a failed call never costs the user a check.
    await recordUsage('authenticate', quota.user, quota.owner);

    return NextResponse.json({
      success: true,
      result: JSON.parse(text.text),
      imagesReviewed: imageBlocks.length,
      remaining: quota.remaining,
      deepResearch: Boolean(body.deepResearch),
    });
  } catch (error) {
    console.error('Authenticity check error:', error);
    return NextResponse.json({ error: 'The authenticity check failed.' }, { status: 500 });
  }
}
