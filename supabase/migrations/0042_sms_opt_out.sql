-- When someone replies STOP: texting turns off for their number everywhere, and
-- we remember when, so START only turns it back on where they had agreed before.
alter table clients add column if not exists sms_stopped_at timestamptz;
alter table customers add column if not exists sms_stopped_at timestamptz;
