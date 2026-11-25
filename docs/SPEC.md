# SalonOS (working title) — Phase 0 / Phase 1 Specification

_Status: draft v0.1 · 2026-11-25_

## 1. Goals

Replace StyleSeat for a **solo stylist** working from an **Android phone and Android tablet**, with no front desk. Built single-salon first, but structured so it could be sold to other salons later (solo and multi-chair).

**Non-goals for Phase 1:** marketplace, billing other salons, multi-location, payroll, retail inventory.

## 2. Users & devices

| User | Device | Uses it for |
|---|---|---|
| Stylist / owner | Android tablet (main), Android phone | Calendar, check-in, checkout, client cards, color formulas, settings |
| Client | Their own phone/browser | Booking page, deposits, confirmations, reschedule/cancel links |

**Later:** extra staff accounts with roles such as stylist, booth renter or front desk. The data model supports them from day one, but the screens to manage them come later.

## 3. Platform & stack

- **Next.js + TypeScript**, delivered as an installable **PWA** on the Android tablet and phone. The client booking page lives in the same codebase.
- **Supabase**: Postgres, logins, photo storage. Every table has a `business_id`, and row-level security keeps each business's data separate.
- **Stripe** for payments:
  - Phase 1: **card on file**. Clients save a card when they book, with consent to the policy. Deposits are charged at booking. Checkout charges the saved card, or records cash, Venmo/Zelle, etc. as a manual payment. **No card reader is needed for Phase 1.**
  - Phase 2: **Tap to Pay on Android** inside a thin native Android app. Stripe supports this through its native and React Native Terminal SDKs, not from a web app. This lets the phone accept tapped cards and phones in person.
- **Twilio** for texts (requires US 10DLC registration; start this in Phase 0, it takes weeks). **Resend** for email.
- **Vercel** hosting, with a preview link for every change.

## 4. Booking & cancellation policy engine (core requirement)

All values below are defaults stored in settings (`seed/policies.json`) and editable by the stylist.

### 4.1 Card on file
- Every online booking requires a saved card, and the client must check a box accepting the policy.
- The app stores the exact policy text the client saw, a timestamp and their IP address, so there's evidence if a charge is ever disputed.
- Bookings the stylist creates (from a call or text) send the client a link to add a card. The appointment shows **"Card needed"** until they do.

### 4.2 Who must pay a deposit
A deposit is required when **either** is true:
1. **New client**: no completed appointment on record. By default this applies to **color services** only (the `color` deposit category). It can be switched on for other services too.
2. **Flagged client**: has an active late-cancel or no-show flag (see 4.4). Applies to **any** service.

### 4.3 Deposit amount
- Default **$50**. This is also the **minimum**.
- The stylist can raise it to any amount up to the **full estimated price** of the booked services, either per booking or as a standing per-client setting ("this client always pays in full").
- The deposit is charged at booking and **applied to the final bill** at checkout.
- Client cancels **outside** the 24h window: deposit refunded automatically (setting).

### 4.4 Client flags
- Created automatically when an appointment is recorded as a **late cancellation** (cancelled less than 24h before start) or a **no-show**.
- Shown as a badge on the client card, the calendar block, and in the booking flow, e.g. ⚠ Late cancel – Oct 12 or ⛔ No-show – Nov 3.
- **Active for 180 days** by default (setting). The stylist can **clear or waive** a flag manually and must enter a note.
- While a flag is active, any new booking (online or stylist-created) requires a deposit. The client sees: "A deposit is required to book."
- History is kept after a flag expires. The client card shows lifetime counts, e.g. 2 late cancels, 1 no-show.

### 4.5 Fees for late cancellation & no-show
- **Default charge = full estimated price** of the booked services, minus any deposit already collected.
- **Client cancels online inside 24h:**
  - The client is warned before confirming: "Cancelling now will charge $X per policy."
  - The fee is charged automatically, a flag is created, and the stylist gets a notification.
  - Any charge can be refunded or reduced later from the appointment screen.
- **Stylist marks No-show:** the charge sheet opens with **Full** preselected (see 4.6). The stylist confirms or adjusts, and a flag is created.

### 4.6 Stylist-initiated cancel → charge prompt
Whenever the stylist cancels from the app, a **Cancel appointment** sheet opens:

1. **Reason** (required):
   - Client asked to cancel
   - Client unreachable / didn't confirm
   - I can't make it
   - Other
2. **Charge client?**
   - **No charge**
   - **Full price** ($X)
   - **Percentage** (25 / 50 / 75 / 100% presets, or any %), showing the dollar amount live
   - **Custom amount** (any amount from $0 up to full price; higher amounts are rejected)
3. The sheet shows the deposit on file and how it will be applied ("$50 deposit will be kept toward this charge") or refunded.
4. **Defaults:**
   - Client-caused reason inside 24h → **Full** preselected
   - Client-caused reason outside 24h → **No charge**
   - "I can't make it" → **No charge**, and the deposit is refunded
5. **Flag:** created only when a client-caused reason falls inside 24h. A toggle lets the stylist skip it, e.g. for a family emergency.
6. **Confirm:** the charge goes to the card on file and the client gets a receipt with the policy reason.

**Edge cases:**
- **Card declined:** the balance is recorded on the client card as **Outstanding balance**, and the client must pay it before their next booking.
- **Reschedule:** a reschedule inside 24h counts as a late cancel. This is a setting, **off** by default.

## 5. Service menu

- Starter menu in `seed/service-menu.json`, built from typical US salon menus. It covers consultations, cuts and styling, color, highlights and lightening, texture, treatments, extensions and add-ons.
- **Each service has:**
  - name and description
  - price type: fixed, starting at, hourly, or free
  - price
  - **active / processing / finish minutes**
  - deposit category
  - optional length surcharge
  - whether a consultation is required first
  - whether clients can book it online
  - add-on rules
- **Fully editable:**
  - add, remove, reorder and rename categories and services
  - hide a service from online booking
  - optional per-client price overrides

### Processing-time scheduling
The calendar marks the **processing** phase as open time, so the stylist can book a short service (cut, gloss, blowout) inside another client's processing gap. The booking page offers those slots only when the service fits entirely inside the gap. This can be turned off per service.

## 6. Phase 1 screens

**Stylist app (tablet-first, phone layout too):**
1. **Today / Calendar**: day, 3-day and week views. Drag to move. Processing gaps shaded. Flag and "card needed" badges.
2. **Appointment sheet**: services, times, deposit status, notes. Actions: check-in, start, checkout, reschedule, cancel (4.6), no-show (4.5).
3. **New booking** (stylist-created): pick client, services and time. The policy engine decides the deposit and sends the client a card/deposit link.
4. **Client card**: contact details, flags and history, outstanding balance, visits, **color formula log** (date, formula, developer, processing time, photos, notes), preferences.
5. **Checkout**: line items, price adjustments for "starting at" services, length surcharge, deposit applied, tip (presets + custom), payment (saved card, cash, other), receipt by text or email.
6. **Clients list**: search, filters (flagged, owes balance, not seen in 8+ weeks).
7. **Reports (basic)**: daily and weekly revenue, tips, deposits, cancellation fees, no-show rate.
8. **Settings**: business info, hours and time off, services, policies, booking page, message templates.

**Client booking page (web):**
1. Service picker (with add-ons and length option)
2. Time picker
3. Client details (returning clients are recognized by phone code)
4. Card + deposit + policy consent
5. Confirmation, with a manage link (reschedule or cancel, showing the fee warning inside 24h)

**Automated messages:**
- Booking confirmation
- Reminder 48h before, with a confirm button
- Reminder 2h before
- Deposit/card-needed link
- Cancellation receipt
- Fee receipt
- Rebook nudge (e.g. 6 weeks after a color visit)

## 7. Data model (Phase 1)

```
businesses(id, name, timezone, settings_json)
users(id, business_id, role[owner|stylist|renter|front_desk], name, phone, email)
service_categories(id, business_id, name, sort)
services(id, business_id, category_id, name, description, price_type, price, est_hours,
         active_min, processing_min, finish_min, deposit_category, uses_length_modifier,
         requires_consult_service_id, bookable_online, is_add_on, attaches_to[], sort, archived)
clients(id, business_id, first, last, phone, email, notes, stripe_customer_id,
        deposit_override[none|amount|full], deposit_override_amount, source[styleseat_import|online|manual])
client_flags(id, business_id, client_id, type[late_cancel|no_show], appointment_id,
             created_at, expires_at, cleared_at, cleared_by, clear_note)
appointments(id, business_id, client_id, staff_id, start_at, end_at,
             status[booked|confirmed|checked_in|in_service|completed|cancelled|no_show],
             cancelled_by[client|stylist], cancel_reason, cancelled_at, booked_via[online|stylist],
             policy_consent_id, notes)
appointment_services(id, appointment_id, service_id, price_quoted, length_modifier,
                     active_start, processing_start, finish_start, finish_end)
policy_consents(id, business_id, client_id, policy_text, policy_version, accepted_at, ip, user_agent)
payments(id, business_id, appointment_id, client_id,
         kind[deposit|service|tip|cancel_fee|no_show_fee|balance|refund],
         method[card_on_file|tap_to_pay|cash|other], amount, stripe_payment_intent_id, status, created_at)
balances(id, business_id, client_id, amount, reason, appointment_id, settled_payment_id)
color_formulas(id, business_id, client_id, appointment_id, formula_text, developer, processing_min, notes, photo_urls[])
time_off(id, business_id, staff_id, start_at, end_at, reason)
messages(id, business_id, client_id, channel[sms|email], template, body, status, sent_at)
```

Double-booking prevention: a Postgres exclusion constraint on each staff member's *busy* time ranges (the active and finish phases).

## 8. StyleSeat migration

- **Clients:** in StyleSeat, open Clients → menu → *Export Client List*. StyleSeat emails a CSV with names, email, phone and notes. We map it into `clients`, tag each row with `source=styleseat_import`, and keep the notes.
- **Appointment history and future bookings:** StyleSeat has no self-service export. Ask StyleSeat support for a CSV. If none arrives, future appointments are re-entered by hand during the side-by-side period. Imported clients with past visits get marked as **not new**, so they aren't asked for a new-client deposit.
- **Payments history and photos:** these don't transfer. Keep the StyleSeat account until the end of its billing period for reference.

## 9. Phase 0 checklist

**You:**
- [ ] Create a GitHub account and an empty private repo
- [ ] Create accounts: Supabase, Vercel, Stripe (complete business verification), Twilio
- [ ] Export the StyleSeat client CSV; ask StyleSeat support for an appointments export
- [ ] Review/edit `seed/service-menu.json` prices and times (or just send me your StyleSeat menu)
- [ ] Write or approve the policy wording clients will see

**Claude:**
- [ ] Set up the project and the database tables (migrations)
- [ ] Load the starter service menu and policy settings
- [ ] Build a clickable calendar and booking mockup
- [ ] Draft the client-facing policy text and message templates
- [ ] Start the Twilio 10DLC registration steps (with you)

## 10. Open questions
1. New clients booking **non-color** services: deposit off by default. Is that right?
2. Flagged clients: is the deposit the same $50 minimum (up to full), regardless of service?
3. How long should a flag stay active: 180 days, or until N on-time visits?
4. Should a client's online late-cancel charge happen **automatically**, or wait for your one-tap approval?
5. Are you a sole proprietor or an LLC? This affects the Stripe and Twilio registration paths.
6. Your actual StyleSeat menu: send a screenshot or the list so the seed matches your services.
