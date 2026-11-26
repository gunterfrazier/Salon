-- Waitlist: clients waiting for a time that isn't open yet. The message
-- scheduler offers matching openings (at most once a day per entry) and marks
-- an entry booked once the client books those services in its date range.
create table if not exists waitlist (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  -- null = anyone who offers the services
  staff_id uuid references staff(id) on delete set null,
  service_ids uuid[] not null check (cardinality(service_ids) > 0),
  -- 0 = Sunday … 6 = Saturday; empty = any day
  weekdays int[] not null default '{}',
  -- start time window, minutes after midnight salon time
  time_from int not null default 0 check (time_from between 0 and 1440),
  time_to int not null default 1440 check (time_to between 0 and 1440 and time_to > time_from),
  date_from date not null,
  date_to date not null check (date_to >= date_from),
  note text,
  source text not null default 'staff' check (source in ('staff', 'online')),
  status text not null default 'active' check (status in ('active', 'booked', 'expired', 'removed')),
  offers int not null default 0,
  last_offered_at timestamptz,
  -- "date minutes" keys of the openings in the last offer, so the same ones aren't re-sent
  last_offered_slots text[] not null default '{}',
  closed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists waitlist_active on waitlist(business_id, status) where status = 'active';
create index if not exists waitlist_client on waitlist(client_id);

alter table waitlist enable row level security;
drop policy if exists business_isolation on waitlist;
create policy business_isolation on waitlist for all
  using (business_id in (select my_business_ids()))
  with check (business_id in (select my_business_ids()));
grant select, insert, update, delete on waitlist to authenticated;
grant all on waitlist to service_role;
