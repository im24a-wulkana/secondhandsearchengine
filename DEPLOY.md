# Deploying Onerail

Two services: **Neon** for Postgres, **Vercel** for hosting.

---

## 1. Neon — what to do

### 1.1 Create the project

1. Sign up at [neon.tech](https://neon.tech) (free tier is enough to start).
2. **Create a project.** Pick the region closest to your Vercel region — a
   database in `us-east-1` behind a function in Frankfurt adds latency to every
   query.
3. Leave the default database name (`neondb`).

### 1.2 Copy the connection string

On the project dashboard, click **Connect**, then:

- Set **Connection type** to **Pooled connection**.
- Copy the string. It looks like:

```
postgresql://neondb_owner:PASSWORD@ep-cool-name-12345-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require
```

> **Use the pooled string** (the host contains `-pooler`). Vercel functions are
> serverless and each invocation can open its own connection; the unpooled
> endpoint will exhaust connection limits under load.

Keep `?sslmode=require` on the end.

### 1.3 Create the tables

Locally, put the string in `.env.local`:

```bash
DATABASE_URL="postgresql://…-pooler…/neondb?sslmode=require"
```

Then run:

```bash
npm run db:setup
```

You should see ten `ok` lines. It is safe to re-run — every statement is
`if not exists`.

**Alternative:** paste the contents of `db/schema.sql` into the Neon **SQL
Editor** and run it there.

### 1.4 Verify

In the Neon SQL Editor:

```sql
select table_name from information_schema.tables
where table_schema = 'public';
```

Expect `users`, `favorites`, `searches`, and the `popular_searches` view.

### 1.5 Optional but recommended

- **Enable autoscaling** (Settings → Compute) so traffic spikes don't queue.
- **Set scale-to-zero** on the free tier to avoid burning compute hours while
  idle. The first query after a sleep takes ~500ms to wake.
- Neon's free tier keeps 24h of history; nothing here needs more.

---

## 2. Environment variables

| Variable | Required | What it does |
| -------- | -------- | ------------ |
| `DATABASE_URL` | yes, for accounts | Neon **pooled** connection string |
| `AUTH_SECRET` | yes, for accounts | Signs session cookies. **32+ characters** |
| `EBAY_API_KEY` | optional | eBay OAuth **access token**, not an App ID |

Generate `AUTH_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> A secret shorter than 32 characters is rejected at runtime — the app fails
> closed rather than signing sessions weakly. Use a **different** secret in
> production from the one in local development; changing it signs everyone out.

Without `DATABASE_URL` and `AUTH_SECRET` the app still runs: search works,
account routes return `503`, and "Popular" falls back to a curated list.

---

## 3. Vercel — what to do

1. Push the repo to GitHub.
2. In Vercel, **Add New → Project** and import it. Next.js is detected
   automatically; no build settings to change.
3. Under **Environment Variables**, add `DATABASE_URL`, `AUTH_SECRET`, and
   optionally `EBAY_API_KEY`. Apply them to **Production, Preview, and
   Development**.
4. Deploy.

### Notes

- `vercel.json` raises the timeout for `/api/search` (30s) and
  `/api/recommendations` (60s). The defaults are too short: a search fans out to
  three marketplaces, and the feed runs three searches.
- Playwright is a **dev** dependency and is not installed on Vercel. It is only
  used for local screenshot testing.
- Preview deployments share the production database unless you set a different
  `DATABASE_URL` for the Preview environment. For real use, create a second Neon
  branch and point Preview at it.

---

## 4. After deploying

1. Visit `/register` and create an account.
2. Confirm "For you" and "Saved" appear in the nav.
3. Run a couple of searches, then check the data landed:

```sql
select query, result_count, created_at from searches order by created_at desc limit 10;
select * from popular_searches;
```

`popular_searches` only lists queries searched **3+ times in the last 30 days**
that returned results, so it stays empty at first — the homepage shows curated
terms until then, and switches over automatically.

---

## Troubleshooting

**"Accounts are not configured on this deployment."**
`DATABASE_URL` or `AUTH_SECRET` is missing, or the secret is under 32
characters. Re-check the Vercel environment variables and redeploy — env
changes need a new deployment to take effect.

**`relation "users" does not exist`**
The schema was never applied. Run `npm run db:setup` with `DATABASE_URL`
pointing at the same database.

**Signed out after every deploy**
`AUTH_SECRET` is changing between builds. Set it once in Vercel rather than
generating it per deploy.

**Search is slow or times out**
Neon's free tier scales to zero; the first query after idle takes ~500ms.
Marketplace calls are the bigger cost — a full search is ~6-7s.
