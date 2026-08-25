# Secondhand Clothing Search Aggregator

## Project Status

### ✅ Completed
- Next.js 14 scaffold with TypeScript, Tailwind CSS, App Router
- Dark minimal UI design (all components styled)
- Search API route with parallel multi-platform scraping
- All UI components created:
  - SearchBar
  - ItemCard with platform badges and favorites heart
  - ResultsGrid with responsive grid (2-4 columns)
  - FilterPanel (price, size, condition, platforms)
  - Navbar with auth menu placeholders
  - SavedSearches dropdown component
- Pages:
  - Homepage with search bar
  - Search results page with filters and sorting
  - Placeholder pages for /favorites, /login, /register
- API routes (stubs):
  - POST /api/search - returns search results from all platforms
  - GET/POST/DELETE /api/favorites
  - GET/POST/DELETE /api/saved-searches

### Scrapers Status
- **eBay** - Basic implementation using Browse API
- **Grailed** - Basic Axios implementation
- **Vinted** - Basic Axios implementation with size/condition parsing
- **Depop** - Basic Axios implementation
- **Poshmark** - Stub (needs scraping logic)
- **Facebook Marketplace** - Stub (needs Playwright)
- **Vestiaire Collective** - Basic Axios implementation

### 🔄 In Progress / To Do

#### High Priority:
1. **Supabase Setup**
   - Create Supabase project
   - Set up tables: `saved_searches`, `favorites`
   - Enable Row Level Security (RLS)
   - Store Supabase URL and keys in .env.local

2. **Authentication**
   - Integrate Supabase Auth in login/register pages
   - Session persistence using Supabase client
   - Protect favorites and saved-searches routes with auth

3. **Favorites System**
   - Implement POST /api/favorites to save items to DB
   - Implement GET /api/favorites to fetch user's favorites
   - Fetch favorites on search results page
   - Update /favorites page to display saved items
   - Add "Remove from favorites" functionality

4. **Saved Searches**
   - Implement save button on search results
   - Save search query + current filters to DB
   - Fetch saved searches on homepage
   - Load saved search and re-run query when clicked

#### Medium Priority:
5. **Scraper Improvements**
   - Test all scrapers against live platforms
   - Implement error handling per platform
   - Add timeout handling (8s per platform as spec)
   - Parse more detailed information (size, condition) from each platform
   - Add proxy/rotation if needed to avoid blocks

6. **Frontend Polish**
   - Add loading animations
   - Add error boundaries
   - Add "Save Search" modal
   - Improve mobile responsiveness
   - Add pagination for large result sets

#### Lower Priority:
7. **Additional Features**
   - Price history tracking
   - Email notifications for new listings
   - Search analytics
   - Share search links

## Environment Variables Required

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
EBAY_API_KEY=
```

## Running the App

```bash
npm install
npm run dev
# Open http://localhost:3000
```

## File Structure

```
/app
  /page.tsx                  ← Homepage
  /search/page.tsx           ← Search results (with Suspense)
  /search/SearchContent.tsx  ← Search logic component
  /favorites/page.tsx        ← Favorites page (stub)
  /login/page.tsx            ← Login page (stub)
  /register/page.tsx         ← Register page (stub)
  /api
    /search/route.ts         ← Search API
    /favorites/route.ts      ← Favorites API (stub)
    /saved-searches/route.ts ← Saved searches API (stub)
  layout.tsx
  globals.css                ← Tailwind with dark theme

/components
  SearchBar.tsx
  ItemCard.tsx
  ResultsGrid.tsx
  FilterPanel.tsx
  Navbar.tsx
  SavedSearches.tsx

/lib
  types.ts                   ← Normalized types (Item, Platform, Filters)
  supabase.ts                ← Supabase client
  /scrapers
    index.ts                 ← Orchestrates all platform scrapers
    ebay.ts
    grailed.ts
    vinted.ts
    depop.ts
    poshmark.ts              ← Needs impl
    facebook.ts              ← Needs impl
    vestiaire.ts
```

## Design Specs (Implemented)
- **Background**: #0a0a0a
- **Surface/Cards**: #141414
- **Borders**: #1f1f1f
- **Text Primary**: #f5f5f5
- **Text Secondary**: #888
- **Accent**: #e0e0e0
- **Font**: Inter (Google Fonts) 
- **No rounded corners** - sharp edges only
- **No shadows**
- **Responsive Grid**: 2 cols mobile, 3 cols tablet, 4 cols desktop
- **Hover state**: border changes to #3f3f3f

## Next Steps
1. Create Supabase project and tables
2. Integrate Supabase Auth in login/register
3. Implement favorites save/fetch
4. Implement saved searches
5. Test scrapers with real data
6. Deploy to Vercel
