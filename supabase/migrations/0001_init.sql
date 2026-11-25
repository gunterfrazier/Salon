-- SalonOS (working title) initial schema. See docs/SPEC.md §7.
-- Every business-owned row carries business_id; RLS limits staff to their business.
-- Money is stored as integer cents.

create extension if not exists btree_gist;

create type payment_method as enum (
  'card', 'google_pay', 'apple_pay', 'cash_app_pay',       -- Stripe (can be saved)
  'paypal', 'venmo',                                       -- PayPal checkout
  'venmo_direct', 'cash_app_direct', 'paypal_me', 'zelle', 'apple_cash', 'cash', 'other'  -- recorded by stylist
);

-- ---------------------------------------------------------------- tenancy ---
create table businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  timezone text not null default 'America/New_York',
  policy_settings jsonb not null,          -- seed/policies.json
  booking_settings jsonb not null default '{}'::jsonb,
  -- {"mon": null, "tue": ["15:30","19:00"], ...}
  business_hours jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create type staff_role as enum ('owner', 'stylist', 'renter', 'front_desk');

create table staff (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  role staff_role not null default 'stylist',
  display_name text not null,
  phone text,
  email text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function my_business_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select business_id from staff where auth_user_id = auth.uid() and active
$$;

-- --------------------------------------------------------------- services ---
create type price_type as enum ('fixed', 'starting_at', 'hourly', 'free');
create type deposit_category as enum ('color', 'standard');

create table service_categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  key text not null,
  name text not null,
  sort int not null default 0,
  unique (business_id, key)
);

create table services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  category_id uuid not null references service_categories(id),
  key text not null,
  name text not null,
  description text,
  price_type price_type not null,
  price_cents int not null check (price_cents >= 0),
  estimated_hours numeric(4,2),
  active_min int not null check (active_min >= 0),
  processing_min int not null default 0 check (processing_min >= 0),
  finish_min int not null default 0 check (finish_min >= 0),
  allow_booking_in_processing boolean not null default true,
  deposit_category deposit_category not null default 'standard',
  uses_length_modifier boolean not null default false,
  requires_consult_service_id uuid references services(id),
  bookable_online boolean not null default true,
  is_add_on boolean not null default false,
  attaches_to text[] not null default '{}',
  sort int not null default 0,
  archived boolean not null default false,
  unique (business_id, key)
);

-- ---------------------------------------------------------------- clients ---
create type client_source as enum ('styleseat_import', 'online', 'manual');
create type deposit_override as enum ('none', 'amount', 'full');

create table clients (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  first_name text not null,
  last_name text,
  phone text,
  email text,
  notes text,
  stripe_customer_id text,
  has_saved_payment_method boolean not null default false,
  preferred_payment_method payment_method,
  deposit_override deposit_override not null default 'none',
  deposit_override_cents int,
  -- Visits completed before import (e.g. StyleSeat) so imported regulars aren't "new".
  prior_visit_count int not null default 0,
  sms_opt_in boolean not null default false,
  source client_source not null default 'manual',
  created_at timestamptz not null default now()
);
create index clients_business_phone on clients(business_id, phone);

create type flag_type as enum ('late_cancel', 'no_show');

-- ----------------------------------------------------------- appointments ---
-- pending = waiting for a prepaid deposit (Zelle, Venmo, etc.) before it's confirmed.
create type appointment_status as enum
  ('pending', 'booked', 'confirmed', 'checked_in', 'in_service', 'completed', 'cancelled', 'no_show');

create table policy_consents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  policy_version text not null,
  policy_text text not null,
  accepted_at timestamptz not null default now(),
  ip inet,
  user_agent text
);

create table appointments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  client_id uuid not null references clients(id),
  staff_id uuid not null references staff(id),
  start_at timestamptz not null,
  end_at timestamptz not null check (end_at > start_at),
  status appointment_status not null default 'booked',
  booked_via text not null check (booked_via in ('online', 'stylist')),
  deposit_required_cents int not null default 0,
  cancelled_by text check (cancelled_by in ('client', 'stylist')),
  cancel_reason text,
  cancelled_at timestamptz,
  policy_consent_id uuid references policy_consents(id),
  notes text,
  -- Completed without a late cancel or no-show; counts toward clearing flags.
  on_time boolean generated always as (status = 'completed') stored,
  created_at timestamptz not null default now()
);
create index appointments_calendar on appointments(business_id, staff_id, start_at);

-- Violation record. Never deleted: it is the client's permanent history.
-- Active vs. resolved is computed (app/src/lib/policy/flags.ts) from
-- on-time visits since the flag, the optional time limit, `permanent`
-- and `cleared_at`.
create table client_flags (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  type flag_type not null,
  appointment_id uuid not null references appointments(id),
  created_at timestamptz not null default now(),
  fee_charged_cents int,
  permanent boolean not null default false,
  made_permanent_at timestamptz,
  made_permanent_by uuid references staff(id),
  cleared_at timestamptz,
  cleared_by uuid references staff(id),
  clear_note text,
  check ((cleared_at is null) = (clear_note is null))
);
create index client_flags_client on client_flags(client_id);

create table appointment_services (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references appointments(id) on delete cascade,
  service_id uuid not null references services(id),
  list_price_cents int not null,          -- menu price or stylist's custom price
  discounts jsonb not null default '[]',   -- [{source: bundle|manual, label, amount_cents}]
  price_quoted_cents int not null,         -- after discounts
  length_modifier text,
  sort int not null default 0
);

-- The stylist's busy time (active + finish phases). Processing phases are
-- deliberately absent so other services can be booked inside them.
-- Rows are deleted when an appointment is cancelled / marked no-show.
create table staff_busy_blocks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  staff_id uuid not null references staff(id),
  appointment_service_id uuid not null references appointment_services(id) on delete cascade,
  phase text not null check (phase in ('active', 'finish')),
  during tstzrange not null,
  exclude using gist (staff_id with =, during with &&)
);

-- --------------------------------------------------------------- payments ---
create type payment_kind as enum
  ('deposit', 'service', 'retail', 'tip', 'cancel_fee', 'no_show_fee', 'balance', 'refund');

create table payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  client_id uuid not null references clients(id),
  appointment_id uuid references appointments(id),
  kind payment_kind not null,
  method payment_method not null,
  amount_cents int not null,
  -- requested = payment request sent (Zelle/Venmo/...), waiting for the stylist to mark it received
  status text not null default 'pending' check (status in ('requested', 'pending', 'succeeded', 'failed', 'refunded')),
  stripe_payment_intent_id text,
  paypal_order_id text,
  external_reference text,                 -- e.g. Zelle confirmation # or Venmo note
  note text,
  created_at timestamptz not null default now()
);

create table balances (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  client_id uuid not null references clients(id),
  appointment_id uuid references appointments(id),
  amount_cents int not null check (amount_cents > 0),
  reason text not null,
  settled_payment_id uuid references payments(id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------- client records ---
create table color_formulas (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  appointment_id uuid references appointments(id),
  formula_text text not null,
  developer text,
  processing_min int,
  notes text,
  photo_paths text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table time_off (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  staff_id uuid not null references staff(id),
  start_at timestamptz not null,
  end_at timestamptz not null check (end_at > start_at),
  reason text
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  client_id uuid references clients(id),
  channel text not null check (channel in ('sms', 'email')),
  template text not null,
  body text not null,
  status text not null default 'queued',
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

-- -------------------------------------------------------------------- RLS ---
-- Staff see only their business. The public booking page never queries
-- tables directly; it goes through server routes using the service role.
do $$
declare t text;
begin
  foreach t in array array[
    'service_categories','services','clients','policy_consents','appointments',
    'client_flags','appointment_services','staff_busy_blocks','payments','balances',
    'color_formulas','time_off','messages','staff'
  ] loop
    execute format('alter table %I enable row level security', t);
    if t = 'appointment_services' then
      execute format($p$create policy business_isolation on %I for all
        using (appointment_id in (select id from appointments where business_id in (select my_business_ids())))
        with check (appointment_id in (select id from appointments where business_id in (select my_business_ids())))$p$, t);
    else
      execute format($p$create policy business_isolation on %I for all
        using (business_id in (select my_business_ids()))
        with check (business_id in (select my_business_ids()))$p$, t);
    end if;
  end loop;
end $$;

alter table businesses enable row level security;
create policy business_isolation on businesses for all
  using (id in (select my_business_ids())) with check (id in (select my_business_ids()));
