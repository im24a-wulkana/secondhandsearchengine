import type { Item } from './types';
import type { SearchRecord } from './history';

/**
 * Builds a "For You" feed from recent search history.
 *
 * Strategy: treat each past search as a weighted interest signal, fetch
 * listings for the strongest ones, then re-rank the pooled results so the feed
 * is a blend rather than a concatenation of separate searches.
 */

const DAY_MS = 86_400_000;
/** A search's weight halves roughly every 10 days. */
const HALF_LIFE_DAYS = 10;

/** Words that carry no signal about what someone is shopping for. */
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'for', 'with', 'in', 'on', 'of', 'to',
  'size', 'mens', 'womens', 'men', 'women', 'vintage', 'used', 'new',
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^['-]+|['-]+$/g, ''))
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/**
 * Recency- and frequency-weighted score for a past search.
 * Repeat searches count for more, but with diminishing returns.
 */
export function searchWeight(record: SearchRecord, now = Date.now()): number {
  const ageDays = Math.max(0, (now - record.at) / DAY_MS);
  const recency = Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
  const frequency = 1 + Math.log2(Math.max(1, record.count));
  return recency * frequency;
}

/** The searches worth spending a network request on, strongest first. */
export function topInterests(history: SearchRecord[], limit = 3, now = Date.now()): SearchRecord[] {
  return [...history]
    .sort((a, b) => searchWeight(b, now) - searchWeight(a, now))
    .slice(0, limit);
}

/**
 * Term interest profile across all history — used to score listings that came
 * back from one search but also match the user's other interests.
 */
export function buildTermProfile(
  history: SearchRecord[],
  now = Date.now(),
): Map<string, number> {
  const profile = new Map<string, number>();
  for (const record of history) {
    const weight = searchWeight(record, now);
    for (const token of tokenize(record.query)) {
      profile.set(token, (profile.get(token) ?? 0) + weight);
    }
  }
  return profile;
}

/** Median price of the listings a user has been looking at. */
function medianPrice(items: Item[]): number | null {
  const prices = items.map((i) => i.price).filter((p) => p > 0).sort((a, b) => a - b);
  if (prices.length === 0) return null;
  const mid = Math.floor(prices.length / 2);
  return prices.length % 2 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;
}

export type ScoredItem = { item: Item; score: number; matched: string[] };

/**
 * Ranks pooled listings against the interest profile.
 *
 * Score combines:
 *  - term overlap with the weighted profile (dominant signal)
 *  - listing freshness, so the feed doesn't stagnate
 *  - price proximity to what the user typically browses
 */
export function rankItems(
  items: Item[],
  profile: Map<string, number>,
  now = Date.now(),
): ScoredItem[] {
  if (items.length === 0) return [];

  const maxTermWeight = Math.max(1, ...profile.values());
  const typicalPrice = medianPrice(items);

  const scored = items.map((item) => {
    const tokens = new Set(tokenize(item.title));

    let overlap = 0;
    const matched: string[] = [];
    for (const token of tokens) {
      const weight = profile.get(token);
      if (weight) {
        overlap += weight;
        matched.push(token);
      }
    }
    // Normalised so a long title can't win on sheer word count.
    const relevance = Math.min(1, overlap / maxTermWeight);

    const listedAt = item.listed_at ? new Date(item.listed_at).getTime() : NaN;
    const freshness = Number.isNaN(listedAt)
      ? 0.3 // Unknown date: neither rewarded nor buried.
      : Math.pow(0.5, Math.max(0, (now - listedAt) / DAY_MS) / 30);

    // Closer to the user's usual price band scores higher; falls off gently.
    const priceFit =
      typicalPrice && item.price > 0
        ? 1 / (1 + Math.abs(Math.log(item.price / typicalPrice)))
        : 0.5;

    const score = relevance * 0.65 + freshness * 0.2 + priceFit * 0.15;
    return { item, score, matched };
  });

  return scored.sort((a, b) => b.score - a.score);
}

/**
 * Prevents one search term from dominating the feed by capping how many
 * consecutive listings may come from the same interest bucket.
 */
export function diversify(scored: ScoredItem[], maxPerRun = 3): ScoredItem[] {
  const out: ScoredItem[] = [];
  const held: ScoredItem[] = [];
  let lastKey = '';
  let run = 0;

  for (const entry of scored) {
    const key = entry.matched[0] ?? '';
    if (key && key === lastKey && run >= maxPerRun) {
      held.push(entry);
      continue;
    }
    if (key === lastKey) {
      run += 1;
    } else {
      lastKey = key;
      run = 1;
    }
    out.push(entry);
  }

  // Held-back items keep their ranking, just below the diversified run.
  return [...out, ...held];
}
