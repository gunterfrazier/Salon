-- How each team member is paid, and booth rent received.
alter table staff add column if not exists pay_type text not null default 'none' check (pay_type in ('none', 'commission', 'booth_rent'));
alter table staff add column if not exists service_commission_pct numeric(5, 2) not null default 0 check (service_commission_pct between 0 and 100);
alter table staff add column if not exists retail_commission_pct numeric(5, 2) not null default 0 check (retail_commission_pct between 0 and 100);
alter table staff add column if not exists booth_rent_cents int not null default 0 check (booth_rent_cents >= 0);
alter table staff add column if not exists booth_rent_period text not null default 'week' check (booth_rent_period in ('week', 'month'));
-- Booth renter takes their clients' payments directly (true), or the salon collects and pays them out (false).
alter table staff add column if not exists booth_collects_own boolean not null default true;

create table if not exists booth_rent_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  staff_id uuid not null references staff(id) on delete cascade,
  amount_cents int not null check (amount_cents > 0),
  method payment_method not null default 'cash',
  paid_on date not null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists booth_rent_payments_staff on booth_rent_payments(staff_id, paid_on);

alter table booth_rent_payments enable row level security;
drop policy if exists business_isolation on booth_rent_payments;
create policy business_isolation on booth_rent_payments for all
  using (business_id in (select my_business_ids()))
  with check (business_id in (select my_business_ids()));
grant select, insert, update, delete on booth_rent_payments to authenticated;
grant all on booth_rent_payments to service_role;
