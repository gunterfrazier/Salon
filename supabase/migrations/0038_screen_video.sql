-- Video for screens: short silent loops (MP4/WebM) uploaded straight to storage.
alter table signage_media add column if not exists kind text not null default 'image' check (kind in ('image', 'video'));

do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    update storage.buckets
       set file_size_limit = 52428800,
           allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']
     where id = 'salon-media';
  end if;
end $$;
