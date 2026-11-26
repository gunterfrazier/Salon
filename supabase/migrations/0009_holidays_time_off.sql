-- Holiday schedule and one-time days off.
-- businesses.holidays = { rules: [...] } holds the salon's on/off switches and
-- custom holidays; unset presets use the app's defaults (app/src/lib/schedule/holidays.ts).

alter table businesses add column if not exists holidays jsonb not null default '{}'::jsonb;

alter table time_off add column if not exists all_day boolean not null default false;
alter table time_off add column if not exists created_at timestamptz not null default now();
create index if not exists time_off_staff_range on time_off (staff_id, start_at, end_at);
