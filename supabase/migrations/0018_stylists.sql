-- Multiple stylists: who takes appointments, their hours, services, color,
-- and personal vs salon-wide time off.
alter table staff add column if not exists bookable boolean not null default true;
alter table staff add column if not exists color text;
alter table staff add column if not exists sort int not null default 0;
-- {"mon": ["09:00","17:00"], ...}; null = the salon's hours.
alter table staff add column if not exists hours jsonb;
-- Services this stylist offers; null = all services.
alter table staff add column if not exists service_ids uuid[];
alter table staff add column if not exists title text;
alter table staff add column if not exists bio text;

-- Front desk doesn't take appointments by default.
update staff set bookable = false where role = 'front_desk' and bookable;

-- Existing time off was entered for the whole salon. New entries can be for one person.
alter table time_off add column if not exists salon_wide boolean not null default true;
