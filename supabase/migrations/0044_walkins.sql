-- Walk-ins: a salon can take them (alongside appointments, or only walk-ins),
-- with its own rules for who gets the next one. People wait in a line; the app
-- predicts who will take each and how long the wait is.

alter table businesses add column if not exists walkin_settings jsonb not null default '{}'::jsonb;

create table if not exists walkins (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  name text not null check (length(name) between 1 and 100),
  phone text,
  service_ids uuid[] not null default '{}',
  -- Who they asked for (null: whoever is next).
  requested_staff_id uuid references staff(id) on delete set null,
  -- Who took them (set when their service starts).
  staff_id uuid references staff(id) on delete set null,
  status text not null default 'waiting' check (status in ('waiting', 'in_service', 'done', 'left', 'cancelled')),
  source text not null default 'desk' check (source in ('desk', 'kiosk', 'online')),
  -- How much this visit counts toward the stylist's turns (per the salon's rule).
  turn_weight numeric(8, 2) not null default 1,
  minutes int not null default 30 check (minutes between 5 and 720),
  appointment_id uuid references appointments(id) on delete set null,
  token text not null unique check (token ~ '^[0-9a-f]{64}$'),
  notified_at timestamptz,
  joined_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index if not exists walkins_line on walkins (business_id, status, joined_at);
create index if not exists walkins_turns on walkins (business_id, staff_id, started_at);
alter table walkins enable row level security;
create policy business_isolation on walkins for all
  using (business_id in (select my_business_ids())) with check (business_id in (select my_business_ids()));

-- Appointments started from the walk-in line.
alter table appointments drop constraint if exists appointments_booked_via_check;
alter table appointments add constraint appointments_booked_via_check check (booked_via in ('online', 'stylist', 'walkin'));
