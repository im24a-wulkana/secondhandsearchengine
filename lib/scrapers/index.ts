import { Item } from '../types';
import { scrapeEbay } from './ebay';
import { scrapeGrailed } from './grailed';
import { scrapeVinted } from './vinted';
import { scrapeDepop } from './depop';
import { scrapePoshmark } from './poshmark';
import { scrapeFacebook } from './facebook';
import { scrapeVestiaire } from './vestiaire';
import { scrapeMercari } from './mercari';

const PLATFORM_TIMEOUT = 8000;

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  try {
    return await Promise.race([
      promise,
      new Promise<null>((_, reject) => 
        setTimeout(() => reject(new Error('timeout')), ms)
      ),
    ]) as T;
  } catch {
    return null;
  }
}

export async function searchAllPlatforms(query: string): Promise<Item[]> {
  const results = await Promise.allSettled([
    withTimeout(scrapeEbay(query), PLATFORM_TIMEOUT),
    withTimeout(scrapeGrailed(query), PLATFORM_TIMEOUT),
    withTimeout(scrapeVinted(query), PLATFORM_TIMEOUT),
    withTimeout(scrapeDepop(), PLATFORM_TIMEOUT),
    withTimeout(scrapePoshmark(query), PLATFORM_TIMEOUT),
    withTimeout(scrapeFacebook(), PLATFORM_TIMEOUT),
    withTimeout(scrapeVestiaire(), PLATFORM_TIMEOUT),
    withTimeout(scrapeMercari(query), PLATFORM_TIMEOUT),
  ]);

  const allItems: Item[] = [];

  results.forEach((result) => {
    if (result.status === 'fulfilled' && result.value) {
      allItems.push(...(result.value as Item[]));
    }
  });

  // Deduplicate by external_url
  const seen = new Set<string>();
  const deduplicated = allItems.filter((item) => {
    if (seen.has(item.external_url)) {
      return false;
    }
    seen.add(item.external_url);
    return true;
  });

  return deduplicated;
}
