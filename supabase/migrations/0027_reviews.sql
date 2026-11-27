-- Reviews: requested after a visit (one per appointment), answered from a
-- private link. 4-5 stars can be shown on the salon's page; 1-3 stay private
-- feedback for the salon. The salon can reply or hide a review.
create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  appointment_id uuid unique references appointments(id) on delete set null,
  staff_id uuid references staff(id) on delete set null,
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  services text,
  rating int check (rating between 1 and 5),
  body text,
  -- "Jamie R." as shown publicly
  display_name text,
  status text not null default 'requested' check (status in ('requested', 'published', 'private', 'hidden')),
  reply text,
  replied_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists reviews_public on reviews(business_id, status, submitted_at desc);

alter table reviews enable row level security;
drop policy if exists business_isolation on reviews;
create policy business_isolation on reviews for all
  using (business_id in (select my_business_ids()))
  with check (business_id in (select my_business_ids()));
grant select, insert, update, delete on reviews to authenticated;
grant all on reviews to service_role;

-- Social links and a review summary shown on the salon page.
alter table businesses add column if not exists social jsonb not null default '{}'::jsonb;
