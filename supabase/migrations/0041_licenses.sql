-- Professional licenses. A person's license belongs to them (uploaded once, seen by
-- every salon they work at); a salon's own establishment license belongs to the salon.
create table if not exists licenses (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete cascade,
  business_id uuid references businesses(id) on delete cascade,
  kind text not null check (kind in ('cosmetology', 'barber', 'esthetics', 'nails', 'instructor', 'establishment', 'other')),
  state text not null check (state ~ '^[A-Z]{2}$'),
  number text not null check (length(number) between 1 and 40),
  holder_name text,
  expires_on date,
  file_path text,
  file_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((auth_user_id is null) <> (business_id is null))
);
create index if not exists licenses_user on licenses (auth_user_id);
create index if not exists licenses_business on licenses (business_id);
create index if not exists licenses_expires on licenses (expires_on);
alter table licenses enable row level security;
-- Your own licenses, and your salon's establishment license. Team members' licenses
-- are read through the server, for people allowed to manage the team.
create policy licenses_own on licenses for select using (auth_user_id = auth.uid() or business_id in (select my_business_ids()));

-- Each salon confirms a license for itself (after checking the state board's lookup).
create table if not exists license_checks (
  license_id uuid not null references licenses(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  verified_at timestamptz not null default now(),
  verified_by uuid references staff(id) on delete set null,
  note text,
  primary key (license_id, business_id)
);
alter table license_checks enable row level security;
create policy business_isolation on license_checks for all
  using (business_id in (select my_business_ids())) with check (business_id in (select my_business_ids()));

-- The latest expiry among a team member's practicing licenses (null = none on file),
-- kept up to date by the app, so booking can skip expired stylists when the salon asks.
alter table staff add column if not exists license_expires_on date;
alter table businesses add column if not exists block_expired_license boolean not null default false;

-- Private files: only the server reads or writes them (it checks who may see each one).
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('licenses', 'licenses', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
    on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;
