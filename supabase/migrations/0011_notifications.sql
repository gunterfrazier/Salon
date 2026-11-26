-- Notifications: per-salon settings and a message outbox.
-- Settings are merged over app/seed/notifications.json in the app, so '{}' means "all defaults".
alter table businesses add column if not exists notification_settings jsonb not null default '{}'::jsonb;

-- Who a message is for, which appointment it's about, and a unique key so the
-- scheduler can run any number of times without sending anything twice.
alter table messages add column if not exists appointment_id uuid references appointments(id) on delete set null;
alter table messages add column if not exists audience text not null default 'client' check (audience in ('client', 'stylist'));
alter table messages add column if not exists to_address text;
alter table messages add column if not exists dedupe_key text;
alter table messages add column if not exists send_after timestamptz not null default now();
alter table messages add column if not exists attempts int not null default 0;
alter table messages add column if not exists error text;
alter table messages add column if not exists provider_id text;
alter table messages alter column client_id drop not null;

alter table messages drop constraint if exists messages_status_check;
alter table messages add constraint messages_status_check
  check (status in ('queued', 'sending', 'sent', 'delivered', 'failed', 'skipped'));

create unique index if not exists messages_dedupe on messages(business_id, dedupe_key, channel) where dedupe_key is not null;
create index if not exists messages_outbox on messages(status, send_after) where status = 'queued';
create index if not exists messages_appointment on messages(appointment_id);
