-- Clean up test data: remove practice clients and everything booked or paid for them.
-- Runs as the database owner, but only for a salon the signed-in user belongs to
-- (the app also requires the "team.manage" permission). Inventory and gift-card
-- history are kept; those rows just lose their link to the removed client.
create or replace function public.purge_clients(biz uuid, ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cids uuid[];
  aids uuid[];
  n_appts int;
begin
  if auth.uid() is not null and biz not in (select my_business_ids()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select coalesce(array_agg(id), '{}') into cids from clients where business_id = biz and id = any(ids);
  if cardinality(cids) = 0 then
    return jsonb_build_object('clients', 0, 'appointments', 0);
  end if;
  select coalesce(array_agg(id), '{}') into aids from appointments where business_id = biz and client_id = any(cids);
  n_appts := cardinality(aids);

  -- Rows that block deleting appointments or clients.
  delete from payments where business_id = biz and (client_id = any(cids) or appointment_id = any(aids));
  delete from balances where client_id = any(cids) or appointment_id = any(aids);
  delete from client_flags where client_id = any(cids) or appointment_id = any(aids);
  delete from color_formulas where client_id = any(cids) or appointment_id = any(aids);
  delete from messages where business_id = biz and (client_id = any(cids) or appointment_id = any(aids));
  delete from reviews where business_id = biz and (client_id = any(cids) or appointment_id = any(aids));

  delete from appointments where id = any(aids);
  delete from clients where id = any(cids);
  return jsonb_build_object('clients', cardinality(cids), 'appointments', n_appts);
end;
$$;

revoke all on function public.purge_clients(uuid, uuid[]) from public, anon;
grant execute on function public.purge_clients(uuid, uuid[]) to authenticated, service_role;
