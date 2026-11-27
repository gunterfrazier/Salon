-- Pairing TVs to screens: the TV shows a short code, someone signed in types it
-- into the app, and the TV gets its own device key (kept in a cookie). Keys are
-- stored hashed; removing a device turns its key off.

create table if not exists screen_devices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  screen_id uuid not null references screens(id) on delete cascade,
  name text not null default 'TV',
  key_hash text not null unique,
  paired_at timestamptz not null default now(),
  last_seen timestamptz,
  health jsonb not null default '{}'::jsonb,
  user_agent text
);
create index if not exists screen_devices_screen on screen_devices(screen_id);

-- Codes a TV shows while waiting to be paired. Only the server (service role) touches these.
create table if not exists screen_pair_codes (
  code text primary key,
  secret_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '15 minutes',
  device_id uuid references screen_devices(id) on delete cascade,
  device_key text
);

alter table screen_devices enable row level security;
drop policy if exists business_isolation on screen_devices;
create policy business_isolation on screen_devices for all
  using (business_id in (select my_business_ids()))
  with check (business_id in (select my_business_ids()));
grant select, update, delete on screen_devices to authenticated;
grant all on screen_devices to service_role;

alter table screen_pair_codes enable row level security;
revoke all on screen_pair_codes from public, anon, authenticated;
grant all on screen_pair_codes to service_role;
