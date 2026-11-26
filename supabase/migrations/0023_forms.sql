-- Digital forms: salon-made templates (intake, consultation, consent) and the
-- copies clients fill in and sign. A filled form keeps its own copy of the
-- questions, so editing a template later never changes what someone signed.
create table if not exists form_templates (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  -- starter key ('intake', 'color_consult', 'color_consent') or null for custom
  key text,
  name text not null,
  intro text,
  fields jsonb not null default '[]'::jsonb,
  needs_signature boolean not null default true,
  -- when it's asked for: 'new_client', 'chemical' (color/chemical services), or 'manual'
  ask text not null default 'manual' check (ask in ('new_client', 'chemical', 'manual')),
  -- ask again after this many months (null = once)
  renew_months int check (renew_months is null or renew_months between 1 and 60),
  active boolean not null default false,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists form_templates_key on form_templates(business_id, key) where key is not null;

create table if not exists client_forms (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  template_id uuid references form_templates(id) on delete set null,
  appointment_id uuid references appointments(id) on delete set null,
  -- secret for the fill-in link (/f/<token>)
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  title text not null,
  intro text,
  fields jsonb not null,
  needs_signature boolean not null default true,
  answers jsonb,
  -- { name: typed full name, path: drawn signature as SVG path data }
  signature jsonb,
  status text not null default 'pending' check (status in ('pending', 'completed', 'void')),
  completed_at timestamptz,
  completed_ip text,
  completed_agent text,
  created_at timestamptz not null default now()
);
create index if not exists client_forms_client on client_forms(client_id, created_at desc);
create index if not exists client_forms_appt on client_forms(appointment_id);

do $$
declare t text;
begin
  foreach t in array array['form_templates', 'client_forms'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists business_isolation on %I', t);
    execute format($p$create policy business_isolation on %I for all
      using (business_id in (select my_business_ids()))
      with check (business_id in (select my_business_ids()))$p$, t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
    execute format('grant all on %I to service_role', t);
  end loop;
end $$;
