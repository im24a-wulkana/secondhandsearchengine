-- Onerail schema for Neon Postgres.
-- Safe to run more than once.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------
create table if not exists users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,
  password_hash text not null,
  created_at    timestamptz not null default now()
);

-- Case-insensitive uniqueness: nobody should be able to register the same
-- address twice with different capitalisation.
create unique index if not exists users_email_lower_idx on users (lower(email));

-- ---------------------------------------------------------------------------
-- Saved listings
-- ---------------------------------------------------------------------------
create table if not exists favorites (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  item_id      text not null,
  platform     text not null,
  title        text not null,
  price        numeric(12,2),
  currency     text,
  size         text,
  condition    text,
  image_url    text,
  external_url text not null,
  listed_at    timestamptz,
  saved_at     timestamptz not null default now()
);

-- One save per listing per user; lets the API upsert instead of checking first.
create unique index if not exists favorites_user_item_idx on favorites (user_id, item_id);
create index if not exists favorites_user_saved_idx on favorites (user_id, saved_at desc);

-- ---------------------------------------------------------------------------
-- Search log — powers the "Popular" row and the For You feed
-- ---------------------------------------------------------------------------
create table if not exists searches (
  id          bigserial primary key,
  -- Null for signed-out visitors: their searches still count toward Popular.
  user_id     uuid references users(id) on delete set null,
  query       text not null,
  -- Lowercased/trimmed form used for grouping.
  query_key   text not null,
  result_count integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists searches_key_created_idx on searches (query_key, created_at desc);
create index if not exists searches_user_created_idx on searches (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Popular searches: most-run queries in the last 30 days.
-- A view keeps the ranking logic in one place.
-- ---------------------------------------------------------------------------
create or replace view popular_searches as
select
  query_key,
  -- Show the most recent spelling of the query rather than an arbitrary one.
  (array_agg(query order by created_at desc))[1] as query,
  count(*)                                        as search_count,
  max(created_at)                                 as last_searched_at
from searches
where created_at > now() - interval '30 days'
  -- Only queries that actually found something are worth suggesting.
  and result_count > 0
group by query_key
order by search_count desc, last_searched_at desc;
