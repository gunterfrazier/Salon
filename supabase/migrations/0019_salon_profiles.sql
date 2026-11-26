-- Marketplace: each salon has a public address (slug), approval status,
-- location and profile. Existing salons are approved and listed.
alter table businesses add column if not exists slug text;
alter table businesses add column if not exists status text not null default 'approved' check (status in ('pending', 'approved', 'suspended'));
alter table businesses add column if not exists listed boolean not null default true;
alter table businesses add column if not exists street text;
alter table businesses add column if not exists city text;
alter table businesses add column if not exists state text;
alter table businesses add column if not exists zip text;
alter table businesses add column if not exists phone text;
alter table businesses add column if not exists about text;
alter table businesses add column if not exists lat double precision;
alter table businesses add column if not exists lng double precision;

-- Give existing salons a slug from their name (adding a short suffix if taken).
do $$
declare b record; base text; candidate text;
begin
  for b in select id, name from businesses where slug is null order by created_at loop
    base := trim(both '-' from lower(regexp_replace(b.name, '[^a-zA-Z0-9]+', '-', 'g')));
    if base = '' then base := 'salon'; end if;
    candidate := base;
    if exists (select 1 from businesses where slug = candidate) then
      candidate := base || '-' || left(b.id::text, 4);
    end if;
    update businesses set slug = candidate where id = b.id;
  end loop;
end $$;

create unique index if not exists businesses_slug on businesses (slug);
create index if not exists businesses_listed on businesses (status, listed);
