-- Account types and joining a salon.
--   * A stylist's own business ("solo") next to salons.
--   * Team members can be suspended (e.g. medical leave): no access, not bookable, kept on the team.
--   * Stylists ask to join a salon; the owner accepts or declines.
--   * Join codes (and their QR codes) sign a stylist up and add them, approved or as a request.

alter table businesses add column if not exists kind text not null default 'salon' check (kind in ('salon', 'solo'));

alter table staff add column if not exists suspended_at timestamptz;
alter table staff add column if not exists suspended_note text;

-- Suspended team members lose access to the salon's data, like turned-off ones.
create or replace function my_business_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select business_id from staff where auth_user_id = auth.uid() and active and suspended_at is null
$$;

-- Solo applications point at the stylist's business, already created.
alter table salon_applications add column if not exists kind text not null default 'salon' check (kind in ('salon', 'solo'));

create table if not exists salon_join_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  auth_user_id uuid not null,
  name text not null,
  email text not null,
  phone text,
  message text,
  -- Set when they came through a join code.
  code_id uuid,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'cancelled')),
  staff_id uuid references staff(id) on delete set null,
  decided_at timestamptz,
  decided_by uuid references staff(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists salon_join_requests_one_pending on salon_join_requests (business_id, auth_user_id) where status = 'pending';
create index if not exists salon_join_requests_user on salon_join_requests (auth_user_id, created_at desc);
alter table salon_join_requests enable row level security;
-- The salon's team can see its requests; changes go through the server.
create policy salon_join_requests_read on salon_join_requests for select using (business_id in (select my_business_ids()));

create table if not exists salon_join_codes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z0-9]{8}$'),
  role text not null default 'stylist',
  auto_approve boolean not null default true,
  max_uses int check (max_uses is null or max_uses > 0),
  uses int not null default 0,
  expires_at timestamptz,
  note text,
  created_by uuid references staff(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
alter table salon_join_codes enable row level security;
create policy business_isolation on salon_join_codes for all
  using (business_id in (select my_business_ids())) with check (business_id in (select my_business_ids()));
