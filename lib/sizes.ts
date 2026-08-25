/**
 * Size taxonomy.
 *
 * Grailed's index normalises everything to US/alpha sizing under a
 * `category_size` facet ("footwear.10", "bottoms.32", "tailoring.40r").
 * Shoppers think in EU numbers too, so we present both and convert to the
 * US value before querying.
 */

export type SizeGroupId = 'alpha' | 'waist' | 'footwear' | 'tailoring';

export type SizeOption = {
  /** Canonical US/alpha value — what actually gets sent to the platform. */
  value: string;
  /** What the shopper sees, e.g. "10 (EU 44)". */
  label: string;
  /** Extra strings that should also match this size when parsing listings. */
  aliases?: string[];
};

export type SizeGroup = {
  id: SizeGroupId;
  label: string;
  /** Grailed category_path prefixes this group maps onto. */
  facetPrefixes: string[];
  options: SizeOption[];
};

/** US men's shoe → EU, the conversion shoppers most often need. */
const SHOE_EU: Record<string, string> = {
  '4': '36', '4.5': '36.5', '5': '37.5', '5.5': '38', '6': '39', '6.5': '39.5',
  '7': '40', '7.5': '40.5', '8': '41', '8.5': '42', '9': '42.5', '9.5': '43',
  '10': '44', '10.5': '44.5', '11': '45', '11.5': '45.5', '12': '46',
  '12.5': '47', '13': '47.5', '14': '48.5', '15': '49.5',
};

const ALPHA = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL'];

const SHOE_SIZES = [
  '4', '4.5', '5', '5.5', '6', '6.5', '7', '7.5', '8', '8.5', '9', '9.5',
  '10', '10.5', '11', '11.5', '12', '12.5', '13', '14', '15',
];

// Waist measurements in inches, as sold.
const WAIST = Array.from({ length: 21 }, (_, i) => String(24 + i));

// Jacket chest + length, e.g. 40R / 40S / 40L.
const TAILORING = (() => {
  const out: string[] = [];
  for (let chest = 34; chest <= 54; chest += 2) {
    for (const len of ['S', 'R', 'L']) out.push(`${chest}${len}`);
  }
  return out;
})();

export const SIZE_GROUPS: SizeGroup[] = [
  {
    id: 'alpha',
    label: 'Clothing',
    facetPrefixes: [
      'tops', 'outerwear', 'womens_tops', 'womens_outerwear', 'womens_dresses',
    ],
    options: ALPHA.map((value) => ({ value, label: value })),
  },
  {
    id: 'waist',
    label: 'Waist',
    facetPrefixes: ['bottoms', 'womens_bottoms'],
    options: WAIST.map((value) => ({ value, label: `${value}"` })),
  },
  {
    id: 'footwear',
    label: 'Shoes (US)',
    facetPrefixes: ['footwear', 'womens_footwear'],
    options: SHOE_SIZES.map((value) => ({
      value,
      label: SHOE_EU[value] ? `${value} · EU ${SHOE_EU[value]}` : value,
      aliases: SHOE_EU[value] ? [SHOE_EU[value]] : undefined,
    })),
  },
  {
    id: 'tailoring',
    label: 'Tailoring',
    facetPrefixes: ['tailoring'],
    options: TAILORING.map((value) => ({ value, label: value })),
  },
];

/** Flat lookup of every selectable size value. */
export const ALL_SIZE_VALUES = SIZE_GROUPS.flatMap((g) => g.options.map((o) => o.value));

export function groupForSize(value: string): SizeGroup | undefined {
  const needle = value.toUpperCase();
  return SIZE_GROUPS.find((g) => g.options.some((o) => o.value.toUpperCase() === needle));
}

/**
 * Grailed `category_size` facet values for a chosen size, across every
 * category in its group (e.g. "10" → footwear.10 and womens_footwear.10).
 */
export function grailedSizeFacets(value: string): string[] {
  const group = groupForSize(value);
  if (!group) return [];
  return group.facetPrefixes.map((prefix) => `category_size:${prefix}.${value.toLowerCase()}`);
}

/**
 * Normalises a listing's free-text size so client-side filtering can compare
 * it to a selected value. Handles EU shoe sizes and stray "US 10" / "EU 44".
 */
export function normalizeSize(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const text = raw.trim().toUpperCase();
  if (!text || text === 'ONE SIZE' || text === 'ONE_SIZE') return null;

  // Spelled-out sizes, e.g. Poshmark's "X-LARGE REGULAR".
  const spelled = text
    .replace(/\bX-?LARGE\b/g, 'XL')
    .replace(/\bXX-?LARGE\b/g, 'XXL')
    .replace(/\bLARGE\b/g, 'L')
    .replace(/\bMEDIUM\b/g, 'M')
    .replace(/\bX-?SMALL\b/g, 'XS')
    .replace(/\bSMALL\b/g, 'S')
    // "Regular" is the default length and carries no extra meaning here.
    .replace(/\bREGULAR\b/g, '')
    .trim();

  // Alpha sizes, including the XXL / 2XL spellings. Tall variants ("XLT",
  // "2XLT") fold into their base size — we don't filter on length.
  const alpha = spelled.replace(/\s+/g, '').replace(/T$/, '');
  const alphaMap: Record<string, string> = {
    '2XL': 'XXL', '2XS': 'XXS', '5XL': '4XL',
  };
  if (alphaMap[alpha]) return alphaMap[alpha];
  if (ALPHA.includes(alpha)) return alpha;

  // Tailoring, e.g. "40R" or "40 R".
  const tailoring = alpha.match(/^(\d{2})(S|R|L)$/);
  if (tailoring) return `${tailoring[1]}${tailoring[2]}`;

  // Explicit EU shoe sizing → US.
  const eu = text.match(/EU\s*(\d{2}(?:\.5)?)/);
  if (eu) {
    const us = Object.entries(SHOE_EU).find(([, v]) => v === eu[1]);
    if (us) return us[0];
  }

  // Plain numbers: waist and US shoe sizes share this space, so return the
  // number and let the caller's group context disambiguate.
  const num = text.match(/^(?:US\s*)?(\d{1,2}(?:\.5)?)"?$/);
  if (num) return num[1];

  return null;
}
