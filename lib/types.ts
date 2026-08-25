export type Platform = 'grailed' | 'vinted' | 'depop' | 'ebay' | 'poshmark' | 'facebook' | 'vestiaire';

export type Item = {
  id: string;
  platform: Platform;
  title: string;
  price: number;
  currency: string;
  size: string | null;
  condition: string | null;
  image_url: string;
  external_url: string;
  listed_at: string | null;
};

export type Filters = {
  platforms?: Platform[];
  minPrice?: number;
  maxPrice?: number;
  size?: string;
  condition?: string;
};

export type SearchResult = {
  items: Item[];
  total: number;
  query: string;
};
