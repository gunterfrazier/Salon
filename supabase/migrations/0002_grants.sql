-- Let signed-in users reach the tables. Row-level security (0001) still
-- limits every row to the user's own business. The public (anon) role gets
-- nothing: the booking page goes through server routes instead.

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function my_business_ids() to authenticated;

-- Tables added by later migrations get the same access.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant usage, select on sequences to authenticated;

-- Make sure nothing is open to the public role.
revoke all on all tables in schema public from anon;
revoke execute on function my_business_ids() from anon, public;
