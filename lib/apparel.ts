import type { Item } from './types';

/**
 * Rejects listings that aren't wearable goods.
 *
 * Searching a fashion brand pulls in a lot of adjacent stock — fragrance,
 * cosmetics, homeware, phone cases. Accessories (bags, sunglasses, jewellery,
 * belts, hats, watches) count as wearable and are kept.
 *
 * Category metadata is checked first because it's authoritative; the title
 * keyword pass only runs when a platform gives us nothing to go on.
 */

/** eBay's top-level "Clothing, Shoes & Accessories" tree. */
const EBAY_APPAREL_ROOT = '11450';

/** eBay top-level trees that are never wearable. */
const EBAY_REJECT_ROOTS = new Set([
  '26395', // Health & Beauty
  '11700', // Home & Garden
  '58058', // Computers/Tablets
  '15032', // Cell Phones & Accessories
  '293', // Consumer Electronics
  '888', // Sporting Goods (equipment, not apparel)
  '267', // Books
  '11233', // Music
  '625', // Cameras & Photo
  '220', // Toys & Hobbies
  '1249', // Video Games
  '281', // Jewelry & Watches — kept, see below
]);

/** Jewellery and watches are wearable, so allow that tree back in. */
const EBAY_ALLOW_ROOTS = new Set(['281', '11450']);

/**
 * Mercari's fragrance/cosmetics categories cluster in the 700s-800s.
 * Ranges are used because the taxonomy is dense and undocumented.
 */
function mercariIsApparel(categoryId: string): boolean {
  const n = Number.parseInt(categoryId, 10);
  if (!Number.isFinite(n)) return true; // Unknown: let the title decide.
  // 700-820 covers cosmetics, fragrance and beauty tools.
  if (n >= 700 && n <= 820) return false;
  return true;
}

/** Grailed's own taxonomy is apparel-only, so its paths are always fine. */

/** Words that mark a listing as non-wearable, checked as whole words. */
const REJECT_WORDS = [
  // Fragrance
  'perfume', 'parfum', 'cologne', 'fragrance', 'eau de toilette', 'eau de parfum',
  'edt', 'edp', 'aftershave', 'body mist',
  // Cosmetics
  'lipstick', 'lip gloss', 'mascara', 'eyeliner', 'eyeshadow', 'foundation',
  'concealer', 'blush', 'makeup', 'make-up', 'nail polish', 'serum', 'moisturizer',
  'moisturiser', 'cleanser', 'shampoo', 'conditioner', 'sunscreen', 'skincare',
  // Homeware and misc
  'mug', 'candle', 'poster', 'sticker', 'keychain', 'key chain', 'keyring',
  'phone case', 'iphone case', 'airpods', 'mousepad', 'notebook', 'magazine',
  'catalogue', 'catalog', 'brochure', 'dvd', 'cd', 'vinyl record',
  'figure', 'figurine', 'plush', 'toy',
  // Empties and samples
  'empty bottle', 'sample vial', 'tester',
];

/** Words that override a rejection — e.g. a "perfume bottle bag". */
const APPAREL_WORDS = [
  'jacket', 'coat', 'hoodie', 'sweater', 'sweatshirt', 'shirt', 'tee', 't-shirt',
  'pants', 'trousers', 'jeans', 'shorts', 'skirt', 'dress', 'blazer', 'vest',
  'cardigan', 'jumper', 'parka', 'anorak', 'overshirt', 'boots', 'sneakers',
  'shoes', 'trainers', 'loafers', 'sandals', 'bag', 'backpack', 'tote', 'purse',
  'wallet', 'belt', 'scarf', 'gloves', 'hat', 'cap', 'beanie', 'sunglasses',
  'watch', 'necklace', 'bracelet', 'ring', 'earrings',
];

function hasWord(haystack: string, needle: string): boolean {
  // Word-boundary match so "cd" does not fire inside "cdg". Every term in the
  // lists below is plain letters/spaces/hyphens, so no escaping is needed.
  const index = haystack.indexOf(needle);
  if (index === -1) return false;

  const before = index === 0 ? " " : haystack[index - 1];
  const afterIndex = index + needle.length;
  const after = afterIndex >= haystack.length ? " " : haystack[afterIndex];
  const isWordChar = (c: string) => /[a-z0-9]/.test(c);

  return !isWordChar(before) && !isWordChar(after);
}

/** True when the title clearly describes something non-wearable. */
export function titleLooksNonApparel(title: string): boolean {
  const text = title.toLowerCase();
  const rejected = REJECT_WORDS.some((w) => hasWord(text, w));
  if (!rejected) return false;
  // A garment word present alongside means the reject word was incidental.
  return !APPAREL_WORDS.some((w) => hasWord(text, w));
}

/**
 * Decides whether a listing is wearable. Category data wins where available,
 * since it comes from the marketplace itself.
 */
export function isApparel(item: Item): boolean {
  const category = item.category ?? null;

  if (item.platform === 'ebay' && category) {
    const roots = category.split(',');
    if (roots.some((r) => EBAY_ALLOW_ROOTS.has(r))) return true;
    if (roots.some((r) => EBAY_REJECT_ROOTS.has(r))) return false;
    if (roots.includes(EBAY_APPAREL_ROOT)) return true;
  }

  if (item.platform === 'mercari' && category) {
    if (!mercariIsApparel(category)) return false;
  }

  // Grailed's index is apparel-only; Vinted and Poshmark are clothing-first.
  return !titleLooksNonApparel(item.title);
}

/** Splits a result set, returning the kept items and how many were dropped. */
export function filterApparel(items: Item[]): { kept: Item[]; removed: number } {
  const kept = items.filter(isApparel);
  return { kept, removed: items.length - kept.length };
}
