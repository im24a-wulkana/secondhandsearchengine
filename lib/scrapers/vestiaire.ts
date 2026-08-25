import { Item } from '../types';
import axios from 'axios';

export async function scrapeVestiaire(query: string): Promise<Item[]> {
  try {
    const response = await axios.get('https://www.vestiairecollective.com/api/v2/catalog/search_products', {
      params: {
        search_text: query,
        per_page: 50,
        page: 1,
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 8000,
    });

    const items = response.data.products || response.data.results || [];

    return items.map((item: any) => ({
      id: `vestiaire-${item.id}`,
      platform: 'vestiaire' as const,
      title: item.title || item.name,
      price: item.price ? parseFloat(item.price) : 0,
      currency: item.currency || 'EUR',
      size: item.size || null,
      condition: item.condition || null,
      image_url: item.image?.image_url || item.image_url || '',
      external_url: `https://www.vestiairecollective.com/p/${item.id}`,
      listed_at: item.created_at || null,
    }));
  } catch (error) {
    console.error('Vestiaire scraper error:', error);
    return [];
  }
}
