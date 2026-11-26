-- Online booking: bookings can start as 'pending' (waiting for a deposit
-- sent by Venmo/Zelle/etc.) and carry the client's policy agreement.
-- Pending bookings still hold their time so nobody else can take it.

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
begin
  if st not in ('booked', 'pending') then
    raise exception 'New bookings must be booked or pending' using errcode = '22023';
  end if;
  if jsonb_array_length(coalesce(p->'services', '[]'::jsonb)) = 0 then
    raise exception 'Pick at least one service.' using errcode = '22023';
  end if;

  insert into appointments (business_id, client_id, staff_id, start_at, end_at, status, booked_via, deposit_required_cents, notes, policy_consent_id)
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
    nullif(p->>'policy_consent_id', '')::uuid
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

-- Stylist confirms a deposit arrived: records it and confirms a pending booking.
-- p = { appointment_id, amount_cents, method, reference }
create or replace function public.mark_deposit_received(p jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  appt appointments%rowtype;
begin
  select * into appt from appointments where id = (p->>'appointment_id')::uuid for update;
  if not found or not appointment_is_open(appt.status) then
    raise exception 'This appointment is closed.' using errcode = 'P0002';
  end if;
  if coalesce((p->>'amount_cents')::int, 0) <= 0 then
    raise exception 'Enter the deposit amount.' using errcode = '22023';
  end if;

  insert into payments (business_id, client_id, appointment_id, kind, method, amount_cents, status, external_reference)
  values (appt.business_id, appt.client_id, appt.id, 'deposit', (p->>'method')::payment_method,
          (p->>'amount_cents')::int, 'succeeded', nullif(p->>'reference', ''));

  if appt.status = 'pending' then
    update appointments set status = 'booked' where id = appt.id;
  end if;
end;
$$;

revoke all on function public.mark_deposit_received(jsonb) from public, anon;
grant execute on function public.mark_deposit_received(jsonb) to authenticated, service_role;

-- Online booking settings (editable later): notice, how far ahead, slot step.
update businesses
   set booking_settings = '{"minNoticeHours": 12, "maxDaysAhead": 60, "stepMinutes": 15}'::jsonb || booking_settings
 where not (booking_settings ? 'minNoticeHours');
