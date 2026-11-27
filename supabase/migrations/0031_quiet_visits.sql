-- Quiet visits: a client can ask for a calm, low-conversation appointment.
-- clients.quiet / customers.quiet = standing preference; appointments.quiet = just this visit.
alter table clients add column if not exists quiet boolean not null default false;
alter table customers add column if not exists quiet boolean not null default false;
alter table appointments add column if not exists quiet boolean not null default false;
