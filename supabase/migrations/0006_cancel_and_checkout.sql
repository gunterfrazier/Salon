-- Close out an appointment: cancel / no-show, or check out. Each runs in one
-- transaction as the signed-in user (row-level security applies). Amounts are
-- computed by the app server (app/src/lib/checkout/settle.ts); these
-- functions only record them.

-- Appointment statuses that can still be cancelled, marked no-show or checked out.
create or replace function public.appointment_is_open(s appointment_status)
returns boolean language sql immutable as $$
  select s in ('pending', 'booked', 'confirmed', 'checked_in', 'in_service')
$$;

-- p = {
--   appointment_id, status ('cancelled' | 'no_show'), cancelled_by ('client' | 'stylist'),
--   reason, fee_cents, flag_type (null | 'late_cancel' | 'no_show'),
--   collect: null | { method, amount_cents, reference },
--   balance_cents, refund_cents
-- }
create or replace function public.cancel_appointment(p jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  appt appointments%rowtype;
  fee_kind payment_kind;
  new_status appointment_status := (p->>'status')::appointment_status;
begin
  if new_status not in ('cancelled', 'no_show') then
    raise exception 'Status must be cancelled or no_show' using errcode = '22023';
  end if;

  update appointments
     set status = new_status,
         cancelled_by = coalesce(p->>'cancelled_by', 'stylist'),
         cancel_reason = nullif(p->>'reason', ''),
         cancelled_at = now()
   where id = (p->>'appointment_id')::uuid
     and appointment_is_open(status)
  returning * into appt;
  if not found then
    raise exception 'This appointment is already closed.' using errcode = 'P0002';
  end if;

  -- Free the stylist's time.
  delete from staff_busy_blocks
   where appointment_service_id in (select id from appointment_services where appointment_id = appt.id);

  fee_kind := case when new_status = 'no_show' then 'no_show_fee' else 'cancel_fee' end;

  if coalesce((p->'collect'->>'amount_cents')::int, 0) > 0 then
    insert into payments (business_id, client_id, appointment_id, kind, method, amount_cents, status, external_reference)
    values (appt.business_id, appt.client_id, appt.id, fee_kind, (p->'collect'->>'method')::payment_method,
            (p->'collect'->>'amount_cents')::int, 'succeeded', nullif(p->'collect'->>'reference', ''));
  end if;

  if coalesce((p->>'balance_cents')::int, 0) > 0 then
    insert into balances (business_id, client_id, appointment_id, amount_cents, reason)
    values (appt.business_id, appt.client_id, appt.id, (p->>'balance_cents')::int,
            case when new_status = 'no_show' then 'No-show fee' else 'Late cancellation fee' end);
  end if;

  if coalesce((p->>'refund_cents')::int, 0) > 0 then
    -- A refund still to be sent back by the stylist (pending until marked done).
    insert into payments (business_id, client_id, appointment_id, kind, method, amount_cents, status, note)
    values (appt.business_id, appt.client_id, appt.id, 'refund', 'other', -(p->>'refund_cents')::int, 'pending', 'Return deposit to client');
  end if;

  if p->>'flag_type' in ('late_cancel', 'no_show') then
    insert into client_flags (business_id, client_id, type, appointment_id, fee_charged_cents)
    values (appt.business_id, appt.client_id, (p->>'flag_type')::flag_type, appt.id, nullif((p->>'fee_cents')::int, 0));
  end if;
end;
$$;

-- p = {
--   appointment_id,
--   lines: [{ id (appointment_services.id), price_cents }],
--   tip_cents,
--   payment: null | { method, amount_cents, tip_cents, reference },
--   balance_cents, refund_cents
-- }
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

  if paid - tip_paid > 0 then
    insert into payments (business_id, client_id, appointment_id, kind, method, amount_cents, status, external_reference)
    values (appt.business_id, appt.client_id, appt.id, 'service', (p->'payment'->>'method')::payment_method,
            paid - tip_paid, 'succeeded', nullif(p->'payment'->>'reference', ''));
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

revoke all on function public.cancel_appointment(jsonb) from public, anon;
revoke all on function public.checkout_appointment(jsonb) from public, anon;
grant execute on function public.cancel_appointment(jsonb) to authenticated, service_role;
grant execute on function public.checkout_appointment(jsonb) to authenticated, service_role;
grant execute on function public.appointment_is_open(appointment_status) to authenticated, service_role;
