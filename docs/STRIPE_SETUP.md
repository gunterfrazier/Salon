# Stripe setup for Chairvana

Card payments for deposits at booking, a card on file for no-show and late-cancel fees, online gift card sales, and (later, with the Android app) Tap to Pay.

## How it fits together

- **Chairvana** has one Stripe *platform* account (you, once).
- **Each salon** connects *its own* Stripe account from inside the app (Settings → Payments → Connect Stripe). Clients' money goes straight to the salon's bank. Chairvana never holds it.
- Salons use **Standard** connected accounts: they get their own full Stripe dashboard and pay Stripe's normal fees. This adds no monthly cost for Chairvana.
- Everything is built and tested in **test mode** first. Nothing real is charged until you switch the live keys on.

Stripe renames menus now and then. If a label below doesn't match exactly, look for the closest one.

---

## Part 1: You, for Chairvana (about 20 minutes)

### 1. Create the Chairvana Stripe account
1. Go to **dashboard.stripe.com/register** and sign up with the Chairvana business email.
2. Business details: Chairvana's legal business (or you as a sole proprietor for now), website **https://chairvana.app**, and a short description such as "Booking and payments software for hair salons".
3. Add a bank account for payouts. Chairvana only receives money if you later charge salons a subscription or a platform fee.

### 2. Turn on Connect
1. In the dashboard, open **Connect** (left menu, or search "Connect") → **Get started**.
2. Choose **Platform** (software that lets businesses take payments).
3. Pick **Standard** accounts (the salon owns the account and the Stripe dashboard is "full"). If Stripe asks who pays fees and who handles disputes, choose **the connected account (the salon)**.
4. Connect → **Settings** → **Branding**: name **Chairvana**, icon = the Chairvana mark (`app/public/brand/icon-512.png`), brand color **#3f6a84**.
5. Connect → **Settings** → **Onboarding options / OAuth**: add the redirect URL **https://chairvana.app/app/settings/payments/stripe**.

### 3. Get the test keys
1. Make sure you're in **test mode / a sandbox** (toggle at the top of the dashboard).
2. **Developers → API keys**:
   - **Publishable key**, starts with `pk_test_`
   - **Secret key**, starts with `sk_test_`. Click Reveal. Treat it like a password.
3. **Connect → Settings**: copy the **Client ID** (starts with `ca_`), if shown. It's used for connecting salons.

### 4. Add the webhook (so the app hears about payments)
1. **Developers → Webhooks → Add endpoint** (or "Add destination").
2. URL: **https://chairvana.app/api/stripe/webhook**
3. Turn on **"Listen to events on connected accounts"** (sometimes a separate "Connect" endpoint).
4. Events:
   - `checkout.session.completed`
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `setup_intent.succeeded`
   - `charge.refunded`
   - `account.updated`
5. Save, then copy the **Signing secret** (starts with `whsec_`).

### 5. Put the keys in Cloudflare (you, not in chat)
Cloudflare → **Workers & Pages → salon → Settings → Variables and Secrets** (the *runtime* list near the top, **not** the Build one):

| Name | Type | Value |
|---|---|---|
| `STRIPE_SECRET_KEY` | Secret | `sk_test_…` |
| `STRIPE_WEBHOOK_SECRET` | Secret | `whsec_…` |
| `STRIPE_PUBLISHABLE_KEY` | Text | `pk_test_…` |
| `STRIPE_CONNECT_CLIENT_ID` | Text | `ca_…` (if Stripe showed one) |

Click **Deploy** after adding them. Then tell me "Stripe test keys are in", without pasting the keys.

### 6. Apple Pay and Google Pay
**Settings → Payments → Payment method domains** → add **chairvana.app**. Stripe checks it, and Apple Pay / Google Pay then show up on phones automatically.

---

## Part 2: Karissa, for Intensity Salon (about 10 minutes, after I build the Connect button)

1. In Chairvana: **Settings → Payments → Connect Stripe**.
2. Stripe's secure pages open. She creates (or signs in to) Intensity Salon's Stripe account: business info, the last 4 of her SSN or her EIN, and the bank account for deposits.
3. She lands back in Chairvana showing **Connected**. Card payments switch on for her clients.

---

## What I build once the test keys are in

1. **Connect button** and status on Settings → Payments.
2. **Online deposits**: when a booking needs a deposit, the client pays it by card (or Apple/Google Pay) during booking. The booking confirms itself when the payment succeeds.
3. **Card on file**: the client saves a card when booking. No-show or late-cancel fees can then be charged with one tap, using the Policies you set.
4. **Card checkout** at the end of a visit, including tips.
5. **Gift cards sold online** from the salon page.
6. **Refunds** from the appointment, following the Policies rules.
7. Everything tested with Stripe's test cards. Then you swap in the **live** keys (same steps, `pk_live_` / `sk_live_` / a live webhook secret) and we do one real $1 test.

**Later, with the Android app:** Tap to Pay on the phone (Stripe Terminal).

## Costs (check stripe.com/pricing for current numbers)

- No monthly fee for Chairvana or the salon.
- The salon pays Stripe's per-payment fee on its own payments, roughly 2.9% + 30¢ for an online US card payment. In-person and Tap to Pay rates differ.
- Refunds return the payment to the client. Stripe usually keeps its original fee.

## Salon subscriptions (later)

Charging salons a monthly Chairvana fee can use **Stripe Billing** on the Chairvana platform account when bought on the website. If salons sign up inside the Android app, Google Play's billing rules may apply. We'll check those before the Play Store step.
