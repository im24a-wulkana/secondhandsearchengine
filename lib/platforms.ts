import type { Platform } from './types';

export type PlatformMeta = {
  id: Platform;
  label: string;
  /** Brand hue, used only as a small identifying dot/chip — never as page accent. */
  color: string;
  home: string;
  /**
   * Whether this platform actually returns results today. The UI derives its
   * copy and filter list from this, so a platform that is blocked or awaiting
   * credentials is never advertised as searchable.
   */
  live: boolean;
  /** Why an inactive platform isn't returning results. */
  note?: string;
};

export const PLATFORMS: Record<Platform, PlatformMeta> = {
  grailed: { id: 'grailed', label: 'Grailed', color: '#c9a227', home: 'https://www.grailed.com', live: true },
  vinted: { id: 'vinted', label: 'Vinted', color: '#3aa17e', home: 'https://www.vinted.com', live: true },
  poshmark: { id: 'poshmark', label: 'Poshmark', color: '#3f8fd0', home: 'https://poshmark.com', live: true },
  ebay: { id: 'ebay', label: 'eBay', color: '#d1483c', home: 'https://www.ebay.com', live: true },
  mercari: { id: 'mercari', label: 'Mercari JP', color: '#e04a52', home: 'https://jp.mercari.com', live: true },
  depop: {
    id: 'depop', label: 'Depop', color: '#a05fc4', home: 'https://www.depop.com',
    live: false, note: 'Blocked to automated access',
  },
  vestiaire: {
    id: 'vestiaire', label: 'Vestiaire', color: '#7a8899', home: 'https://www.vestiairecollective.com',
    live: false, note: 'Blocked to automated access',
  },
  facebook: {
    id: 'facebook', label: 'Marketplace', color: '#4a7fe0', home: 'https://www.facebook.com/marketplace',
    live: false, note: 'Requires a login',
  },
};

export const PLATFORM_IDS = Object.keys(PLATFORMS) as Platform[];

/** Platforms that currently return results — what the UI should advertise. */
export const LIVE_PLATFORM_IDS = PLATFORM_IDS.filter((id) => PLATFORMS[id].live);

export const LIVE_PLATFORM_COUNT = LIVE_PLATFORM_IDS.length;

/** "Grailed, Vinted, Poshmark and Mercari JP" */
export function livePlatformSentence(): string {
  const names = LIVE_PLATFORM_IDS.map((id) => PLATFORMS[id].label);
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];

export function spellNumber(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

/**
 * Locale is pinned rather than left to the environment: the UI copy is English,
 * and an implicit locale made the server and client disagree (and rendered
 * German dates under a headless browser).
 */
const LOCALE = 'en-US';

/** Formats a price in its own currency rather than assuming USD. */
export function formatPrice(amount: number, currency: string): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  try {
    return new Intl.NumberFormat(LOCALE, {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: safe % 1 === 0 ? 0 : 2,
    }).format(safe);
  } catch {
    // Unknown/invalid currency code — fall back to a plain number plus the code.
    return `${safe.toFixed(2)} ${currency ?? ''}`.trim();
  }
}

/** "3 days ago" style relative time; returns null when the date is unusable. */
export function relativeTime(iso: string | null): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;

  const seconds = Math.round((then - Date.now()) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];

  const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });
  for (const [unit, secondsInUnit] of units) {
    if (Math.abs(seconds) >= secondsInUnit) {
      return rtf.format(Math.round(seconds / secondsInUnit), unit);
    }
  }
  return rtf.format(seconds, 'second');
}
