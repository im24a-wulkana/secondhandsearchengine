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

  /**
   * Optional detail fields. Coverage varies by platform — Poshmark returns a
   * description and many photos, Vinted a couple, Grailed only a cover shot —
   * so the detail view renders whatever is present.
   */
  description?: string | null;
  images?: string[];
  brand?: string | null;
  color?: string | null;
  seller?: { name?: string | null; rating?: number | null; location?: string | null } | null;
  /** Price including buyer fees, where the platform exposes it. */
  total_price?: number | null;
  favourites?: number | null;
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
