-- Promo codes: a % or $ off services, used in online booking or at checkout.
create table if not exists promo_codes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  code text not null check (code ~ '^[A-Z0-9]{3,20}$'),
  description text,
  kind text not null check (kind in ('percent', 'amount')),
  -- percent: 1-100; amount: cents
  value int not null check (value > 0),
  -- null = every service
  service_ids uuid[],
  new_clients_only boolean not null default false,
  min_spend_cents int not null default 0 check (min_spend_cents >= 0),
  starts_on date,
  ends_on date,
  max_uses int check (max_uses is null or max_uses > 0),
  per_client int not null default 1 check (per_client > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (business_id, code),
  check (kind <> 'percent' or value <= 100),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create table if not exists promo_redemptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  promo_id uuid not null references promo_codes(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  appointment_id uuid references appointments(id) on delete cascade,
  discount_cents int not null check (discount_cents >= 0),
  created_at timestamptz not null default now(),
  unique (promo_id, appointment_id)
);
create index if not exists promo_redemptions_promo on promo_redemptions(promo_id);

do $$
declare t text;
begin
  foreach t in array array['promo_codes', 'promo_redemptions'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists business_isolation on %I', t);
    execute format($p$create policy business_isolation on %I for all
      using (business_id in (select my_business_ids()))
      with check (business_id in (select my_business_ids()))$p$, t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
    execute format('grant all on %I to service_role', t);
  end loop;
end $$;
