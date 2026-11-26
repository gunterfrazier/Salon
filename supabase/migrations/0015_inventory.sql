-- Inventory: products (color, developer, care, retail, supplies) and a stock history.
-- Quantities are in containers (tubes, bottles, jars), so 0.5 = half a tube.
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  kind text not null default 'color' check (kind in ('color', 'developer', 'lightener', 'treatment', 'care', 'retail', 'supply')),
  brand text not null,
  line text,
  shade text,
  name text not null,
  size numeric(10, 2),
  unit text not null default 'oz' check (unit in ('oz', 'ml', 'g', 'each')),
  barcode text,
  saloncentric_item text,
  cosmoprof_item text,
  vendor text check (vendor in ('saloncentric', 'cosmoprof', 'other')),
  cost_cents int check (cost_cents >= 0),
  price_cents int check (price_cents >= 0),
  on_hand numeric(10, 3) not null default 0,
  min_qty numeric(10, 3),
  max_qty numeric(10, 3),
  archived boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  check (min_qty is null or max_qty is null or max_qty >= min_qty)
);
create unique index if not exists products_identity on products (business_id, lower(brand), lower(coalesce(line, '')), lower(coalesce(shade, name)), coalesce(size, 0));
create unique index if not exists products_barcode on products (business_id, barcode) where barcode is not null;
create index if not exists products_business on products (business_id, archived);

create table if not exists stock_moves (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  change numeric(10, 3) not null,
  on_hand_after numeric(10, 3) not null,
  reason text not null check (reason in ('received', 'used', 'sold', 'count', 'adjust')),
  -- What was measured, e.g. 1.5 oz or 40 g (for usage per client).
  amount numeric(10, 2),
  unit text check (unit in ('oz', 'ml', 'g', 'each', 'container')),
  appointment_id uuid references appointments(id) on delete set null,
  client_id uuid references clients(id) on delete set null,
  formula_id uuid references color_formulas(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists stock_moves_product on stock_moves (product_id, created_at desc);
create index if not exists stock_moves_client on stock_moves (client_id, created_at desc);
create index if not exists stock_moves_formula on stock_moves (formula_id);

do $$
declare t text;
begin
  foreach t in array array['products', 'stock_moves'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists business_isolation on %I', t);
    execute format($p$create policy business_isolation on %I for all
      using (business_id in (select my_business_ids()))
      with check (business_id in (select my_business_ids()))$p$, t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
    execute format('grant all on %I to service_role', t);
  end loop;
end $$;

-- Change stock and record why, in one step.
-- p = { product_id, reason, change (containers; negative = out) | count (new on-hand for reason 'count'),
--       amount, unit, appointment_id, client_id, formula_id, note }
create or replace function public.stock_move(p jsonb)
returns numeric
language plpgsql
security invoker
set search_path = public
as $$
declare
  prod products%rowtype;
  delta numeric;
  after numeric;
begin
  select * into prod from products where id = (p->>'product_id')::uuid for update;
  if not found then
    raise exception 'Product not found' using errcode = 'P0002';
  end if;
  if p->>'reason' = 'count' then
    if (p->>'count')::numeric < 0 then
      raise exception 'Count can''t be negative' using errcode = '22023';
    end if;
    delta := (p->>'count')::numeric - prod.on_hand;
  else
    delta := (p->>'change')::numeric;
  end if;
  update products set on_hand = on_hand + delta where id = prod.id returning on_hand into after;
  insert into stock_moves (business_id, product_id, change, on_hand_after, reason, amount, unit, appointment_id, client_id, formula_id, note)
  values (prod.business_id, prod.id, delta, after, p->>'reason', (p->>'amount')::numeric, p->>'unit',
          (p->>'appointment_id')::uuid, (p->>'client_id')::uuid, (p->>'formula_id')::uuid, nullif(p->>'note', ''));
  return after;
end;
$$;
revoke all on function public.stock_move(jsonb) from public, anon;
grant execute on function public.stock_move(jsonb) to authenticated, service_role;
