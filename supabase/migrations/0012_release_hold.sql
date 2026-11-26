-- Release an online booking whose deposit never arrived. Only touches a booking
-- that is STILL pending with no deposit recorded, so a deposit marked received
-- at the same moment always wins. Returns true if the time was released.
create or replace function public.release_pending_hold(appointment uuid)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  released uuid;
begin
  update appointments a
     set status = 'cancelled',
         cancelled_by = 'client',
         cancel_reason = 'Deposit not received; hold released',
         cancelled_at = now()
   where a.id = appointment
     and a.status = 'pending'
     and not exists (
       select 1 from payments p
        where p.appointment_id = a.id and p.kind = 'deposit' and p.status = 'succeeded'
     )
  returning a.id into released;

  if released is null then
    return false;
  end if;

  delete from staff_busy_blocks
   where appointment_service_id in (select id from appointment_services where appointment_id = released);
  return true;
end;
$$;

revoke all on function public.release_pending_hold(uuid) from public, anon;
grant execute on function public.release_pending_hold(uuid) to authenticated, service_role;

-- A plain (non-partial) unique index so inserts can use ON CONFLICT DO NOTHING.
-- Rows without a dedupe_key are never duplicates (NULLs are distinct).
drop index if exists messages_dedupe;
create unique index if not exists messages_dedupe_key on messages(business_id, dedupe_key, channel);
