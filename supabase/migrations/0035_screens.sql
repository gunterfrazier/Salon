-- Screens: any number of displays around the salon, each with its own playlist.
--  * audience 'public' screens (front window, waiting area) open from a private
--    link (token) with no sign-in, and only ever show public slides.
--  * audience 'staff' screens need a signed-in device and may show client details.
-- signage_media: pictures for screens (Graphics studio designs, uploads, brand materials).

create table if not exists screens (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  audience text not null check (audience in ('public', 'staff')),
  token text not null unique default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  playlist jsonb not null default '[]'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists screens_business on screens(business_id, sort, created_at);

create table if not exists signage_media (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  path text not null,
  title text,
  source text not null default 'upload' check (source in ('upload', 'studio', 'brand')),
  created_at timestamptz not null default now()
);
create index if not exists signage_media_business on signage_media(business_id, created_at desc);

do $$
declare t text;
begin
  foreach t in array array['screens', 'signage_media'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists business_isolation on %I', t);
    execute format($p$create policy business_isolation on %I for all
      using (business_id in (select my_business_ids()))
      with check (business_id in (select my_business_ids()))$p$, t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
    execute format('grant all on %I to service_role', t);
  end loop;
end $$;
