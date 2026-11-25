# Chairvana — Phase 0 / Phase 1 Specification

_Status: draft v0.5 · 2026-11-25_

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
- **Payments:** see §5.5. Stripe handles cards, **Google Pay, Apple Pay and Cash App Pay**, all of which can be saved for later charges. PayPal and Venmo come in Phase 2. Zelle, Apple Cash, and Venmo / Cash App sent to your own handle are recorded manually. **No card reader or in-person card processing is needed.**
- **Twilio** for texts (requires US 10DLC registration; start this in Phase 0, it takes weeks). **Resend** for email.
- **Cloudflare Workers** hosting (Workers Paid, $5/mo; business use allowed), built with the OpenNext adapter (`npm run build:cf`). Domain **chairvana.app** registered at Cloudflare. The app also still builds on Vercel, but Vercel's free plan is non-commercial only. Sign-in gate uses Edge `middleware.ts` because OpenNext's Node `proxy.ts` support is experimental and failed to build.

## 4. Booking & cancellation policy engine (core requirement)

All values below are defaults stored in settings (`app/seed/policies.json`) and editable by the stylist.

### 4.1 Saved payment method (optional)
- Clients choose how to pay when booking (§5.5).
- **Saved method** (card, Google Pay, Apple Pay, Cash App Pay): any deposit is charged at booking, and late-cancel / no-show fees can be charged automatically.
- **Send-to-me apps or cash** (Zelle, Venmo, Cash App, PayPal.Me, Apple Cash, cash):
  - If a deposit is required, the booking stays **Pending** until you mark the deposit received.
  - If no deposit is required, the booking is confirmed. Any later fee becomes a **balance owed**, and the client is sent a payment request.
- The setting `savedPaymentMethod` can be switched to `required` to make every booking save a card or wallet.
- Either way, the client checks a box accepting the policy. The app stores the exact text, a timestamp and their IP address.

### 4.2 Who must pay a deposit
A deposit is required when **any** of these is true:
1. **New client** (no visits here or imported from StyleSeat). Can be switched on per category. By default it's on for **all services**.
2. **Flagged client** (active or permanent flag, see 4.4): **full estimated price** of every booked service, paid up front.
3. **Standing override** on the client ("always pays in full" or a set amount).

### 4.3 Deposit amount
- **New clients:** default **$50**. For color, $50 is also the minimum. The stylist can raise it up to the full estimated price.
- **Always capped at the total of the booked services.** A $30 haircut never asks for more than $30.
- **Flagged clients:** the full estimated total of all booked services.
- The deposit is charged at booking and **applied to the final bill** at checkout.
- If the client cancels **outside** the 24h window, the deposit is refunded automatically. This is a setting.

### 4.4 Client flags & violation history
- A flag is created automatically for a **late cancellation** (less than 24h notice) or a **no-show**.
- **Active flag:** the client pays in full for any booking.
  - It clears after **4 on-time visits** that come after the violation. The number is customizable (Settings → Policies).
  - An optional time limit can also clear it. This is off by default.
- **Permanent flag:** the stylist can mark any flag permanent. It never clears, and the client always pays in full.
- **Manual clear:** the stylist can clear a flag by hand, with a note.
- **History is permanent.** Every violation stays on the client's record forever, even after it clears.
- **Client standing** is the worst status that applies: permanent → active → past violation → clear.
- **Booking alert:** whenever a client with **any** violation history books (online or by the stylist), the stylist gets an alert. It shows:
  - the standing, the most recent violation and its date, and the counts (e.g. "2 no-shows, 1 late cancellation")
  - for an active flag, how many on-time visits are left until it clears
  - a **View history** link listing each violation: date, type, the services booked that day, fee charged, and status
- **Calendar:** each appointment block shows the client's standing chip, and tapping it opens the same history.
- **Color chart:** see §4.7 and the `/legend` page in the app.

### 4.5 Fees for late cancellation & no-show
- **Default charge = full estimated price** of the booked services, minus any deposit already collected.
- **Client cancels online inside 24h:**
  - The client is warned before confirming: "Cancelling now will charge $X per policy."
  - The fee is **charged automatically by default**. A setting switches this to **wait for the stylist's one-tap approval**.
  - A flag is created and the stylist gets a notification.
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

### 4.7 Color chart
Every status pairs a color with an icon and a label, so it never depends on color alone. Light and dark versions are defined in `app/src/lib/ui/status-colors.ts`.

| Family | Status | Icon | Color | Meaning |
|---|---|---|---|---|
| Violation | Permanent flag | ⛔ | Dark red | Never clears; full payment always |
| Violation | No-show (active) | ✖ | Red | Full payment until cleared |
| Violation | Late cancel (active) | ⏱ | Orange | Full payment until cleared |
| Warning | Past violation | ⚠ | Yellow | Cleared; heads-up only |
| Money | Balance owed | $ | Purple | Must be paid before next booking |
| Action | Card / deposit needed | 💳 | Blue | Client hasn't added card / paid deposit |
| Info | Deposit paid | ✓ | Green | Applied to final bill |
| Info | New client | ★ | Teal | First visit |

Calendar phases: hands-on time (solid), **processing (striped, open for another client)**, finish (solid).

## 5. Service menu

- `app/seed/service-menu.json` is **your StyleSeat menu**: 18 services with your hours (America/Chicago time).
  - **Changes from StyleSeat:**
    - Removed the $25 "Women's or Youth Female's Cut".
    - Split color services from cut & style. Each color service is now color only, ending with a 15-minute rinse.
    - Color prices are **unchanged for now** and marked for review (see §5.4).
  - The hands-on / processing / finish split for color services is an estimate you've approved. It can be adjusted any time.
- `app/seed/service-menu-generic.json` is a 36-service general template for adding new services.
- **Fully editable:** add, remove, reorder and rename categories and services; hide a service from online booking.

### Stacking services
A client can book several services in one appointment, e.g. haircut + color + style.
- **Billing:** each service is a separate line on the bill.
- **Time:** the appointment length is the sum of every service's time, back to back. Each service keeps its own hands-on, processing and finish phases.
- **Order:** suggested as chemical → treatment → cut → style → wax → fees. The stylist can reorder.
- **Deposits:** calculated on the combined total.
- **Overlap warning:** your chemical services already include a cut and style. If a separate cut or style is stacked on top, the app warns that it's already included.
- **Add-ons:** the Travel Fee can't be booked alone.

### 5.4 Discounts & custom pricing for stacked services
`app/seed/pricing-rules.json`. Applied per line, in this order:
1. **Custom price:** the stylist can type a price for any service on any appointment.
2. **Package discounts:** apply automatically when the trigger matches. Each package can be turned off for a single appointment.
   - **Color + Cut/Style 5% off** (on): **5% off the whole appointment** when a color service is booked with a cut and/or a style. The percent can be changed, switched to a dollar amount, or turned off.
   - **3+ services** (off, example): 10% off everything.
   - Packages can take a percent, a dollar amount, or a set price.
3. **Manual discounts** with a reason (Loyal client, Friends & family, Promotion, Service adjustment, Other):
   - **Per service:** % off, dollars off, or a set price.
   - **Whole appointment:** % or dollars off, split across the services in proportion to their prices.
- No line goes below $0.
- Every discount is saved on the appointment for reports.
- Deposits and fees use the discounted total.

### 5.5 Payment methods
`app/seed/payment-methods.json`. **Every method is available. All start off except cash.** The stylist links and switches each one on or off from **Settings → Payments** in the app, any time after launch, to find what works best for her clients. Reports will show payments by method to help compare.

| Linking | What it takes |
|---|---|
| Connect | Sign in to the account: **Stripe** (one account covers card, Google Pay, Apple Pay and Cash App Pay), PayPal |
| Handle | Type a Venmo username, $Cashtag, PayPal.Me name, or Zelle / Apple Cash phone or email. The app checks the format and shows a test link. |
| None | Cash |


| Method | How | Can charge later (no-show fees) | Phase |
|---|---|---|---|
| Card, **Google Pay**, **Apple Pay**, **Cash App Pay** | Stripe checkout | Yes | 1 |
| **PayPal**, **Venmo** (checkout) | PayPal | Likely, via PayPal's saved-payment feature; to be confirmed during setup | 2 |
| **Venmo** / **Cash App** / **PayPal.Me** to your handle | Link with the amount prefilled; you mark it received | No | 1 |
| **Zelle** | Shows your Zelle phone or email; you mark it received | No | 1 |
| **Apple Cash** | Shows your number (sent from iPhone Messages/Wallet); you mark it received | No | 1 |
| Cash | You record it | No | 1 |
| ~~Meta Pay~~ | Not offered. Meta has been winding down Meta Pay checkout for merchants (Shopify removed it). | — | — |

**Notes:**
- Use a **Venmo business profile** and **Cash App for Business**. Personal accounts aren't meant for business payments.
- Some banks limit business use of Zelle on personal accounts.
- Google Pay and Apple Pay go through Stripe. Google charges no extra fee; Stripe's normal fee applies.
- The Google Wallet business page you shared is for **Wallet passes** (loyalty punch cards, gift cards, offers, appointment passes), not payments. Those fit Phase 3 (loyalty and gift cards).

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
             created_at, fee_charged, permanent, cleared_at, cleared_by, clear_note)  -- never deleted
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

> **Policy difference:** the policy currently shown on StyleSeat charges **50%** for late cancellations and 100% for no-shows. This app defaults to **100% for both**, per your instructions. Before switching, update the policy text clients agree to (and StyleSeat's, if it's still in use).


- **Clients:** in StyleSeat, open Clients → menu → *Export Client List*. StyleSeat emails a CSV with names, email, phone and notes. We map it into `clients`, tag each row with `source=styleseat_import`, and keep the notes.
- **Appointment history and future bookings:** StyleSeat has no self-service export. Ask StyleSeat support for a CSV. If none arrives, future appointments are re-entered by hand during the side-by-side period. Imported clients with past visits get marked as **not new**, so they aren't asked for a new-client deposit.
- **Payments history and photos:** these don't transfer. Keep the StyleSeat account until the end of its billing period for reference.

## 9. Phase 0 checklist

**You:**
- [ ] Create a GitHub account and an empty private repo
- [ ] Create accounts: Supabase, Vercel, Stripe (complete business verification), Twilio
- [ ] Export the StyleSeat client CSV; ask StyleSeat support for an appointments export
- [ ] Review/edit `app/seed/service-menu.json` prices and times (or just send me your StyleSeat menu)
- [ ] Write or approve the policy wording clients will see

**Claude:**
- [ ] Set up the project and the database tables (migrations)
- [ ] Load the starter service menu and policy settings
- [ ] Build a clickable calendar and booking mockup
- [ ] Draft the client-facing policy text and message templates
- [ ] Start the Twilio 10DLC registration steps (with you)

## 10. Decisions log
- Deposits can apply to any service, capped at the booked total. *(v0.2)*
- Flagged clients pay the full estimated price. *(v0.2)*
- Flags clear after 4 on-time visits (customizable). Permanent flags are available. History is kept forever, and any history triggers a booking alert. *(v0.2)*
- Late-cancel charges are automatic by default; approval mode is a setting. *(v0.2)*
- Business type: **sole proprietor**. *(v0.2)*
  - **Stripe:** register as an individual / sole proprietorship, using an SSN (or an EIN if you have one).
  - **Twilio texting:** register as a "Sole Proprietor" brand. That allows one phone number and lower sending limits, which is plenty for a solo stylist. Registration includes a one-time code sent to your mobile phone.
- Color services split from cut & style. Cut & style are free with color by default, so prices match StyleSeat until changed. *(v0.3)*
- Removed the $25 women's/youth cut. Processing-time estimates approved. *(v0.3)*
- Payments: Stripe for card, Google Pay, Apple Pay and Cash App Pay; manual Zelle, Venmo, Cash App, PayPal.Me, Apple Cash and cash; PayPal/Venmo checkout in Phase 2. Meta Pay dropped. A saved method is optional. *(v0.3)*

- Package discount: 5% off the whole appointment for color + cut and/or style. *(v0.4)*
- Payment methods: all available, off by default except cash, linked and switched on in the app after launch. *(v0.4)*

- App name: **Chairvana** (tagline "Calm days behind the chair"). chairvana.app was unregistered on 2026-11-25; chairvana.com is taken. *(v0.5)*

## 11. Open questions
1. **Color-only prices.** They still equal the old StyleSeat prices, which included a cut and style. Booking color + cut + style now costs more than on StyleSeat until those are lowered.

## 12. Reuse from Our Faithful Church App (`gunterfrazier/Apps`)
Reviewed 2026-11-25. The church app's screens are about 30,000 lines of plain JavaScript stitched into one page, and its data lives mostly in a single catch-all table. Neither fits this app's Next.js + TypeScript setup or its proper tables. Its **server code (Supabase Edge Functions, TypeScript)** is clean and directly useful. Plan: **copy and adapt specific server modules** when each feature is built. Use the rest as reference. No shared package.

| Church app module | Use in salon app | When |
|---|---|---|
| `supabase/functions/_shared/messaging.ts`, `texting`, `sms` (Twilio, STOP opt-out, phone formatting) | Copy & adapt: confirmations, reminders, payment requests | Phase 1 messaging |
| `_shared/email.ts` + `sendEmail` (Resend, branded HTML) | Copy & adapt | Phase 1 messaging |
| `reminders` + `cron.sql` (hourly job, each reminder sent only once) | Adapt for 48h / 2h reminders with a confirm link | Phase 1 |
| `_shared/util.ts` (`caller`, `can`, `fromCron`, `handle`, HMAC) | Copy & adapt as server helpers | Phase 1 setup |
| Stripe webhook check, recording payments once, refunds (`payments.ts`, `pay-webhook`, `settle.ts`, `refund`) | Adapt. **Saved cards and later charges are new work**: the church code only does one-time checkout. | Phase 1 payments |
| `push` (web push, quiet hours) | Optional phone notifications for booking alerts | Phase 1–2 |
| Roles + `can()` permission checks in the database | Reference for owner / stylist / renter / front desk | Later |
| `test/payments.ts` (fake processor test harness) | Copy the approach | Phase 1 payments |
| Calendar, volunteers, kiosk, forms, veritas-logos | Not used | — |

**Cautions:**
- The church app's `media` storage bucket is **public**. Client and color-formula photos here must use a **private** bucket with time-limited links.
- The Stripe SDK there is several major versions old. Use the current one.
- Don't copy from `veritas-logos`: part of it is GPL-licensed.

