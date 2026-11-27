-- Salon branding (logo, cover photo, accent color) and a portfolio gallery.
-- Photos live in a public storage bucket (they're shown on public salon
-- pages); only the salon's team can add or remove them.
alter table businesses add column if not exists branding jsonb not null default '{}'::jsonb;

create table if not exists salon_photos (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  path text not null,
  caption text,
  staff_id uuid references staff(id) on delete set null,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists salon_photos_business on salon_photos(business_id, sort, created_at desc);

alter table salon_photos enable row level security;
drop policy if exists business_isolation on salon_photos;
create policy business_isolation on salon_photos for all
  using (business_id in (select my_business_ids()))
  with check (business_id in (select my_business_ids()));
grant select, insert, update, delete on salon_photos to authenticated;
grant all on salon_photos to service_role;

do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('salon-media', 'salon-media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do update set public = true;

    drop policy if exists "salon media: staff write" on storage.objects;
    drop policy if exists "salon media: staff delete" on storage.objects;
    create policy "salon media: staff write" on storage.objects for insert to authenticated
      with check (bucket_id = 'salon-media' and (storage.foldername(name))[1] in (select my_business_ids()::text));
    create policy "salon media: staff delete" on storage.objects for delete to authenticated
      using (bucket_id = 'salon-media' and (storage.foldername(name))[1] in (select my_business_ids()::text));
  end if;
end $$;
