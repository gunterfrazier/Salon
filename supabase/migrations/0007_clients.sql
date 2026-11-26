-- Client records: settling balances, and private storage for color-formula
-- photos.

-- Mark an unpaid balance as paid: records the payment and links it.
-- p = { balance_id, method, reference }
create or replace function public.settle_balance(p jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  bal balances%rowtype;
  pay_id uuid;
begin
  select * into bal from balances where id = (p->>'balance_id')::uuid and settled_payment_id is null for update;
  if not found then
    raise exception 'This balance is already paid.' using errcode = 'P0002';
  end if;

  insert into payments (business_id, client_id, appointment_id, kind, method, amount_cents, status, external_reference, note)
  values (bal.business_id, bal.client_id, bal.appointment_id, 'balance', (p->>'method')::payment_method,
          bal.amount_cents, 'succeeded', nullif(p->>'reference', ''), bal.reason)
  returning id into pay_id;

  update balances set settled_payment_id = pay_id where id = bal.id;
  return pay_id;
end;
$$;

revoke all on function public.settle_balance(jsonb) from public, anon;
grant execute on function public.settle_balance(jsonb) to authenticated, service_role;

create index if not exists clients_business_name on clients (business_id, lower(first_name), lower(last_name));
create index if not exists appointments_client on appointments (client_id, start_at);

-- Private bucket for client photos. Files live under <business_id>/<client_id>/…
-- and only staff of that business can read or write them. Supabase only; the
-- local test database has no storage schema, so this is skipped there.
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('client-photos', 'client-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do update set public = false;

    drop policy if exists "client photos: staff read" on storage.objects;
    drop policy if exists "client photos: staff write" on storage.objects;
    drop policy if exists "client photos: staff delete" on storage.objects;

    create policy "client photos: staff read" on storage.objects for select to authenticated
      using (bucket_id = 'client-photos' and (storage.foldername(name))[1] in (select my_business_ids()::text));
    create policy "client photos: staff write" on storage.objects for insert to authenticated
      with check (bucket_id = 'client-photos' and (storage.foldername(name))[1] in (select my_business_ids()::text));
    create policy "client photos: staff delete" on storage.objects for delete to authenticated
      using (bucket_id = 'client-photos' and (storage.foldername(name))[1] in (select my_business_ids()::text));
  end if;
end $$;
