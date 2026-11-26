-- Customer accounts that belong to the customer, not a salon. Each salon keeps
-- its own client record (notes, formulas, flags), linked to the customer.
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  email text not null,
  first_name text,
  last_name text,
  phone text,
  sms_opt_in boolean not null default false,
  home_zip text,
  home_lat double precision,
  home_lng double precision,
  search_miles int not null default 25 check (search_miles between 1 and 200),
  preferred_business_id uuid references businesses(id) on delete set null,
  preferred_staff_id uuid references staff(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists customers_email on customers (lower(email));
alter table customers enable row level security;
revoke all on customers from anon, authenticated;
grant all on customers to service_role;

alter table clients add column if not exists customer_id uuid references customers(id) on delete set null;
create index if not exists clients_customer on clients (customer_id);

-- Existing client logins become customer accounts.
insert into customers (auth_user_id, email, first_name, last_name, phone, sms_opt_in)
select distinct on (c.auth_user_id) c.auth_user_id, coalesce(u.email, c.email), c.first_name, c.last_name, c.phone, c.sms_opt_in
  from clients c join auth.users u on u.id = c.auth_user_id
 where c.auth_user_id is not null
   and not exists (select 1 from customers x where x.auth_user_id = c.auth_user_id)
 order by c.auth_user_id, c.created_at desc
on conflict do nothing;
update clients c set customer_id = x.id from customers x where c.auth_user_id = x.auth_user_id and c.customer_id is null;
