-- ============================================================
--  APEX CRM — Supabase / Postgres schema
--  Multi-tenant: one project hosts every client. Row-Level
--  Security guarantees an owner can only ever read their own
--  rows, even though everyone shares the same tables.
--  Run this once in the Supabase SQL editor.
-- ============================================================

-- ---- tenants (one row per client business) --------------------
create table if not exists tenants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text unique not null,
  created_at  timestamptz not null default now()
);

-- which auth users may see which tenant (usually 1:1)
create table if not exists tenant_users (
  tenant_id   uuid references tenants(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete cascade,
  role        text not null default 'owner',
  primary key (tenant_id, user_id)
);

-- helper: tenants the current user belongs to
create or replace function my_tenants() returns setof uuid
language sql stable security definer set search_path = public as $$
  select tenant_id from tenant_users where user_id = auth.uid()
$$;

-- ---- bookings (the lead / enquiry rows) -----------------------
create table if not exists bookings (
  id             bigint generated always as identity primary key,
  tenant_id      uuid not null references tenants(id) on delete cascade,
  name           text not null,
  phone          text,
  email          text,
  services       jsonb not null default '[]',   -- [{name, price}, ...]
  est_value      numeric not null default 0,    -- conservative floor
  preferred_date date,
  preferred_time text,
  notes          text,
  source         text not null default 'website', -- website|whatsapp|instagram|walkin|phone|manual
  status         text not null default 'new',      -- new|meeting|pending|confirmed|completed|cancelled|noshow
  is_client      boolean not null default false,   -- promoted from lead → shows in Clients
  created_at     timestamptz not null default now()
);
create index if not exists bookings_tenant_created on bookings (tenant_id, created_at desc);

-- ---- events (first-party website analytics) -------------------
create table if not exists events (
  id          bigint generated always as identity primary key,
  tenant_id   uuid not null references tenants(id) on delete cascade,
  type        text not null,   -- pageview|wa_click|ig_click|call_click|email_click|form_start|form_submit
  path        text,
  referrer    text,
  session     text,
  duration    integer,
  created_at  timestamptz not null default now()
);
create index if not exists events_tenant_created on events (tenant_id, created_at desc);

-- ---- reviews (optional, synced or manual) ---------------------
create table if not exists reviews (
  id          bigint generated always as identity primary key,
  tenant_id   uuid not null references tenants(id) on delete cascade,
  author      text, rating int, source text, text text,
  created_at  timestamptz not null default now()
);

-- ============================================================
--  Row-Level Security
-- ============================================================
alter table tenants      enable row level security;
alter table tenant_users enable row level security;
alter table bookings     enable row level security;
alter table events       enable row level security;
alter table reviews      enable row level security;

-- owners can read their own tenant + its data
create policy tenants_read   on tenants      for select using (id in (select my_tenants()));
create policy tu_read        on tenant_users for select using (user_id = auth.uid());
create policy bookings_read  on bookings     for select using (tenant_id in (select my_tenants()));
create policy events_read    on events       for select using (tenant_id in (select my_tenants()));
create policy reviews_read   on reviews      for select using (tenant_id in (select my_tenants()));

-- owners can update the status of their own bookings
create policy bookings_update on bookings for update
  using (tenant_id in (select my_tenants()))
  with check (tenant_id in (select my_tenants()));

-- NOTE: inserts (new bookings + pageviews) come from the server-side
-- Vercel functions using the SERVICE ROLE key, which bypasses RLS.
-- The browser/anon key can only ever READ, and only its own rows.
