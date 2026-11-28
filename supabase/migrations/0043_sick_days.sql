-- Sick days: a stylist is out; each affected client gets a link to pick a new
-- time (same stylist another day, or a substitute), with optional discounts the
-- salon sets (amount, who pays, whether they stack).

alter table businesses add column if not exists sick_settings jsonb not null default '{}'::jsonb;

create table if not exists sick_days (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  staff_id uuid not null references staff(id) on delete cascade,
  starts_on date not null,
  ends_on date not null check (ends_on >= starts_on),
  reason text,
  time_off_id uuid references time_off(id) on delete set null,
  created_by uuid references staff(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists sick_days_business on sick_days (business_id, starts_on desc);

create table if not exists sick_offers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  sick_day_id uuid not null references sick_days(id) on delete cascade,
  appointment_id uuid not null references appointments(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  -- When it was booked for before the stylist went out (the appointment itself may move).
  original_start timestamptz not null,
  token text not null unique check (token ~ '^[0-9a-f]{64}$'),
  status text not null default 'open' check (status in ('open', 'rescheduled', 'cancelled', 'expired', 'handled')),
  expires_at timestamptz not null,
  -- What they picked: which option, with whom, when, and the discount (with who pays it).
  choice text,
  new_staff_id uuid references staff(id) on delete set null,
  new_start timestamptz,
  discount_cents int not null default 0 check (discount_cents >= 0),
  salon_pays_cents int not null default 0 check (salon_pays_cents >= 0),
  stylist_pays_cents int not null default 0 check (stylist_pays_cents >= 0),
  sent_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (sick_day_id, appointment_id)
);
create index if not exists sick_offers_business on sick_offers (business_id, status);

do $$
declare t text;
begin
  foreach t in array array['sick_days', 'sick_offers'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists business_isolation on %I', t);
    execute format($p$create policy business_isolation on %I for all
      using (business_id in (select my_business_ids()))
      with check (business_id in (select my_business_ids()))$p$, t);
  end loop;
end $$;

-- Rebook an upcoming appointment in place: new stylist and/or time, new prices
-- for its services (same services), new busy time. The deposit stays with it.
-- A time someone else took is refused by the overlap rule (23P01).
create or replace function public.rebook_appointment(p jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  appt appointments%rowtype;
  line jsonb;
  line_id uuid;
  seg jsonb;
begin
  select * into appt from appointments
   where id = (p->>'appointment_id')::uuid and status in ('pending', 'booked', 'confirmed')
   for update;
  if not found then
    raise exception 'Only upcoming appointments can be rebooked.' using errcode = 'P0002';
  end if;

  delete from staff_busy_blocks
   where appointment_service_id in (select id from appointment_services where appointment_id = appt.id);

  for line in select * from jsonb_array_elements(p->'services') loop
    update appointment_services
       set list_price_cents = (line->>'list_price_cents')::int,
           discounts = coalesce(line->'discounts', '[]'::jsonb),
           price_quoted_cents = (line->>'price_quoted_cents')::int,
           sort = coalesce((line->>'sort')::int, sort)
     where appointment_id = appt.id and service_id = (line->>'service_id')::uuid
    returning id into line_id;
    if line_id is null then
      raise exception 'The services changed. Refresh and try again.' using errcode = '22023';
    end if;
    for seg in select * from jsonb_array_elements(coalesce(line->'busy', '[]'::jsonb)) loop
      insert into staff_busy_blocks (business_id, staff_id, appointment_service_id, phase, during)
      values (appt.business_id, (p->>'staff_id')::uuid, line_id, seg->>'phase', tstzrange((seg->>'start')::timestamptz, (seg->>'end')::timestamptz, '[)'));
    end loop;
  end loop;

  update appointments
     set staff_id = (p->>'staff_id')::uuid,
         start_at = (p->>'start_at')::timestamptz,
         end_at = (p->>'end_at')::timestamptz,
         outside_hours = false
   where id = appt.id;
end;
$$;

revoke all on function public.rebook_appointment(jsonb) from public, anon;
grant execute on function public.rebook_appointment(jsonb) to authenticated, service_role;
