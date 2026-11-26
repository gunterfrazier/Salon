-- The server's admin client (Supabase secret key = service_role) needs table
-- access too: new Supabase projects grant nothing by default to tables
-- created in SQL. service_role bypasses row-level security; it is only ever
-- used server-side (first-run setup, creating the owner's login).

grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;
