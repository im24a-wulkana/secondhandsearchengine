import { Item } from '../types';
import axios from 'axios';

export async function scrapeDepop(query: string): Promise<Item[]> {
  try {
    const response = await axios.get('https://www.depop.com/api/v2/search', {
      params: {
        q: query,
        sort_by: 'newest_first',
        limit: 50,
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 8000,
    });

    const items = response.data.products || [];

    return items.map((item: any) => ({
      id: `depop-${item.id}`,
      platform: 'depop' as const,
      title: item.title,
      price: item.price_data?.price || 0,
      currency: item.price_data?.currency || 'USD',
      size: item.listing_attributes?.size || null,
      condition: item.listing_attributes?.condition || null,
      image_url: item.image?.image_url || '',
      external_url: `https://www.depop.com/products/${item.id}`,
      listed_at: item.created_at || null,
    }));
  } catch (error) {
    console.error('Depop scraper error:', error);
    return [];
  }
}
