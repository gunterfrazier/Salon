-- Client favorites for finding appointments: usual services, days, time of day.
-- { serviceIds: uuid[], weekdays: int[], block: "morning" | "afternoon" | "evening" | "any" | {from, to} }
alter table clients add column if not exists preferences jsonb not null default '{}'::jsonb;
