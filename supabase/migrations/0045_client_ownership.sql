-- Who keeps the clients when a team member leaves: the salon only, or the
-- stylist also gets a copy in their own business (common for booth renters).
-- The salon never loses its records.
alter table businesses add column if not exists team_settings jsonb not null default '{}'::jsonb;
-- When (and into which business) a leaving team member's clients were copied.
alter table staff add column if not exists clients_copied_at timestamptz;
alter table staff add column if not exists clients_copied_to uuid references businesses(id) on delete set null;
