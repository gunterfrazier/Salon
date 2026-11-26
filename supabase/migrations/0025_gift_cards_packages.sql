-- Gift cards (a balance spent at checkout) and packages (prepaid visits for one service).

create table if not exists gift_cards (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  code text not null,
  initial_cents int not null check (initial_cents > 0),
  balance_cents int not null check (balance_cents >= 0),
  purchaser_client_id uuid references clients(id) on delete set null,
  recipient_name text,
  message text,
  status text not null default 'active' check (status in ('active', 'void')),
  expires_on date,
  created_at timestamptz not null default now(),
  unique (business_id, code)
);

create table if not exists gift_card_moves (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  card_id uuid not null references gift_cards(id) on delete cascade,
  change_cents int not null,
  kind text not null check (kind in ('issue', 'redeem', 'adjust', 'void')),
  appointment_id uuid references appointments(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists gift_card_moves_card on gift_card_moves(card_id, created_at);

create table if not exists package_templates (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  service_id uuid not null references services(id) on delete cascade,
  visits int not null check (visits between 1 and 100),
  price_cents int not null check (price_cents >= 0),
  expire_months int check (expire_months is null or expire_months between 1 and 60),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists client_packages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  template_id uuid references package_templates(id) on delete set null,
  name text not null,
  service_id uuid not null references services(id),
  visits_total int not null check (visits_total > 0),
  visits_used int not null default 0 check (visits_used >= 0 and visits_used <= visits_total),
  price_cents int not null check (price_cents >= 0),
  expires_on date,
  status text not null default 'active' check (status in ('active', 'void')),
  created_at timestamptz not null default now()
);
create index if not exists client_packages_client on client_packages(client_id);

create table if not exists package_uses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  client_package_id uuid not null references client_packages(id) on delete cascade,
  appointment_id uuid references appointments(id) on delete set null,
  appointment_service_id uuid references appointment_services(id) on delete set null,
  created_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['gift_cards', 'gift_card_moves', 'package_templates', 'client_packages', 'package_uses'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists business_isolation on %I', t);
    execute format($p$create policy business_isolation on %I for all
      using (business_id in (select my_business_ids()))
      with check (business_id in (select my_business_ids()))$p$, t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
    execute format('grant all on %I to service_role', t);
  end loop;
end $$;

-- A short code that's easy to read aloud: no 0/O, 1/I/L.
create or replace function public.new_gift_code(biz uuid)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  c text;
begin
  loop
    c := '';
    for i in 1..8 loop
      c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from gift_cards where business_id = biz and code = c);
  end loop;
  return c;
end;
$$;

-- Sell a gift card. p = { business_id, client_id?, amount_cents, recipient_name?, message?, expires_on?, method, reference? }
create or replace function public.sell_gift_card(p jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  biz uuid := (p->>'business_id')::uuid;
  amt int := (p->>'amount_cents')::int;
  card gift_cards%rowtype;
begin
  if amt is null or amt <= 0 or amt > 100000 then
    raise exception 'Enter an amount up to $1,000' using errcode = '22023';
  end if;
  insert into gift_cards (business_id, code, initial_cents, balance_cents, purchaser_client_id, recipient_name, message, expires_on)
  values (biz, new_gift_code(biz), amt, amt, nullif(p->>'client_id', '')::uuid, nullif(trim(p->>'recipient_name'), ''), nullif(trim(p->>'message'), ''), nullif(p->>'expires_on', '')::date)
  returning * into card;
  insert into gift_card_moves (business_id, card_id, change_cents, kind, note) values (biz, card.id, amt, 'issue', 'Sold');
  insert into payments (business_id, client_id, kind, method, amount_cents, status, external_reference, note)
  values (biz, card.purchaser_client_id, 'gift_card', (p->>'method')::payment_method, amt, 'succeeded', nullif(p->>'reference', ''), 'gift_card:' || card.code);
  return jsonb_build_object('id', card.id, 'code', card.code);
end;
$$;

-- Take money off a gift card (locks it, checks the balance). Returns the new balance.
create or replace function public.redeem_gift_card(biz uuid, card uuid, amt int, appt uuid, note text)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  g gift_cards%rowtype;
begin
  select * into g from gift_cards where id = card and business_id = biz for update;
  if not found or g.status <> 'active' then
    raise exception 'Gift card not found' using errcode = 'P0002';
  end if;
  if g.expires_on is not null and g.expires_on < current_date then
    raise exception 'This gift card has expired' using errcode = '22023';
  end if;
  if amt <= 0 or amt > g.balance_cents then
    raise exception 'The gift card only has % left', to_char(g.balance_cents / 100.0, 'FM$999,990.00') using errcode = '22023';
  end if;
  update gift_cards set balance_cents = balance_cents - amt where id = g.id;
  insert into gift_card_moves (business_id, card_id, change_cents, kind, appointment_id, note) values (biz, g.id, -amt, 'redeem', appt, note);
  return g.balance_cents - amt;
end;
$$;

-- Sell a package of visits. p = { business_id, client_id, template_id, method, reference? }
create or replace function public.sell_package(p jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  biz uuid := (p->>'business_id')::uuid;
  t package_templates%rowtype;
  cp uuid;
begin
  select * into t from package_templates where id = (p->>'template_id')::uuid and business_id = biz and active;
  if not found then
    raise exception 'Package not found' using errcode = 'P0002';
  end if;
  insert into client_packages (business_id, client_id, template_id, name, service_id, visits_total, price_cents, expires_on)
  values (biz, (p->>'client_id')::uuid, t.id, t.name, t.service_id, t.visits, t.price_cents,
          case when t.expire_months is null then null else (current_date + make_interval(months => t.expire_months))::date end)
  returning id into cp;
  if t.price_cents > 0 then
    insert into payments (business_id, client_id, kind, method, amount_cents, status, external_reference, note)
    values (biz, (p->>'client_id')::uuid, 'package', (p->>'method')::payment_method, t.price_cents, 'succeeded', nullif(p->>'reference', ''), 'package:' || cp::text);
  end if;
  return cp;
end;
$$;

-- Checkout, now with gift cards and package visits.
-- Adds to the earlier payload:
--   gift: null | { card_id, service_cents, retail_cents, tip_cents }   (paid from a gift card)
--   package_uses: [{ client_package_id, appointment_service_id }]       (those lines are priced 0)
create or replace function public.checkout_appointment(p jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  appt appointments%rowtype;
  line jsonb;
  use jsonb;
  paid int := coalesce((p->'payment'->>'amount_cents')::int, 0);
  tip_paid int := coalesce((p->'payment'->>'tip_cents')::int, 0);
  retail_paid int := coalesce((p->'payment'->>'retail_cents')::int, 0);
  g_service int := coalesce((p->'gift'->>'service_cents')::int, 0);
  g_retail int := coalesce((p->'gift'->>'retail_cents')::int, 0);
  g_tip int := coalesce((p->'gift'->>'tip_cents')::int, 0);
begin
  update appointments
     set status = 'completed'
   where id = (p->>'appointment_id')::uuid
     and appointment_is_open(status)
  returning * into appt;
  if not found then
    raise exception 'This appointment is already closed.' using errcode = 'P0002';
  end if;

  for line in select * from jsonb_array_elements(coalesce(p->'lines', '[]'::jsonb)) loop
    update appointment_services
       set price_quoted_cents = (line->>'price_cents')::int
     where id = (line->>'id')::uuid and appointment_id = appt.id;
  end loop;

  -- Package visits: one use per line, from the client's own active package for that service.
  for use in select * from jsonb_array_elements(coalesce(p->'package_uses', '[]'::jsonb)) loop
    update client_packages cp
       set visits_used = visits_used + 1
     where cp.id = (use->>'client_package_id')::uuid
       and cp.business_id = appt.business_id
       and cp.client_id = appt.client_id
       and cp.status = 'active'
       and cp.visits_used < cp.visits_total
       and (cp.expires_on is null or cp.expires_on >= current_date)
       and cp.service_id = (select service_id from appointment_services where id = (use->>'appointment_service_id')::uuid and appointment_id = appt.id);
    if not found then
      raise exception 'That package can''t be used for this service.' using errcode = '22023';
    end if;
    update appointment_services set price_quoted_cents = 0 where id = (use->>'appointment_service_id')::uuid and appointment_id = appt.id;
    insert into package_uses (business_id, client_package_id, appointment_id, appointment_service_id)
    values (appt.business_id, (use->>'client_package_id')::uuid, appt.id, (use->>'appointment_service_id')::uuid);
  end loop;

  perform record_sale_items(appt.business_id, appt.id, appt.id, appt.client_id, p->'retail');

  if g_service + g_retail + g_tip > 0 then
    perform redeem_gift_card(appt.business_id, (p->'gift'->>'card_id')::uuid, g_service + g_retail + g_tip, appt.id, 'Checkout');
    if g_service > 0 then
      insert into payments (business_id, client_id, appointment_id, kind, method, amount_cents, status, note)
      values (appt.business_id, appt.client_id, appt.id, 'service', 'gift_card', g_service, 'succeeded', 'gift_card:' || (p->'gift'->>'card_id'));
    end if;
    if g_retail > 0 then
      insert into payments (business_id, client_id, appointment_id, kind, method, amount_cents, status, note)
      values (appt.business_id, appt.client_id, appt.id, 'retail', 'gift_card', g_retail, 'succeeded', 'gift_card:' || (p->'gift'->>'card_id'));
    end if;
    if g_tip > 0 then
      insert into payments (business_id, client_id, appointment_id, kind, method, amount_cents, status, note)
      values (appt.business_id, appt.client_id, appt.id, 'tip', 'gift_card', g_tip, 'succeeded', 'gift_card:' || (p->'gift'->>'card_id'));
    end if;
  end if;

  if paid - tip_paid - retail_paid > 0 then
    insert into payments (business_id, client_id, appointment_id, kind, method, amount_cents, status, external_reference)
    values (appt.business_id, appt.client_id, appt.id, 'service', (p->'payment'->>'method')::payment_method,
            paid - tip_paid - retail_paid, 'succeeded', nullif(p->'payment'->>'reference', ''));
  end if;
  if retail_paid > 0 then
    insert into payments (business_id, client_id, appointment_id, kind, method, amount_cents, status, external_reference)
    values (appt.business_id, appt.client_id, appt.id, 'retail', (p->'payment'->>'method')::payment_method,
            retail_paid, 'succeeded', nullif(p->'payment'->>'reference', ''));
  end if;
  if tip_paid > 0 then
    insert into payments (business_id, client_id, appointment_id, kind, method, amount_cents, status, external_reference)
    values (appt.business_id, appt.client_id, appt.id, 'tip', (p->'payment'->>'method')::payment_method,
            tip_paid, 'succeeded', nullif(p->'payment'->>'reference', ''));
  end if;

  if coalesce((p->>'balance_cents')::int, 0) > 0 then
    insert into balances (business_id, client_id, appointment_id, amount_cents, reason)
    values (appt.business_id, appt.client_id, appt.id, (p->>'balance_cents')::int, 'Unpaid at checkout');
  end if;

  if coalesce((p->>'refund_cents')::int, 0) > 0 then
    insert into payments (business_id, client_id, appointment_id, kind, method, amount_cents, status, note)
    values (appt.business_id, appt.client_id, appt.id, 'refund', 'other', -(p->>'refund_cents')::int, 'pending', 'Deposit was more than the bill');
  end if;
end;
$$;

-- Quick sale, now optionally paid (in part or full) with a gift card.
-- p = { business_id, client_id?, items, payment: { method, reference }, gift: null | { card_id, amount_cents } }
create or replace function public.quick_sale(p jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  sale uuid := gen_random_uuid();
  total int;
  biz uuid := (p->>'business_id')::uuid;
  client uuid := nullif(p->>'client_id', '')::uuid;
  gift int := coalesce((p->'gift'->>'amount_cents')::int, 0);
begin
  if jsonb_array_length(coalesce(p->'items', '[]'::jsonb)) = 0 then
    raise exception 'Add at least one product' using errcode = '22023';
  end if;
  total := record_sale_items(biz, sale, null, client, p->'items');
  if gift > total then
    raise exception 'The gift card amount is more than the sale' using errcode = '22023';
  end if;
  if gift > 0 then
    perform redeem_gift_card(biz, (p->'gift'->>'card_id')::uuid, gift, null, 'Sale');
    insert into payments (business_id, client_id, kind, method, amount_cents, status, note)
    values (biz, client, 'retail', 'gift_card', gift, 'succeeded', 'sale:' || sale::text);
  end if;
  if total - gift > 0 then
    insert into payments (business_id, client_id, kind, method, amount_cents, status, external_reference, note)
    values (biz, client, 'retail', (p->'payment'->>'method')::payment_method, total - gift, 'succeeded',
            nullif(p->'payment'->>'reference', ''), 'sale:' || sale::text);
  end if;
  return sale;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['public.new_gift_code(uuid)', 'public.sell_gift_card(jsonb)', 'public.redeem_gift_card(uuid, uuid, int, uuid, text)', 'public.sell_package(jsonb)', 'public.checkout_appointment(jsonb)', 'public.quick_sale(jsonb)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
