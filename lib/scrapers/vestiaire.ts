import { Item } from '../types';

/**
 * Vestiaire Collective sits behind Cloudflare. Its search API answers from a
 * real browser but 403s from Node even with byte-identical headers, so the
 * block is on the TLS fingerprint rather than anything we can send.
 *
 * Returning [] keeps the platform listed in the UI without pretending to work.
 */
export async function scrapeVestiaire(): Promise<Item[]> {
  return [];
}
