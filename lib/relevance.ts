import type { Item } from './types';

/**
 * Relevance scoring for pooled marketplace results.
 *
 * Platform search is loose — Vinted in particular returns brand-adjacent
 * items ("Polar King jacket" for "carhartt jacket"). We score every listing
 * against the query and drop only the clearly-unrelated tail.
 *
 * Scoring rather than hard keyword filtering matters: a naive
 * `title.includes(word)` test rejects 76% of results for "levis 501" because
 * titles read "Levi's 501" — an apostrophe, not a mismatch.
 */

/** Words that shouldn't drive matching. */
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'for', 'with', 'in', 'on', 'of', 'to',
  'size', 'mens', 'womens', 'men', 'women', 'boys', 'girls', 'unisex',
  'new', 'used', 'worn', 'condition', 'authentic', 'genuine', 'rare',
]);

/**
 * Garment synonyms, so "jacket" still matches a coat or an anorak.
 * Each set is bidirectional: any member matches any other.
 */
const SYNONYM_SETS: string[][] = [
  ['jacket', 'coat', 'anorak', 'parka', 'windbreaker', 'bomber', 'overshirt', 'shacket'],
  ['hoodie', 'hoody', 'sweatshirt', 'pullover', 'crewneck', 'sweater', 'jumper'],
  ['pants', 'trousers', 'chinos', 'slacks'],
  ['jeans', 'denim'],
  ['sneakers', 'trainers', 'shoes', 'kicks'],
  ['boots', 'boot'],
  ['tee', 'tshirt', 't', 'shirt', 'top'],
  ['shorts', 'short'],
  ['bag', 'backpack', 'rucksack', 'tote'],
  ['cap', 'hat', 'beanie'],
  ['vest', 'gilet'],
];

const SYNONYMS = new Map<string, Set<string>>();
for (const set of SYNONYM_SETS) {
  for (const word of set) {
    SYNONYMS.set(word, new Set(set));
  }
}

/**
 * Folds accents, strips punctuation, and collapses whitespace so "Levi's",
 * "Levis" and "LEVI’S" all normalise to the same token.
 */
export function normalize(text: string): string {
  return (
    text
      .toLowerCase()
      // Strip apostrophe variants BEFORE NFKD: it decomposes U+00B4 into a
      // space plus a combining mark, which would split "levi's" into two words.
      .replace(/['‘’ʼ´`]/g, '')
      .normalize('NFKD')
      // Drop combining diacritics left by the decomposition.
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

export function tokenize(text: string): string[] {
  return normalize(text)
    .split(' ')
    .filter((t) => t.length > 0);
}

/** Query tokens that actually carry meaning, with stopwords removed. */
export function queryTerms(query: string): string[] {
  const all = tokenize(query);
  const meaningful = all.filter((t) => !STOPWORDS.has(t) && t.length > 1);
  // If the query is nothing but stopwords, fall back to using them all.
  return meaningful.length > 0 ? meaningful : all;
}

/**
 * Levenshtein distance, capped for speed — we only care about near-misses
 * like "carhart" vs "carhartt".
 */
function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const curr = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      rowMin = Math.min(rowMin, curr[j]);
    }
    // Whole row already exceeds the cap: no better result is possible.
    if (rowMin > max) return max + 1;
    prev = curr;
  }
  return prev[b.length];
}

/** How well a single query term is represented in a set of title tokens. */
function termScore(term: string, titleTokens: Set<string>): number {
  if (titleTokens.has(term)) return 1;

  // Synonym hit — a coat really is a jacket.
  const synonyms = SYNONYMS.get(term);
  if (synonyms) {
    for (const token of titleTokens) {
      if (synonyms.has(token)) return 0.85;
    }
  }

  for (const token of titleTokens) {
    // Prefix/containment: "airmax" vs "air max", "boot" vs "boots".
    if (token.length > 3 && term.length > 3) {
      if (token.startsWith(term) || term.startsWith(token)) return 0.8;
      if (token.includes(term) || term.includes(token)) return 0.7;
    }
    // Typo tolerance, but only for words long enough to be unambiguous.
    if (term.length >= 5 && Math.abs(term.length - token.length) <= 2) {
      if (editDistance(term, token) <= 1) return 0.75;
    }
  }

  return 0;
}

export type Scored = { item: Item; relevance: number };

/**
 * Scores a listing 0..1 on how well its title covers the query terms.
 * Rare terms (brands) are weighted above common ones (garment types), so a
 * wrong-brand item can't pass on the garment word alone.
 */
export function scoreItem(item: Item, terms: string[], rarity: Map<string, number>): number {
  if (terms.length === 0) return 1;

  const titleTokens = new Set(tokenize(item.title));
  let weighted = 0;
  let totalWeight = 0;
  let anchorScore = 1;
  let anchorWeight = -1;

  for (const term of terms) {
    const weight = rarity.get(term) ?? 1;
    const score = termScore(term, titleTokens);
    totalWeight += weight;
    weighted += score * weight;

    // Track the rarest term — usually the brand or model number.
    if (weight > anchorWeight) {
      anchorWeight = weight;
      anchorScore = score;
    }
  }

  if (totalWeight === 0) return 0;
  const coverage = weighted / totalWeight;

  // The most distinctive term must be present. Without this, "Polar King
  // jacket" scores 0.5 on the garment word alone and survives a
  // "carhartt jacket" search.
  return anchorScore === 0 ? coverage * 0.35 : coverage;
}

/**
 * Inverse document frequency across the result pool. A term appearing in
 * almost every title (e.g. "jacket" in a jacket search) is less
 * discriminating than one appearing in half of them (e.g. "carhartt").
 */
function termRarity(items: Item[], terms: string[]): Map<string, number> {
  const rarity = new Map<string, number>();
  if (items.length === 0) return rarity;

  // Sampling keeps this cheap on large pools; ordering doesn't matter here.
  const sample = items.length > 400 ? items.slice(0, 400) : items;
  const tokenSets = sample.map((i) => new Set(tokenize(i.title)));

  for (const term of terms) {
    const hits = tokenSets.filter((set) => set.has(term)).length;
    const ratio = hits / sample.length;
    // Common terms floor at 0.6; rare ones peak at ~2.
    rarity.set(term, Math.max(0.6, Math.min(2, 1 / Math.max(0.15, ratio))));
  }
  return rarity;
}

/** Listings scoring below this are treated as unrelated. */
export const RELEVANCE_FLOOR = 0.55;

/**
 * Attaches a relevance score to every item and drops the unrelated tail.
 * Returns items ordered by relevance so "Relevance" sort is meaningful.
 */
export function rankByRelevance(
  items: Item[],
  query: string,
  floor = RELEVANCE_FLOOR,
): { kept: Item[]; removed: number } {
  const terms = queryTerms(query);
  if (terms.length === 0) return { kept: items, removed: 0 };

  const rarity = termRarity(items, terms);

  const scored: Scored[] = items.map((item) => ({
    item,
    relevance: scoreItem(item, terms, rarity),
  }));

  const kept = scored
    .filter((s) => s.relevance >= floor)
    .sort((a, b) => b.relevance - a.relevance)
    .map((s) => s.item);

  return { kept, removed: items.length - kept.length };
}
