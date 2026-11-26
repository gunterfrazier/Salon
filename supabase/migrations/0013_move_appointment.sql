-- Move an open appointment to a new start time, keeping its services, prices
-- and processing gaps. Busy blocks are re-inserted shifted, so the
-- no-double-booking constraint checks the new time against everyone else.
create or replace function public.move_appointment(p jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  appt appointments%rowtype;
  delta interval;
  old_blocks staff_busy_blocks[];
begin
  select * into appt from appointments
   where id = (p->>'appointment_id')::uuid and status in ('pending', 'booked', 'confirmed')
   for update;
  if not found then
    raise exception 'Only upcoming appointments can be moved.' using errcode = 'P0002';
  end if;

  delta := (p->>'new_start')::timestamptz - appt.start_at;
  if delta = interval '0' then
    return;
  end if;

  -- Keep the old blocks, delete them all, then insert them shifted (in that
  -- order, so an appointment never conflicts with its own old time).
  select array_agg(b) into old_blocks
    from staff_busy_blocks b
   where b.appointment_service_id in (select id from appointment_services where appointment_id = appt.id);
  delete from staff_busy_blocks where id in (select (x).id from unnest(old_blocks) x);
  insert into staff_busy_blocks (id, business_id, staff_id, appointment_service_id, phase, during)
    select (x).id, (x).business_id, (x).staff_id, (x).appointment_service_id, (x).phase,
           tstzrange(lower((x).during) + delta, upper((x).during) + delta, '[)')
      from unnest(old_blocks) x;

  update appointments set start_at = start_at + delta, end_at = end_at + delta where id = appt.id;
end;
$$;

revoke all on function public.move_appointment(jsonb) from public, anon;
grant execute on function public.move_appointment(jsonb) to authenticated, service_role;
