import type { Platform } from './types';

export type PlatformMeta = {
  id: Platform;
  label: string;
  /** Brand hue, used only as a small identifying dot/chip — never as page accent. */
  color: string;
  home: string;
};

export const PLATFORMS: Record<Platform, PlatformMeta> = {
  grailed: { id: 'grailed', label: 'Grailed', color: '#c9a227', home: 'https://www.grailed.com' },
  vinted: { id: 'vinted', label: 'Vinted', color: '#3aa17e', home: 'https://www.vinted.com' },
  depop: { id: 'depop', label: 'Depop', color: '#a05fc4', home: 'https://www.depop.com' },
  ebay: { id: 'ebay', label: 'eBay', color: '#d1483c', home: 'https://www.ebay.com' },
  poshmark: { id: 'poshmark', label: 'Poshmark', color: '#3f8fd0', home: 'https://poshmark.com' },
  facebook: { id: 'facebook', label: 'Marketplace', color: '#4a7fe0', home: 'https://www.facebook.com/marketplace' },
  vestiaire: { id: 'vestiaire', label: 'Vestiaire', color: '#7a8899', home: 'https://www.vestiairecollective.com' },
  mercari: { id: 'mercari', label: 'Mercari JP', color: '#e04a52', home: 'https://jp.mercari.com' },
};

export const PLATFORM_IDS = Object.keys(PLATFORMS) as Platform[];

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
