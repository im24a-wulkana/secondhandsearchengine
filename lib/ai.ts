import Anthropic from '@anthropic-ai/sdk';

/**
 * Shared Claude client for the vision-backed features.
 *
 * Optional by design: with no ANTHROPIC_API_KEY the callers return a
 * "not configured" state rather than the feature erroring.
 */
export const isAiConfigured = Boolean(process.env.ANTHROPIC_API_KEY);

let client: Anthropic | null = null;

export function getClaude(): Anthropic | null {
  if (!isAiConfigured) return null;
  if (!client) client = new Anthropic();
  return client;
}

export const AI_MODEL = 'claude-opus-5';

/** Marketplace photos vary wildly in size; cap what we send per request. */
export const MAX_IMAGES = 8;

/**
 * Downloads listing photos and returns them as base64 image blocks.
 * Anything that fails to fetch is skipped rather than failing the request.
 */
export async function fetchImageBlocks(
  urls: string[],
  limit = MAX_IMAGES,
): Promise<Anthropic.ImageBlockParam[]> {
  const selected = urls.filter(Boolean).slice(0, limit);

  const results = await Promise.allSettled(
    selected.map(async (url) => {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(String(response.status));

      const type = response.headers.get('content-type') ?? '';
      const mediaType = type.includes('png')
        ? 'image/png'
        : type.includes('webp')
          ? 'image/webp'
          : type.includes('gif')
            ? 'image/gif'
            : 'image/jpeg';

      const buffer = Buffer.from(await response.arrayBuffer());
      // Skip anything over ~4MB; the API rejects oversized images.
      if (buffer.byteLength > 4_000_000) throw new Error('too large');

      return {
        type: 'image' as const,
        source: {
          type: 'base64' as const,
          media_type: mediaType as 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif',
          data: buffer.toString('base64'),
        },
      };
    }),
  );

  const blocks: Anthropic.ImageBlockParam[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') blocks.push(result.value);
  }
  return blocks;
}
