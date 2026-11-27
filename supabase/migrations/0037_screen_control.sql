-- Remote control for screens (next/back/pause, "play something else" for a while).
-- Kept apart from updated_at, so a tap on the remote doesn't reload every TV.
alter table screens add column if not exists control jsonb not null default '{}'::jsonb;
