-- Retail: products sold at checkout or as a quick sale (walk-ins too).
alter table payments alter column client_id drop not null;

create table if not exists sale_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  sale_id uuid not null,
  appointment_id uuid references appointments(id) on delete set null,
  client_id uuid references clients(id) on delete set null,
  product_id uuid references products(id) on delete set null,
  name text not null,
  qty numeric(10, 3) not null check (qty > 0),
  price_cents int not null check (price_cents >= 0),
  created_at timestamptz not null default now()
);
create index if not exists sale_items_business on sale_items (business_id, created_at desc);
create index if not exists sale_items_appointment on sale_items (appointment_id);
alter table sale_items enable row level security;
drop policy if exists business_isolation on sale_items;
create policy business_isolation on sale_items for all
  using (business_id in (select my_business_ids()))
  with check (business_id in (select my_business_ids()));
grant select, insert, update, delete on sale_items to authenticated;
grant all on sale_items to service_role;

-- Record retail items and take them out of stock. items = [{ product_id, qty, price_cents }]
create or replace function public.record_sale_items(biz uuid, sale uuid, appt uuid, client uuid, items jsonb)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  it jsonb;
  prod products%rowtype;
  total int := 0;
begin
  for it in select * from jsonb_array_elements(coalesce(items, '[]'::jsonb)) loop
    select * into prod from products where id = (it->>'product_id')::uuid and business_id = biz;
    if not found then
      raise exception 'Product not found' using errcode = 'P0002';
    end if;
    insert into sale_items (business_id, sale_id, appointment_id, client_id, product_id, name, qty, price_cents)
    values (biz, sale, appt, client, prod.id, trim(prod.brand || ' ' || coalesce(prod.line || ' ', '') || prod.name),
            (it->>'qty')::numeric, (it->>'price_cents')::int);
    perform stock_move(jsonb_build_object('product_id', prod.id, 'reason', 'sold', 'change', -(it->>'qty')::numeric,
                                          'appointment_id', appt, 'client_id', client, 'note', 'Sold'));
    total := total + round((it->>'qty')::numeric * (it->>'price_cents')::int);
  end loop;
  return total;
end;
$$;
revoke all on function public.record_sale_items(uuid, uuid, uuid, uuid, jsonb) from public, anon;
grant execute on function public.record_sale_items(uuid, uuid, uuid, uuid, jsonb) to authenticated, service_role;

-- Checkout, now with retail.
-- p = { appointment_id, lines: [{id, price_cents}], tip_cents, retail: [{product_id, qty, price_cents}],
--       payment: null | { method, amount_cents, tip_cents, retail_cents, reference }, balance_cents, refund_cents }
create or replace function public.checkout_appointment(p jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  appt appointments%rowtype;
  line jsonb;
  paid int := coalesce((p->'payment'->>'amount_cents')::int, 0);
  tip_paid int := coalesce((p->'payment'->>'tip_cents')::int, 0);
  retail_paid int := coalesce((p->'payment'->>'retail_cents')::int, 0);
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

  perform record_sale_items(appt.business_id, appt.id, appt.id, appt.client_id, p->'retail');

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

-- A retail sale without an appointment. Paid in full.
-- p = { business_id, client_id (optional), items: [...], payment: { method, reference } } → sale id
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
begin
  if jsonb_array_length(coalesce(p->'items', '[]'::jsonb)) = 0 then
    raise exception 'Add at least one product' using errcode = '22023';
  end if;
  total := record_sale_items(biz, sale, null, client, p->'items');
  if total > 0 then
    insert into payments (business_id, client_id, kind, method, amount_cents, status, external_reference, note)
    values (biz, client, 'retail', (p->'payment'->>'method')::payment_method, total, 'succeeded',
            nullif(p->'payment'->>'reference', ''), 'sale:' || sale::text);
  end if;
  return sale;
end;
$$;
revoke all on function public.quick_sale(jsonb) from public, anon;
grant execute on function public.quick_sale(jsonb) to authenticated, service_role;
