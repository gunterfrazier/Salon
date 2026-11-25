-- Fields the service menu and settings screens need (seed/service-menu.json,
-- seed/pricing-rules.json, seed/payment-methods.json).

alter table services
  add column stage text not null default 'cut',          -- stacking order: chemical, treatment, cut, style, wax, fee
  add column includes text[] not null default '{}',      -- e.g. {color}; drives "already included" warnings
  add column price_needs_review boolean not null default false,
  add column styleseat_price_cents int;                  -- original StyleSeat price, for reference

alter table businesses
  add column pricing_rules jsonb not null default '{}'::jsonb,
  add column payment_methods jsonb not null default '{}'::jsonb;

-- One staff record per signed-in person per business.
create unique index staff_business_auth_user on staff(business_id, auth_user_id) where auth_user_id is not null;
