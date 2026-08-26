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
 * Mercari's beauty categories, mapped by sampling its own taxonomy:
 * apparel and footwear sit in 137-351, while fragrance and cosmetics cluster
 * in several disjoint bands. Ranges rather than an exhaustive list, because
 * the taxonomy is dense, undocumented and changes.
 */
const MERCARI_BEAUTY_RANGES: [number, number][] = [
  [700, 820], // fragrance (782-785 observed) and beauty tools
  [980, 985], // hair/body mists
  [1260, 1290], // cosmetics: makeup, skincare, nails
  [3430, 3450], // skincare sets and creams
  [3570, 3580], // soaps and bath products
  [3620, 3640], // misc beauty
];

function mercariIsApparel(categoryId: string): boolean {
  const n = Number.parseInt(categoryId, 10);
  if (!Number.isFinite(n)) return true; // Unknown: let the title decide.
  return !MERCARI_BEAUTY_RANGES.some(([lo, hi]) => n >= lo && n <= hi);
}

/** Grailed's own taxonomy is apparel-only, so its paths are always fine. */

/** Words that mark a listing as non-wearable, checked as whole words. */
const REJECT_WORDS = [
  // Fragrance
  'perfume', 'parfum', 'cologne', 'fragrance', 'eau de toilette', 'eau de parfum',
  'edt', 'edp', 'edc', 'aftershave', 'body mist', 'hair mist', 'body spray',
  'atomizer', 'atomiser', 'decant', 'splash', 'elixir', 'extrait',
  // Cosmetics
  'lipstick', 'lip gloss', 'mascara', 'eyeliner', 'eyeshadow', 'foundation',
  'concealer', 'blush', 'makeup', 'make-up', 'nail polish', 'serum', 'moisturizer',
  'moisturiser', 'cleanser', 'shampoo', 'conditioner', 'sunscreen', 'skincare',
  'lip balm', 'lip maximizer', 'eye cream', 'face cream', 'body lotion',
  'shower gel', 'bath gel', 'body wash', 'soap', 'deodorant', 'toner',
  'primer', 'powder', 'bronzer', 'highlighter', 'palette',
  // Homeware, media and other non-outfit goods. Carried accessories
  // (keychains, charms, phone cases) are deliberately NOT here — they are
  // things people buy alongside an outfit and belong in results.
  'mug', 'candle', 'poster', 'sticker', 'mousepad', 'notebook', 'magazine',
  'catalogue', 'catalog', 'brochure', 'dvd', 'vinyl record', 'cd',
  'figurine', 'plush', 'action figure', 'pillow', 'blanket', 'towel',
  'furniture', 'chair', 'lamp', 'rug',
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
  // Carried accessories — part of an outfit, so they stay in results.
  'keychain', 'key chain', 'keyring', 'charm', 'pin', 'badge', 'patch',
  'phone case', 'card holder', 'pouch', 'lanyard', 'cufflinks', 'tie',
  'socks', 'sock', 'headband', 'bandana', 'umbrella',
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

/**
 * Liquid/weight quantities that only appear on consumables — "50ml",
 * "1.7 oz", "150g". Clothing listings state sizes, not volumes.
 *
 * Deliberately excludes bare grams under 10 and plain numbers, which show up
 * as fabric weights ("14oz denim") — those are handled by requiring the unit
 * to sit at a word boundary and by the apparel-word override below.
 */
const VOLUME_UNIT = new RegExp(
  String.raw`\b\d{1,4}(?:[.,]\d{1,2})?\s?(?:ml|mls|cc|fl\.?\s?oz|floz|g|gr|grams?|kg)\b`,
  'i',
);

/** Fabric weights legitimately use oz, so oz alone is not disqualifying. */
const FABRIC_WEIGHT = new RegExp(String.raw`\b\d{1,2}(?:[.,]\d)?\s?oz\b`, 'i');

export function titleLooksNonApparel(title: string): boolean {
  const text = title.toLowerCase();

  // An explicit garment word means any consumable signal was incidental
  // ("Versace Perfume Pouch Crossbody Bag" is a bag).
  if (APPAREL_WORDS.some((w) => hasWord(text, w))) return false;

  if (REJECT_WORDS.some((w) => hasWord(text, w))) return true;

  // A volume without a garment word: bottles, tubes, jars.
  if (VOLUME_UNIT.test(text) && !FABRIC_WEIGHT.test(text)) return true;

  return false;
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
