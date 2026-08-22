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
  subscription   text not null default 'active',   -- active|cancelled (drives MRR/ARR)
  cancelled_at   timestamptz,                       -- set when a client unsubscribes
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

-- ---- appointments (the booking calendar) ----------------------
-- Scheduled client bookings. `source` records where each came from:
-- 'manual' (added in the dashboard) or a synced calendar. `external_id`
-- lets a two-way sync dedupe against the source event.
create table if not exists appointments (
  id           bigint generated always as identity primary key,
  tenant_id    uuid not null references tenants(id) on delete cascade,
  client       text not null,
  title        text,
  starts_at    timestamptz not null,
  ends_at      timestamptz,
  duration     integer,                              -- minutes (fallback when ends_at absent)
  status       text not null default 'scheduled',    -- scheduled|completed|cancelled
  source       text not null default 'manual',       -- manual|google|outlook|apple|ical
  external_id  text,                                  -- id in the synced calendar (dedupe)
  phone        text,
  email        text,
  meeting_url  text,                                  -- optional online-meeting link
  notes        text,
  created_at   timestamptz not null default now()
);
create index if not exists appointments_tenant_start on appointments (tenant_id, starts_at);
create unique index if not exists appointments_source_ext on appointments (tenant_id, source, external_id) where external_id is not null;

-- ---- calendar connections (Connect Google/Outlook/Calendly/iCal) --
-- One row per external calendar the owner links. A scheduled server job
-- fetches each ical_url (or uses an OAuth token) and upserts VEVENTs into
-- appointments as source=provider, external_id=<uid> (see unique index).
create table if not exists calendar_connections (
  id           bigint generated always as identity primary key,
  tenant_id    uuid not null references tenants(id) on delete cascade,
  provider     text not null,                         -- google|outlook|apple|calendly|ical
  label        text,
  ical_url     text,
  access_token text,                                  -- for OAuth providers (server-only)
  status       text not null default 'pending',       -- pending|active|error
  last_synced  timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists calconn_tenant on calendar_connections (tenant_id);

-- ---- messages (unified inbox: email / whatsapp / instagram) --------
-- Every inbound/outbound message across every connected channel lands
-- here and feeds the CRM Messages tab. `external_id` dedupes against the
-- provider's own message id so a re-sync never doubles a message.
create table if not exists messages (
  id           bigint generated always as identity primary key,
  tenant_id    uuid not null references tenants(id) on delete cascade,
  channel      text not null default 'email',    -- email|whatsapp|instagram
  direction    text not null default 'in',        -- in|out
  name         text,                              -- sender/recipient display name
  address      text,                              -- email address / handle / phone
  subject      text,
  snippet      text,
  body         text,
  external_id  text,                              -- provider message-id (dedupe)
  thread_id    text,
  unread       boolean not null default true,
  created_at   timestamptz not null default now()
);
create index if not exists messages_tenant_created on messages (tenant_id, created_at desc);
-- non-partial so it can serve as an ON CONFLICT arbiter for ignore-duplicate upserts
-- (every inserted message carries an external_id; multiple NULLs never conflict)
create unique index if not exists messages_channel_ext on messages (tenant_id, channel, external_id);

-- ---- email connections (Connect any mailbox via IMAP/SMTP) ---------
-- One row per mailbox the owner links. `secret_enc` holds the app
-- password (or OAuth token) AES-256-GCM-encrypted with CRM_SECRET_KEY,
-- decrypted only server-side by the sync/send functions. Provider
-- adapters: imap (universal), gmail, outlook (OAuth) share this table.
create table if not exists email_connections (
  id           bigint generated always as identity primary key,
  tenant_id    uuid not null references tenants(id) on delete cascade,
  email        text not null,
  provider     text not null default 'imap',      -- imap|gmail|outlook
  imap_host    text,
  imap_port    integer,
  smtp_host    text,
  smtp_port    integer,
  secret_enc   text,                              -- encrypted app password / token (server-only)
  status       text not null default 'pending',   -- pending|active|error
  last_error   text,
  last_synced  timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists emailconn_tenant on email_connections (tenant_id);

-- ============================================================
--  Row-Level Security
-- ============================================================
alter table tenants      enable row level security;
alter table tenant_users enable row level security;
alter table bookings     enable row level security;
alter table events       enable row level security;
alter table reviews      enable row level security;
alter table appointments enable row level security;
alter table calendar_connections enable row level security;
alter table messages           enable row level security;
alter table email_connections  enable row level security;

-- Policies are idempotent (drop-then-create) so this whole file can be
-- re-run safely when new tables/features are added — Postgres has no
-- `create policy if not exists`.

-- owners can read their own tenant + its data
drop policy if exists tenants_read   on tenants;
create policy tenants_read   on tenants      for select using (id in (select my_tenants()));
drop policy if exists tu_read        on tenant_users;
create policy tu_read        on tenant_users for select using (user_id = auth.uid());
drop policy if exists bookings_read  on bookings;
create policy bookings_read  on bookings     for select using (tenant_id in (select my_tenants()));
drop policy if exists events_read    on events;
create policy events_read    on events       for select using (tenant_id in (select my_tenants()));
drop policy if exists reviews_read   on reviews;
create policy reviews_read   on reviews      for select using (tenant_id in (select my_tenants()));
drop policy if exists appts_read     on appointments;
create policy appts_read     on appointments for select using (tenant_id in (select my_tenants()));

-- owners can update the status of their own bookings
drop policy if exists bookings_update on bookings;
create policy bookings_update on bookings for update
  using (tenant_id in (select my_tenants()))
  with check (tenant_id in (select my_tenants()));

-- owners can add / edit their own appointments (manual bookings)
drop policy if exists appts_write on appointments;
create policy appts_write on appointments for all
  using (tenant_id in (select my_tenants()))
  with check (tenant_id in (select my_tenants()));

-- owners can manage their own calendar connections
drop policy if exists calconn_all on calendar_connections;
create policy calconn_all on calendar_connections for all
  using (tenant_id in (select my_tenants()))
  with check (tenant_id in (select my_tenants()));

-- owners can read their own messages + manage their own email connections
drop policy if exists messages_read on messages;
create policy messages_read on messages for select using (tenant_id in (select my_tenants()));
drop policy if exists messages_update on messages;
create policy messages_update on messages for update
  using (tenant_id in (select my_tenants())) with check (tenant_id in (select my_tenants()));
drop policy if exists emailconn_all on email_connections;
create policy emailconn_all on email_connections for all
  using (tenant_id in (select my_tenants())) with check (tenant_id in (select my_tenants()));

-- RLS is row-level, not column-level: the policies above would still expose
-- server-only secrets to a client reading its own rows. Revoke those columns
-- from the client roles so only the SERVICE ROLE can ever read them.
revoke select (access_token) on calendar_connections from anon, authenticated;
revoke select (secret_enc)   on email_connections   from anon, authenticated;

-- NOTE: inserts (new bookings + pageviews) come from the server-side
-- Vercel functions using the SERVICE ROLE key, which bypasses RLS.
-- The browser/anon key can only ever READ, and only its own rows.
