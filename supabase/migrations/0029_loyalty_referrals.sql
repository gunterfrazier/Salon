-- Loyalty punch card and referrals. Rewards are earned into client_rewards
-- and used at checkout like a promo.
alter table businesses add column if not exists loyalty jsonb not null default '{}'::jsonb;

alter table clients add column if not exists referral_code text;
alter table clients add column if not exists referred_by uuid references clients(id) on delete set null;
create unique index if not exists clients_referral_code on clients(business_id, referral_code) where referral_code is not null;

create table if not exists client_rewards (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  kind text not null check (kind in ('loyalty', 'referral', 'welcome')),
  label text not null,
  discount_kind text not null check (discount_kind in ('percent', 'amount')),
  value int not null check (value > 0),
  -- referral: the friend who came in; welcome: who referred them
  other_client_id uuid references clients(id) on delete set null,
  -- the visit that earned it (one loyalty reward per earning visit)
  earned_appointment_id uuid references appointments(id) on delete set null,
  redeemed_appointment_id uuid references appointments(id) on delete set null,
  redeemed_cents int,
  redeemed_at timestamptz,
  expires_on date,
  created_at timestamptz not null default now(),
  unique (kind, earned_appointment_id)
);
create index if not exists client_rewards_client on client_rewards(client_id) where redeemed_at is null;

alter table client_rewards enable row level security;
drop policy if exists business_isolation on client_rewards;
create policy business_isolation on client_rewards for all
  using (business_id in (select my_business_ids()))
  with check (business_id in (select my_business_ids()));
grant select, insert, update, delete on client_rewards to authenticated;
grant all on client_rewards to service_role;
