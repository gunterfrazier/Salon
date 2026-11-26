-- New payment kinds and a method for gift cards and packages. Kept in their
-- own migration: new enum values can't be used in the transaction that adds them.
alter type payment_kind add value if not exists 'gift_card';
alter type payment_kind add value if not exists 'package';
alter type payment_method add value if not exists 'gift_card';
