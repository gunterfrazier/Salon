-- Save a booking in one transaction: the appointment, its services, and the
-- stylist's busy blocks (hands-on time). Runs as the signed-in user, so
-- row-level security still applies. Overlapping busy time fails with the
-- exclusion constraint (SQLSTATE 23P01) and nothing is saved.
--
-- p = {
--   business_id, client_id, staff_id, start_at, end_at, booked_via,
--   deposit_required_cents, notes,
--   services: [{ service_id, list_price_cents, discounts, price_quoted_cents,
--                sort, busy: [{ phase, start, end }] }]
-- }

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
begin
  if jsonb_array_length(coalesce(p->'services', '[]'::jsonb)) = 0 then
    raise exception 'Pick at least one service.' using errcode = '22023';
  end if;

  insert into appointments (business_id, client_id, staff_id, start_at, end_at, status, booked_via, deposit_required_cents, notes)
  values (
    (p->>'business_id')::uuid,
    (p->>'client_id')::uuid,
    (p->>'staff_id')::uuid,
    (p->>'start_at')::timestamptz,
    (p->>'end_at')::timestamptz,
    'booked',
    coalesce(p->>'booked_via', 'stylist'),
    coalesce((p->>'deposit_required_cents')::int, 0),
    nullif(p->>'notes', '')
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
      insert into staff_busy_blocks (business_id, staff_id, appointment_service_id, phase, during)
      values (
        (p->>'business_id')::uuid,
        (p->>'staff_id')::uuid,
        line_id,
        seg->>'phase',
        tstzrange((seg->>'start')::timestamptz, (seg->>'end')::timestamptz, '[)')
      );
    end loop;
  end loop;

  return appt_id;
end;
$$;

revoke all on function public.book_appointment(jsonb) from public, anon;
grant execute on function public.book_appointment(jsonb) to authenticated, service_role;
