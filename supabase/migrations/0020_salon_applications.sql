-- Salons apply to join; a platform admin approves (creates the salon) or declines.
create table if not exists salon_applications (
  id uuid primary key default gen_random_uuid(),
  salon_name text not null,
  owner_name text not null,
  email text not null,
  phone text,
  street text,
  city text,
  state text,
  zip text,
  timezone text not null default 'America/Chicago',
  stylists int,
  website text,
  message text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  business_id uuid references businesses(id) on delete set null,
  decided_at timestamptz,
  decided_by text,
  decision_note text,
  created_at timestamptz not null default now()
);
create index if not exists salon_applications_status on salon_applications (status, created_at desc);
-- Service role only (the public form and the admin page go through the server).
alter table salon_applications enable row level security;
revoke all on salon_applications from anon, authenticated;
grant all on salon_applications to service_role;
