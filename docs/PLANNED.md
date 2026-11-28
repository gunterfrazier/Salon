# Planned features (being refined, not built yet)

**Ground rule:** policy choices belong to each salon. Chairvana offers the options and sensible defaults. It never picks one rule for everyone. Every feature below is optional and off until the salon turns it on.

Suggested build order: 1. Services and groups editor, 2. Account types and joining a salon, 3. Licenses and ID, 4. Sick days (texts need Twilio), 5. Walk-ins.

## 1. Services and groups editor (built)
- Add, edit, reorder and archive services and their groups (Color, Cuts…). Today the menu only comes from the list loaded at setup.
- Per service: price, time, processing time, deposit, bookable online, and **who offers it**.
- The salon shows every service it offers. Each stylist only takes the ones they're set up for. This already applies to online booking. **New appointment** in the app should also warn, the same way it warns for a double-booking.
- Each salon decides whether stylists can have their **own price or time** for a service (for example senior and junior pricing).

## 2. Account types and joining a salon (built, except below)
Still to do: the per-salon setting for **who keeps the clients** when a stylist joins or leaves, and team discounts. Suspended dates are recorded so billing can skip them once subscriptions exist.
- **Client, stylist, salon owner.** One login can hold more than one of these, with a switcher. Sign-up asks which one you are.
- **Salon owner (primary account holder):** registers the salon and has admin control.
- **Stylist:** gets a solo business right away: clients, booking and payments.
  - **Ask to join a salon:** the owner gets the request and accepts or denies it.
  - While a request is pending, the stylist keeps using their own business. They don't see the salon's name or information, and team discounts don't apply.
- **Join code or QR code from the owner:** signs the stylist up, approves them and links them to the salon automatically. Each code has a role, an expiry, and is one-time or reusable.
- **Suspend** (for example medical leave):
  - the stylist is hidden from booking and can't sign in;
  - next month isn't charged until they're reinstated;
  - their upcoming appointments go through the sick-day steps.
- **Remove:** unlinks the stylist from the salon.
- **Who keeps the clients** when a stylist joins or leaves is set by each salon, and can differ by stylist type (booth renter, commission, hourly).

## 3. Licenses and ID (licenses, confirmation and reminders built; photo ID waits on Stripe)
- Upload the license (photo or PDF) with its number, state and expiry date, stored privately.
- Renewal reminders 90, 60 and 30 days before expiry. The salon can choose to stop expired stylists from being booked.
- **License check:** there's no national service, so each state board's lookup is used. To start, it's confirmed by hand with a link to the board's lookup page. Automatic checks can be added state by state.
- **Photo ID:** Stripe Identity (ID plus selfie, about $1.50 per check). Stripe keeps the ID images; Chairvana doesn't. This waits on the Stripe account.

## 4. Sick days and substitutes (built; texts to clients start once Twilio is approved, email works now)
- "Out sick" for a day or a range of days lists the affected appointments. The salon's settings decide what happens next.
- **Notify and reschedule:** each client gets a link to rebook.
- **Substitutes, if the salon allows them:** the link also shows other stylists at the salon who do that service and have real openings.
- **Credits and discounts:** optional, and the salon or stylist chooses whether to offer them. Each option has its own amount (dollars or percent) and its own **who pays** split (salon, stylist, or shared), set when the option is set up. Example amounts:

  | Client's choice | Example |
  |---|---|
  | Different stylist, same window | $5 credit |
  | Different stylist, different window | $10 credit |
  | Same stylist, different day | 20% off |
  | Different stylist, different day | 5–10% off |
- **Stacking:** each salon decides whether credits, discounts and promo codes can be combined.
- **How offers work:**
  - only times that are really open are offered, checked again at the moment the client picks one;
  - first come, first served, with no holds;
  - an offer disappears when its time is gone or it expires;
  - the credit lands on the client's account and applies automatically at checkout;
  - deposits move to the new appointment.

## 5. Walk-ins (built; "almost up" texts start once Twilio is approved, email works now)
- Off, or on. The salon runs one of three ways: **appointments only**, **both**, or **walk-ins only** (barbershops).
- **Joining the queue:** at the check-in tablet, at the front desk, or online if the salon allows it. The client picks a stylist or **next available**. A walk-in only fits into a gap before that stylist's next appointment.
- **Assignment, a stack of rules the salon sets:**
  1. **Who can take walk-ins:** everyone, commission stylists only, or a chosen list. They must offer the service and be working now.
  2. **How the next person is picked:**
     - fixed order (seniority, or a specific stylist first);
     - rotation, reset daily or weekly or carried over;
     - balanced, so everyone gets about the same over a set period;
     - whoever is free soonest.
  3. **Fallback:** next available.
  4. If the client asks for a specific stylist, that always comes first.
- **How a turn is counted** is the salon's choice: full turn per visit, quick services as a half turn, by minutes, or by dollars.
- **Wait times:**
  - each stylist's estimate is the time left on their current client, plus the people ahead in their queue, plus any appointment coming up;
  - **Anyone** shows the shortest wait;
  - estimates show as ranges ("about 20–30 min") on the booking page and the waiting-area TV;
  - optional "you're almost up" text (needs Twilio).
