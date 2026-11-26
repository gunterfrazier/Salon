-- Web push to the stylist's own devices (Android Chrome, desktop browsers).
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  staff_id uuid not null references staff(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  device text,
  created_at timestamptz not null default now(),
  last_ok_at timestamptz,
  failures int not null default 0
);
alter table push_subscriptions enable row level security;
drop policy if exists business_isolation on push_subscriptions;
create policy business_isolation on push_subscriptions for all
  using (business_id in (select my_business_ids()))
  with check (business_id in (select my_business_ids()));
grant select, insert, update, delete on push_subscriptions to authenticated;
grant all on push_subscriptions to service_role;

-- Server-only secrets the app generates itself (e.g. the push signing key).
-- RLS on with no policies: only the service role can read it.
create table if not exists app_secrets (
  key text primary key,
  value jsonb not null,
  created_at timestamptz not null default now()
);
alter table app_secrets enable row level security;
revoke all on app_secrets from anon, authenticated;
grant all on app_secrets to service_role;

-- Messages can now go out as push notifications.
alter table messages drop constraint if exists messages_channel_check;
alter table messages add constraint messages_channel_check check (channel in ('sms', 'email', 'push'));
