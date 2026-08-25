import { Item } from '../types';

/**
 * Depop returns 403 to every unauthenticated request, and its own API is
 * CORS-blocked even from a real browser sitting on depop.com. Reaching it would
 * require full Playwright DOM scraping of the search page (~24 items, ~5s),
 * which exceeds the platform budget and breaks on every Depop deploy.
 *
 * Returning [] keeps the platform listed in the UI without pretending to work.
 */
export async function scrapeDepop(): Promise<Item[]> {
  return [];
}
