-- Accounts: manager role, per-salon role permissions, and client logins.
alter type staff_role add value if not exists 'manager';

-- Overrides on top of the built-in role defaults (app/src/lib/auth/permissions.ts):
-- { "manager": { "reports.view": false }, "stylist": { ... } }. The owner always has everything.
alter table businesses add column if not exists role_permissions jsonb not null default '{}'::jsonb;

-- A client's own login (client portal). Linked on first sign-in by verified email.
alter table clients add column if not exists auth_user_id uuid references auth.users(id) on delete set null;
create index if not exists clients_auth_user on clients(auth_user_id);

alter table staff add column if not exists invited_at timestamptz;
