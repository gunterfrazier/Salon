-- Booking overrides and per-person permissions.
--  * staff.permissions: changes for one person on top of their role ({ "pricing.adjust": false, ... }).
--  * staff_busy_blocks.overlap_ok: hands-on time the stylist confirmed as a double-booking.
--    The no-overlap rule skips those blocks; the app checks overlaps itself and asks first.
--  * appointments.outside_hours: booked outside the stylist's hours after a warning.

alter table staff add column if not exists permissions jsonb not null default '{}'::jsonb;
alter table staff_busy_blocks add column if not exists overlap_ok boolean not null default false;
alter table appointments add column if not exists outside_hours boolean not null default false;

-- Replace the unnamed no-double-booking constraint with one that skips confirmed overlaps.
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.staff_busy_blocks'::regclass and contype = 'x'
  loop
    execute format('alter table staff_busy_blocks drop constraint %I', c);
  end loop;
end $$;
alter table staff_busy_blocks
  add constraint staff_busy_blocks_no_overlap
  exclude using gist (staff_id with =, during with &&) where (not overlap_ok);

-- book_appointment: same as before, plus p.allow_overlap and p.outside_hours.
create or replace function public.book_appointment(p jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  appt_id uuid;
  line jsonb;
  line_id uuid;
  seg jsonb;
  st appointment_status := coalesce(nullif(p->>'status', ''), 'booked')::appointment_status;
  ok_overlap boolean := coalesce((p->>'allow_overlap')::boolean, false);
begin
  if st not in ('booked', 'pending') then
    raise exception 'New bookings must be booked or pending' using errcode = '22023';
  end if;
  if jsonb_array_length(coalesce(p->'services', '[]'::jsonb)) = 0 then
    raise exception 'Pick at least one service.' using errcode = '22023';
  end if;

  insert into appointments (business_id, client_id, staff_id, start_at, end_at, status, booked_via, deposit_required_cents, notes, policy_consent_id, outside_hours)
  values (
    (p->>'business_id')::uuid,
    (p->>'client_id')::uuid,
    (p->>'staff_id')::uuid,
    (p->>'start_at')::timestamptz,
    (p->>'end_at')::timestamptz,
    st,
    coalesce(p->>'booked_via', 'stylist'),
    coalesce((p->>'deposit_required_cents')::int, 0),
    nullif(p->>'notes', ''),
    nullif(p->>'policy_consent_id', '')::uuid,
    coalesce((p->>'outside_hours')::boolean, false)
  )
  returning id into appt_id;

  for line in select * from jsonb_array_elements(p->'services') loop
    insert into appointment_services (appointment_id, service_id, list_price_cents, discounts, price_quoted_cents, sort)
    values (
      appt_id,
      (line->>'service_id')::uuid,
      (line->>'list_price_cents')::int,
      coalesce(line->'discounts', '[]'::jsonb),
      (line->>'price_quoted_cents')::int,
      coalesce((line->>'sort')::int, 0)
    )
    returning id into line_id;

    for seg in select * from jsonb_array_elements(coalesce(line->'busy', '[]'::jsonb)) loop
      insert into staff_busy_blocks (business_id, staff_id, appointment_service_id, phase, during, overlap_ok)
      values (
        (p->>'business_id')::uuid,
        (p->>'staff_id')::uuid,
        line_id,
        seg->>'phase',
        tstzrange((seg->>'start')::timestamptz, (seg->>'end')::timestamptz, '[)'),
        ok_overlap
      );
    end loop;
  end loop;

  return appt_id;
end;
$$;

revoke all on function public.book_appointment(jsonb) from public, anon;
grant execute on function public.book_appointment(jsonb) to authenticated, service_role;
