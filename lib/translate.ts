/**
 * Japanese → English translation for listing titles, via DeepL.
 *
 * Optional by design: with no DEEPL_API_KEY the original titles pass through
 * untouched rather than the platform failing. DeepL's free tier allows
 * 500k characters/month, so results are cached aggressively and titles that
 * contain no Japanese are never sent.
 */
const FREE_ENDPOINT = 'https://api-free.deepl.com/v2/translate';
const PRO_ENDPOINT = 'https://api.deepl.com/v2/translate';
const REQUEST_TIMEOUT = 6000;
/** DeepL accepts up to 50 text params per request. */
const BATCH_SIZE = 50;
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
const MAX_CACHE = 5000;

export const isTranslationConfigured = Boolean(process.env.DEEPL_API_KEY);

type CacheEntry = { text: string; expires: number };
const cache = new Map<string, CacheEntry>();

function readCache(key: string): string | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expires < Date.now()) {
    cache.delete(key);
    return null;
  }
  return hit.text;
}

function writeCache(key: string, text: string): void {
  if (cache.size >= MAX_CACHE) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { text, expires: Date.now() + CACHE_TTL });
}

/** Hiragana, katakana, or CJK ideographs. */
const JAPANESE = /[぀-ゟ゠-ヿ一-龯]/;

export function hasJapanese(text: string): boolean {
  return JAPANESE.test(text);
}

async function translateBatch(texts: string[], key: string): Promise<string[] | null> {
  // A free-tier key always ends in ":fx"; anything else is a Pro key.
  const endpoint = key.endsWith(':fx') ? FREE_ENDPOINT : PRO_ENDPOINT;

  const params = new URLSearchParams();
  params.set('source_lang', 'JA');
  params.set('target_lang', 'EN');
  for (const text of texts) params.append('text', text);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${key}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    });

    if (!res.ok) {
      // 456 = monthly quota exhausted; log it plainly, it's the likely failure.
      console.error(
        res.status === 456
          ? 'DeepL quota exhausted for this billing period.'
          : `DeepL request failed: ${res.status}`,
      );
      return null;
    }

    const data = await res.json();
    const out = (data?.translations ?? []).map((t: { text?: string }) => t.text ?? '');
    return out.length === texts.length ? out : null;
  } catch (error) {
    console.error('DeepL request error:', error);
    return null;
  }
}

/**
 * Translates the given strings, preserving order. Anything that can't be
 * translated — no key, quota hit, network failure — comes back unchanged.
 */
export async function translateToEnglish(texts: string[]): Promise<string[]> {
  const key = process.env.DEEPL_API_KEY;
  if (!key) return texts;

  const result = [...texts];
  // Only spend quota on strings that actually contain Japanese and aren't cached.
  const pending: { index: number; text: string }[] = [];

  texts.forEach((text, index) => {
    if (!text || !hasJapanese(text)) return;
    const cached = readCache(text);
    if (cached !== null) {
      result[index] = cached;
      return;
    }
    pending.push({ index, text });
  });

  if (pending.length === 0) return result;

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const slice = pending.slice(i, i + BATCH_SIZE);
    const translated = await translateBatch(
      slice.map((p) => p.text),
      key,
    );
    if (!translated) break; // Leave the rest as the original text.

    slice.forEach((p, j) => {
      const text = translated[j];
      if (!text) return;
      result[p.index] = text;
      writeCache(p.text, text);
    });
  }

  return result;
}
