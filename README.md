# 🔍 OneRail

Every secondhand rail, searched at once — one query across every live
marketplace, normalised into a single ranked grid.

**Live:** https://onerail-six.vercel.app
**Run locally:** `npm run dev` → http://localhost:3000

## Features

### ✨ Core Features
- **Unified Search** - One query across every live marketplace at once
  - Grailed
  - Vinted
  - Poshmark
  - Mercari Japan (titles translated, prices converted to USD)

  eBay, Depop, Vestiaire and Facebook Marketplace are wired up but inactive —
  see [status](#current-status-of-the-data-layer). The UI derives its copy and
  filters from `PLATFORMS[].live` in `lib/platforms.ts`, so nothing advertises
  a marketplace that can't return results.

- **Smart Filtering** - Filter results by:
  - Price range (min/max)
  - Size — 84 values across four groups: clothing (XXS–4XL), waist (24"–44"),
    shoes (US 4–15 with half sizes, labelled with EU equivalents), and
    tailoring (34S–54L)
  - Condition (new, like new, good, fair)
  - Platform (multi-select)

- **For You feed** - Personalized listings drawn from your recent searches.
  Requires an account.

- **Sorting** - Sort by:
  - Relevance (default)
  - Price low → high
  - Price high → low
  - Newest first

- **Light & dark themes**
  - Warm neutral palette with a marigold accent
  - Follows the OS by default; an in-app toggle overrides it and persists
  - No flash of the wrong theme on load

- **Responsive Layout**
  - 2 columns on mobile, 3 on tablet, 4 on desktop
  - Filters become a bottom-sheet drawer on small screens

- **Accessible by default**
  - Visible focus rings, labelled controls, skip-to-content link
  - Honors `prefers-reduced-motion`

### 🔐 Accounts
- Email + password sign-up and sign-in (bcrypt, httpOnly signed session cookie)
- Saved listings, scoped per user
- **For you** feed — members only, gated on both the page and the API
- Recent searches under the search bar (per browser, works signed out)

## Tech Stack

- **Framework**: Next.js 16 (App Router, Turbopack, React 19.2)
- **Styling**: Tailwind CSS v4 with CSS-variable design tokens
- **Database**: Neon (serverless Postgres over HTTP)
- **Auth**: email + password, bcrypt hashes, signed JWT session cookie
- **Scraping**:
  - Axios + Cheerio for static pages
  - Playwright for JavaScript-rendered pages
  - Official eBay Browse API
- **Deployment**: Vercel-ready

## Current status of the data layer

**Five marketplaces are live.** Grailed, Vinted, Poshmark and Mercari JP need
no credentials; eBay uses its official API. The other three are blocked:

| Platform   | Status                                                      |
| ---------- | ----------------------------------------------------------- |
| **Grailed**| ✅ **Live** — public Algolia index, no key required           |
| **Vinted** | ✅ **Live** — public catalog API via anonymous session cookies |
| **Poshmark**| ✅ **Live** — internal JSON API, no key or browser needed      |
| **Mercari JP**| ✅ **Live** — DPoP-signed public API, no account. Titles translated, prices converted to USD |
| **eBay**   | ✅ **Live** — official Browse API; tokens minted and refreshed automatically |
| Depop      | 403 to all requests; even a real browser on depop.com is CORS-blocked from its own API. Would need full Playwright DOM scraping |
| Vestiaire  | Cloudflare. Its `search.vestiairecollective.com` POST API works **only from a real browser** — identical headers from Node still 403, so Cloudflare is fingerprinting the TLS handshake |
| Facebook   | Stub — returns `[]`                                          |

A search currently returns roughly **2,080 listings** (~570 eBay, 500 Grailed,
~520 Vinted, ~190 Poshmark, ~295 Mercari JP) in about 6-8 seconds. Supabase env vars are blank, so the
favorites and saved-search routes return `503` rather than crashing.

### How the eBay scraper works

The only platform here with an official, sanctioned API. `lib/scrapers/ebay.ts`
uses the **Browse API** with client-credentials OAuth.

Access tokens expire after **2 hours**, so the scraper mints one from
`EBAY_CLIENT_ID` / `EBAY_CLIENT_SECRET` and caches it until a minute before
expiry — there is no token to paste or refresh by hand.

Gotchas:
- Offsets are independent, so three pages of 200 run **in parallel** (~570
  unique items in about a second).
- eBay sends **finer-grained condition ids than it documents** — `2990`
  ("Pre-owned - Excellent"), `3010` ("Fair"), `1750` ("New with imperfections").
  Mapping only the documented set dropped the condition on 38% of listings, so
  unknown ids fall back to a numeric range check.
- Production keys additionally require the account-deletion endpoint — see
  [DEPLOY.md](DEPLOY.md).

### How the Mercari JP scraper works

Mercari's public search API requires a **DPoP proof** (RFC 9449) — a self-signed
ES256 JWT — but *not* an account. `lib/scrapers/mercari.ts` generates an
ephemeral keypair at startup and signs each request; without the header the API
returns `401 missing auth token`. One keypair per process is enough: Mercari
only checks the proof is internally consistent.

Gotchas:
- Pages chain through `nextPageToken`, so they can't be parallelised. Three
  pages of 120 returns ~295 items in under 2s.
- Two separate image CDNs — `static.mercdn.net` for marketplace items and
  `assets.mercari-shops-static.com` for shop items. Missing the second one
  crashes the grid with an unconfigured-host error.
- Sellers ship **within Japan only**, so `external_url` points at
  `buyee.jp/mercari/item/{id}` and each item carries a `proxy` flag the UI
  renders as a "via Buyee" badge.

**Titles** are translated JA→EN with DeepL (`lib/translate.ts`) and **prices**
converted JPY→USD (`lib/currency.ts`), with the original yen figure kept for the
detail view. Both degrade gracefully: no `DEEPL_API_KEY` leaves titles in
Japanese, and an unreachable FX API falls back to a cached or hardcoded rate
rather than showing $0.

### How the Poshmark scraper works

Poshmark's storefront is backed by an internal JSON API at `/vm-rest/posts`
that answers unauthenticated requests — no key, cookie jar, or browser needed.

Gotchas:
- **`max_id` must go inside the `request` JSON object.** Passing it as a query
  parameter silently returns page 1 again *along with a valid-looking
  `next_max_id`*, so pagination appears to work while yielding duplicates.
- Pages chain through that cursor, so they **cannot** be fetched in parallel.
  Four pages takes ~4s; eight would exceed the 8s platform budget.
- Conditions are opaque slugs (`nwt`, `uln`, `ug`, `uf`); unmapped values stay
  `null` rather than being guessed.
- Listing URLs are built as `/listing/{slug}-{id}`. The bare-id form works too
  but 301-redirects.

### How the Vinted scraper works

Vinted's `/api/v2/catalog/items` endpoint returns **401** to cold requests: it
requires the anonymous session cookies any page load hands out. So
`lib/scrapers/vinted.ts` fetches the homepage once, keeps the `Set-Cookie` jar
(cached ~10 min), and uses it for searches.

Gotchas:
- A page is **capped at 96 items** regardless of `per_page`, so results are
  paginated. Pages are fetched **in parallel** — serially, 5 pages takes ~11s
  and blows the orchestrator's 8s budget; in parallel, 8 pages take ~2s.
- `price` is a `{amount, currency_code}` **object**, not a flat string, and the
  listing URL comes from `url`/`path`. The original parser assumed both were
  flat and produced `NaN` prices.
- A CSRF token used to be required. The `"CSRF_TOKEN"` value no longer appears
  in Vinted's HTML and the API accepts requests without it.

### How the Grailed scraper works

Grailed has no official API, but its own web frontend searches through a public
**Algolia** index, so `lib/scrapers/grailed.ts` queries the same cluster using
the search-only credentials Grailed ships in its client bundle. This sidesteps
the bot protection that 403s `www.grailed.com/api/v2/search`.

Technique adapted from [pznamir00/Grailed-API](https://github.com/pznamir00/Grailed-API)
(a Python package — the approach was ported, not the code).

A search returns up to **500 listings** (`DEFAULT_LIMIT`). Algolia hard-caps
this index at **1000 hits per query** regardless of pagination, and pages are
batched into a single POST (Algolia accepts multiple requests per call), so 500
costs one round trip at roughly 1.5s.

Three gotchas worth knowing if you touch it:
- `sold` is a plain boolean, **not** a configured Algolia facet. Putting it in
  `facetFilters` silently returns **zero** hits; sold listings are filtered in JS.
- Photos come from `media-assets.grailed.com`, which must stay in
  `images.remotePatterns`.
- Sizes are indexed as `category_size` facets namespaced by category
  (`footwear.10`, `bottoms.32`, `tailoring.40r`) — see `lib/sizes.ts`.

## Listing detail view

Clicking a card opens a detail modal (`components/ListingDetail.tsx`) instead of
navigating straight to the marketplace. It shows the full photo gallery, price,
size/condition/brand/colour, seller, and the description, with a
"View on <platform>" button as the only way out to the original listing.

Results live in client state, so the modal reads the already-fetched `Item` —
no extra request for Vinted or Poshmark, and no detail route to maintain.

### Photos

Every photo a platform exposes is viewable. Click the main image (or press
Enter on it) for a full-screen lightbox; arrow keys and on-image arrows move
between shots, Escape backs out of the lightbox before closing the modal.

| Platform | Photos | Source |
| -------- | ------ | ------ |
| Poshmark | avg ~8, up to 15 | already in the search payload |
| Vinted   | avg ~6, up to 20 | already in the search payload |
| Grailed  | up to ~10 + description | fetched on demand — see below |

Grailed's Algolia index ships **one** cover shot and no description, even though
it reports `photo_count: 10`. Its public listing API has both, so
`/api/listing?platform=grailed&id=<id>` fetches them when the modal opens and
caches the result for 30 minutes (bounded, per-instance). Nothing is fetched
during search, so the 500-listing Grailed page cost is unchanged.

The route only accepts `platform=grailed` with a numeric id — it is a targeted
gap-filler, not a general proxy.

## Smart search (relevance filtering)## Smart search (relevance filtering)

Platform search is loose — Vinted especially returns brand-adjacent items
("Polar King jacket" for `carhartt jacket`). `lib/relevance.ts` re-ranks the
pooled results against the query and drops the clearly-unrelated tail. The
search API returns the kept items ordered by relevance plus a `filtered` count,
and the UI shows an "N loose matches hidden" toggle to reveal them.

Why scoring rather than keyword filtering: a naive `title.includes(word)` test
rejects **76%** of results for `levis 501`, because the titles read "Levi's 501"
— an apostrophe, not a mismatch.

How a listing is scored (0–1 over the query terms):
- **Normalisation** folds case, accents and apostrophe variants, so `Levi's`,
  `LEVI’S`, `Levi´s` and `Levis` are one token. Apostrophes are stripped
  *before* NFKD, which would otherwise decompose `´` into a space + combining
  mark and split the word.
- **Synonyms** — a coat, anorak, parka or bomber all match "jacket".
- **Typo tolerance** — bounded edit distance catches `Carhart`/`Carthartt`.
- **Rarity weighting (IDF)** — a term in nearly every title ("jacket" in a
  jacket search) counts less than a distinctive one ("carhartt").
- **Anchor rule** — the rarest query term (usually the brand) *must* match.
  Without it, "Polar King jacket" passes on the garment word alone.

Typical effect: ~150 of ~1,350 results removed for `carhartt jacket`. Pass
`strict: false` to `/api/search` to skip filtering entirely.

## Sizes

`lib/sizes.ts` holds the taxonomy. Grailed normalises everything to **US/alpha**
sizing, so EU shoe sizes are converted to their US equivalent before filtering
and shown as `10 · EU 44` in the picker.

`normalizeSize()` makes listing sizes comparable, handling `2XL`→`XXL`,
`EU 44`→`10`, `US 10`→`10`, `32"`→`32`, `40 R`→`40R`, spelled-out sizes
(`X-LARGE REGULAR`→`XL`), and Tall variants (`XLT`→`XL`, `2XLT`→`XXL`).
Unfilterable free text (`SEE MEASUREMENTS`, `VARIOUS`) returns `null`. Both the filter and
the listing value are normalised before comparison, so free-text sizes from
different platforms still match.

## For You feed

`/for-you` builds a personalized feed from recent searches. There's no auth
yet, so history lives in `localStorage` (`lib/history.ts`) and is read through
`useSyncExternalStore`, which also picks up changes from other tabs.

The ranking in `lib/recommend.ts`:

1. **Weight each past search** — recency decays on a 10-day half-life, and
   repeat searches add a `log2` frequency boost (diminishing returns).
2. **Fetch the top 3 interests** in parallel and pool the results, deduped by URL.
3. **Score every listing** — term overlap with the weighted interest profile
   (65%), listing freshness (20%), and how close the price sits to the median
   of what you browse (15%).
4. **Diversify** so no single search term takes more than 3 consecutive slots,
   producing a blended feed rather than concatenated searches.

Only searches that returned results are recorded, so typos don't pollute the feed.

## Deploying

See **[DEPLOY.md](DEPLOY.md)** for step-by-step Neon and Vercel setup.

Quick version:

```bash
cp .env.example .env.local     # then fill in DATABASE_URL and AUTH_SECRET
npm run db:setup               # creates tables in Neon
npm run dev
```

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- Supabase account (free tier available)

### Installation

```bash
# Install dependencies
npm install

# Create environment variables
cp .env.local.example .env.local
# Edit .env.local with your Supabase and eBay API keys

# Start development server
npm run dev
```

Visit **http://localhost:3000** in your browser.

## Environment Variables

Create `.env.local` with:

```env
# Supabase (get from https://supabase.com)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key  # Optional, for admin operations

# eBay (App ID + Cert ID from the developer portal — not an "API key")
EBAY_CLIENT_ID=your-app-id
EBAY_CLIENT_SECRET=your-cert-id
```

## Project Structure

```
secondhandsearchengine/
├── app/
│   ├── page.tsx                 # Homepage
│   ├── layout.tsx               # Root layout with dark theme
│   ├── globals.css              # Tailwind + theme
│   ├── search/
│   │   ├── page.tsx             # Search results page
│   │   └── SearchContent.tsx    # Search logic (client component)
│   ├── favorites/page.tsx       # Saved items page
│   ├── login/page.tsx           # Auth pages (Supabase ready)
│   ├── register/page.tsx
│   └── api/
│       ├── search/route.ts      # Multi-platform search endpoint
│       ├── favorites/route.ts   # Favorites CRUD
│       └── saved-searches/route.ts
│
├── components/
│   ├── SearchBar.tsx            # Main search input
│   ├── ItemCard.tsx             # Individual listing card
│   ├── ResultsGrid.tsx          # Responsive grid + filtering/sorting
│   ├── FilterPanel.tsx          # Filter rail (drawer on mobile)
│   ├── Navbar.tsx               # Navigation bar
│   ├── AuthForm.tsx             # Shared login/register form
│   ├── ThemeToggle.tsx          # Light/dark switch
│   ├── ThemeScript.tsx          # Pre-paint theme application
│   └── SavedSearches.tsx        # Saved searches dropdown
│
├── lib/
│   ├── types.ts                 # TypeScript interfaces
│   ├── platforms.ts             # Platform metadata, price/date formatting
│   ├── sizes.ts                 # Size taxonomy + EU→US normalization
│   ├── history.ts               # Search history store (localStorage)
│   ├── recommend.ts             # For You ranking algorithm
│   ├── supabase.ts              # Supabase client (null when unconfigured)
│   └── scrapers/
│       ├── index.ts             # Orchestrator (Promise.all)
│       ├── ebay.ts              # eBay Browse API
│       ├── grailed.ts           # Grailed API
│       ├── vinted.ts            # Vinted API
│       ├── depop.ts             # Depop API
│       ├── poshmark.ts          # Poshmark scraper (stub)
│       ├── facebook.ts          # Facebook Marketplace (Playwright)
│       └── vestiaire.ts         # Vestiaire Collective API
│
├── public/                      # Static assets
├── .env.local                   # Environment variables
├── package.json
├── tsconfig.json
└── next.config.ts               # Image remotePatterns per marketplace CDN
```

> Tailwind v4 is configured entirely in `app/globals.css` via `@theme` — there
> is no `tailwind.config.ts`.

## How It Works

### Search Flow
1. User enters query in search bar
2. Query is sent to `/api/search` endpoint
3. API route fans out to all 7 platform scrapers in parallel using `Promise.all()`
4. Each scraper fetches and normalizes results to standard `Item` format
5. Results are deduplicated and returned to client
6. Client displays results with filters and sorting applied

### Normalized Item Format
All results are normalized to this structure:

```typescript
type Item = {
  id: string;
  platform: 'grailed' | 'vinted' | 'depop' | 'ebay' | 'poshmark' | 'facebook' | 'vestiaire';
  title: string;
  price: number;
  currency: string;
  size: string | null;
  condition: string | null;
  image_url: string;
  external_url: string;      // Always links to original listing
  listed_at: string | null;
};
```

### Scraper Implementation
- **Static Sites** (Vinted, Vestiaire, Grailed): Axios + Cheerio HTML parsing
- **Dynamic Sites** (Depop, Facebook): Playwright headless browser
- **Official APIs** (eBay): Direct API calls
- **Timeout**: 8 seconds per platform; silently skips failed requests
- **Error Handling**: Failed platforms don't break entire search

## Design System

All colors are CSS custom properties in `app/globals.css`. Never hardcode a hex
value in a component — use `var(--token)` so both themes stay in sync.

### Tokens

| Token              | Light     | Dark      | Use                          |
| ------------------ | --------- | --------- | ---------------------------- |
| `--bg`             | `#faf7f2` | `#12100e` | Page ground (warm neutral)   |
| `--bg-subtle`      | `#f2ede4` | `#171412` | Alternating bands            |
| `--surface`        | `#ffffff` | `#1c1916` | Cards, inputs                |
| `--hairline`       | `#e3dbcd` | `#2c2621` | Borders                      |
| `--text`           | `#1b1815` | `#f4efe7` | Primary text                 |
| `--text-muted`     | `#6b6154` | `#a89e90` | Secondary text               |
| `--accent`         | `#b8730f` | `#e8a33d` | Prices, primary CTA, links   |
| `--danger`         | `#b3392c` | `#e8776a` | Errors, active favorite      |

The accent is darker in light mode so it keeps contrast on a pale ground.
Platform brand colors live in `lib/platforms.ts` and are used only as small
identifying dots — never as page accent.

### Theming

Three states are supported: explicit light, explicit dark, and system default.
`:root` defines the full light palette; `@media (prefers-color-scheme: dark)`
(guarded with `:not([data-theme="light"])`) and `:root[data-theme="dark"]`
override tokens only. `components/ThemeScript.tsx` applies the saved choice
before first paint to avoid a flash.

### Typography
- **Display**: Fraunces (variable, optical-size axis) — headings via `font-display`
- **Body/UI**: Inter
- **Numerals**: `.tnum` applies tabular figures wherever prices or counts align

### Component classes

`.btn`, `.card`, `.field`, `.skeleton`, `.eyebrow` live inside
`@layer components` so Tailwind utilities always win on specificity.

> **Careful:** do not add a bare `* { margin: 0 }` reset or unlayered
> element/class rules that set `display`, `margin`, or `padding`. Tailwind v4's
> Preflight already resets, and such rules out-specify utilities like `mx-auto`
> and `md:hidden`, silently breaking centering and responsive visibility.

### Layout
- Grid: 2 columns mobile, 3 tablet, 4 desktop (`xl`)
- Filters: sticky left rail on desktop, bottom-sheet drawer on mobile
- Skeleton placeholders while a search is in flight

## Setting Up Supabase

### Create Tables

```sql
-- Saved searches
create table saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  query text not null,
  platforms text[],
  filters jsonb,
  created_at timestamptz default now()
);

-- Favorites
create table favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  platform text not null,
  title text not null,
  price numeric,
  currency text,
  image_url text,
  external_url text not null,
  saved_at timestamptz default now()
);

-- Enable RLS
alter table saved_searches enable row level security;
alter table favorites enable row level security;

-- RLS Policies
create policy "Users can read own searches"
  on saved_searches for select
  using (auth.uid() = user_id);

create policy "Users can insert own searches"
  on saved_searches for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own searches"
  on saved_searches for delete
  using (auth.uid() = user_id);

-- Similar policies for favorites table
```

## API Endpoints

### POST `/api/search`
Search all platforms

**Request:**
```json
{ "query": "vintage t-shirt" }
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "ebay-123456",
      "platform": "ebay",
      "title": "Vintage Levi's T-Shirt",
      "price": 25.99,
      "currency": "USD",
      "size": "M",
      "condition": "good",
      "image_url": "...",
      "external_url": "...",
      "listed_at": "2026-05-07T10:30:00Z"
    }
    // ... more results
  ],
  "total": 42,
  "query": "vintage t-shirt"
}
```

### GET/POST/DELETE `/api/favorites`
Manage saved items (requires authentication)

### GET/POST/DELETE `/api/saved-searches`
Manage saved searches (requires authentication)

## Building for Production

```bash
# Build for production
npm run build

# Start production server
npm start
```

## Deployment to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables in Vercel dashboard
```

## Development

### Running Checks
```bash
npm run lint
npm run build
```

### Dev Tools
- Next.js Dev Tools (bottom-right corner)
- React Dev Tools browser extension recommended
- Network tab to monitor API calls

## Troubleshooting

### "No results found" on first search
- Some platforms may require API authentication
- Check `.env.local` for API keys
- eBay API key especially important
- Allow 8-10 seconds for all platforms to respond

### Suspense boundary error during build
- Fixed with Suspense wrapper on `/search` page
- `SearchContent.tsx` handles `useSearchParams()` safely

### Images not loading
Every remote host must be listed in `images.remotePatterns` in `next.config.ts`,
otherwise `next/image` returns **400 Bad Request** and the card shows its
"No photo" placeholder. The known marketplace CDNs are already allowlisted; if a
platform starts serving from a new host, add it there.

### Layout looks broken after a CSS change
Check that any new class rule in `globals.css` is inside `@layer components`.
An unlayered rule setting `display`/`margin`/`padding` ties Tailwind utilities on
specificity and wins on source order — which silently breaks `mx-auto`,
`md:hidden`, and the responsive grid.

## Future Enhancements

- [ ] Price history tracking and alerts
- [ ] Email notifications for new listings
- [ ] Search analytics dashboard
- [ ] Shareable search links with filters
- [ ] Pagination for large result sets
- [ ] Multi-language support
- [ ] Browser extension
- [ ] Mobile app (React Native)

## Performance Notes

- **Timeout**: 8 seconds per platform
- **Parallel Requests**: Every live platform queried simultaneously
- **Caching**: Consider Redis for frequently searched queries
- **Rate Limiting**: Recommended on API endpoints
- **Image Optimization**: Using Next.js Image component with CDN

## Security

- Supabase Row Level Security (RLS) prevents users from accessing others' data
- API routes check user authentication before operations
- Environment variables kept in `.env.local` (never committed)
- No sensitive data in client code

## License

MIT

---

**Built with ❤️ using Next.js, Tailwind CSS, and Supabase**
