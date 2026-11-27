-- move_appointment: same as before, plus p.allow_overlap (stylist confirmed a
-- double-booking) and p.outside_hours (confirmed outside working hours).
-- Without allow_overlap, moved blocks are checked against everyone again.
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
  ok_overlap boolean := coalesce((p->>'allow_overlap')::boolean, false);
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

  select array_agg(b) into old_blocks
    from staff_busy_blocks b
   where b.appointment_service_id in (select id from appointment_services where appointment_id = appt.id);
  delete from staff_busy_blocks where id in (select (x).id from unnest(old_blocks) x);
  insert into staff_busy_blocks (id, business_id, staff_id, appointment_service_id, phase, during, overlap_ok)
    select (x).id, (x).business_id, (x).staff_id, (x).appointment_service_id, (x).phase,
           tstzrange(lower((x).during) + delta, upper((x).during) + delta, '[)'), ok_overlap
      from unnest(old_blocks) x;

  update appointments
     set start_at = start_at + delta, end_at = end_at + delta,
         outside_hours = coalesce((p->>'outside_hours')::boolean, false)
   where id = appt.id;
end;
$$;

revoke all on function public.move_appointment(jsonb) from public, anon;
grant execute on function public.move_appointment(jsonb) to authenticated, service_role;
