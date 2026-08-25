import { Item } from '../types';

export async function scrapeEbay(query: string): Promise<Item[]> {
  const apiKey = process.env.EBAY_API_KEY;
  if (!apiKey) {
    console.warn('eBay API key not configured');
    return [];
  }

  try {
    // eBay Browse API endpoint
    const url = 'https://api.ebay.com/buy/browse/v1/item_summary/search';
    
    const params = new URLSearchParams({
      q: query,
      limit: '50',
      filter: 'itemLocationCountry:US|conditionIds:{3000|4000|5000|6000}', // Used, Like New, New, Refurbished
    });

    const response = await fetch(`${url}?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      console.error(`eBay API error: ${response.statusText}`);
      return [];
    }

    const data = await response.json();
    const results = data.itemSummaries || [];

    type EbayItem = {
      itemId?: string;
      title?: string;
      price?: { value?: string; currency?: string };
      conditionId?: string;
      image?: { imageUrl?: string };
      thumbnailImages?: { imageUrl?: string }[];
      itemWebUrl?: string;
      itemCreationDate?: string;
    };

    return results.map((item: EbayItem) => ({
      id: `ebay-${item.itemId}`,
      platform: 'ebay' as const,
      title: item.title ?? 'Untitled listing',
      price: item.price?.value ? parseFloat(item.price.value) : 0,
      currency: item.price?.currency || 'USD',
      size: extractSize(item.title ?? ''),
      condition: mapEbayCondition(item.conditionId ?? ''),
      image_url: item.image?.imageUrl || item.thumbnailImages?.[0]?.imageUrl || '',
      external_url: item.itemWebUrl || '',
      listed_at: item.itemCreationDate || null,
    }));
  } catch (error) {
    console.error('eBay scraper error:', error);
    return [];
  }
}

function mapEbayCondition(conditionId: string): string | null {
  const conditionMap: { [key: string]: string } = {
    '3000': 'like new',
    '4000': 'good',
    '5000': 'fair',
    '6000': 'new',
  };
  return conditionMap[conditionId] || null;
}

function extractSize(title: string): string | null {
  const sizePatterns = [
    /\bsize\s+([XS]{1,2}L|M|L|XL|XXL|\d+)\b/i,
    /\b([XS]{1,2}L|M|L|XL|XXL|\d+)\s*(?:size|fits|fits like)/i,
    /\b(XS|S|M|L|XL|XXL)\b/i,
  ];

  for (const pattern of sizePatterns) {
    const match = title.match(pattern);
    if (match) return match[1].toUpperCase();
  }
  return null;
}
