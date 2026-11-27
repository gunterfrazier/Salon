-- Stylists' own price and working time for a service, when the salon allows it.
-- staff.service_prices: { "<service id>": { "price": cents, "active": minutes } }; either part optional.
-- Kept even while the salon has the option off (it just isn't used), so turning it back on restores them.
alter table staff add column if not exists service_prices jsonb not null default '{}'::jsonb;
alter table businesses add column if not exists stylist_pricing boolean not null default false;
