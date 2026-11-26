# Chairvana — Roadmap & supplier research

_Updated 2026-11-26_

## Built so far
Calendar (day/week/month, go-to-date, Find a time), stylist booking with stacked services, deposits, flags and policy rules, check-out / cancel / no-show, clients (profiles, favorites, formulas with private photos, balances), StyleSeat import, online booking with search and remembered favorites, holiday schedule and days off, time zones everywhere, payment settings. Hosting: Cloudflare Workers at chairvana.app; database: Supabase.

## Progress (Nov 26)
- **A. Notifications & messaging: built.** Today agenda; Messages settings (reminder times, quiet hours, wording); outbox + 5-minute scheduler; deposit-hold reminders/release; receipts, review requests, rebook nudges; moving appointments with change notices; push alerts to the stylist's devices. Texts/email switch on when Twilio/Resend keys are added in Cloudflare.
- **B. Reporting: built.** Ranges with comparisons, money by type/method, visits, rates, clients, services, busiest times, CSV downloads.
- **C. Inventory: built (first pass).** Products from the Kenra/Redken catalog or by hand, counts, received, min/max, reorder lists by supplier, barcode scanning, usage per formula (oz/g/ml/tubes → % of a tube), supply check when booking and on Today, low stock in the day preview. Next: SalonInteractive partner inquiry for SalonCentric auto-ordering.

## Accounts, stylists and marketplace (decided Nov 26)
1. **Done:** password sign-in, Account page, roles & permissions (Owner/Admin, Manager, Stylist, Front desk, Booth renter; per-role switches), Team page, client portal.
2. **Multi-stylist scheduling (in progress):** appointments belong to a stylist; per-stylist hours, services and time off; calendar by stylist; stylists see their own book; online booking picks a stylist or "anyone".
3. **Marketplace:** customer accounts independent of any salon (each salon keeps its own client record, notes, formulas and flags); preferred/primary salon and stylist; openings for the preferred stylist → all stylists at the salon → all salons within N miles of a ZIP/city; public salon and stylist pages.
4. **Salon onboarding:** salons apply; the platform owner approves each one for now. After testing: open self-serve sign-up.
5. **Launch:** Android app on the Play Store (packaged web app / Trusted Web Activity) and a subscription for salons. Check Google Play's billing rules for subscriptions sold in-app before launch.

## Plan (in order)

| Phase | What | Depends on |
|---|---|---|
| **A. Notifications & messaging** | New online-booking alerts to the stylist; reminders for stylist and client at chosen intervals; automatic change/cancel notices; receipts by text/email; review requests; release unpaid deposit holds; **Today** agenda list (services + clients for the day). Push to the stylist's Android devices; text/email to clients. | Twilio (reminder set for Fri Nov 27, 9 AM CST) + email provider (Resend) |
| **B. Reporting** | Revenue, tips, services vs retail, deposits/fees, balances, no-show/late-cancel rates, busiest times, rebooking rate, payments by method, CSV export. | — |
| **C. Inventory** | Products with sizes and min/max; usage in percentages/ounces/grams per service and per client visit (linked to the formula); low-stock alerts; supply check when a client books ("last visit used 1.5 tubes of 6N; 1 in stock"); vendor reorder lists for SalonCentric and CosmoProf; barcode scanning with the phone camera. | Product data (see research) |
| **D. Point of sale & retail** | Retail items at checkout; Stripe cards + Tap to Pay on Android; printed receipts (receipt printer); self check-in kiosk; front-desk accounts with limited permissions. | Stripe account |
| **E. Marketing & growth** | QR codes (booking, reviews, check-in); social links; specials and promo codes; loyalty (points or punch card, optional Google Wallet pass); referrals; reviews (Google + private feedback); graphics generator for posts/flyers using the stylist's photos and brand assets she downloads. | A (messaging) for reviews/referrals |
| **F. Digital signage / smart board** | Display-only calendar (day/week/month) with specials, QR codes and reviews, first names only. **Android TV / Fire TV stick** (browser or a small kiosk app; the church app's Android TV WebView approach can be reused) and a **touchscreen smart board** mode (tap a day, check in). | — |
| **G. Online store (optional)** | Evaluate later: hosted store (e.g. Shopify with drop-ship apps) linked from Chairvana vs built-in. | Stripe |
| **H. Brand, UI and marketing site** | Logo and palette; UI redesign (stylish + functional); per-salon branding on the salon page, booking, emails and receipts (logo, accent color, cover photo, gallery); chairvana.app marketing site; branded email templates. | Domain decision (below) |

## Competitor review & brand plan (Nov 26)
Reviewed Meevo, Zenoti, Vagaro (salon page + pricing), Booksy's buyer's guide, and earlier Mangomint, StyleSeat, Booksy. Reference sites for our own marketing: ourfaithfulchurch.com, veritaslogos.com.

**Decide now (affects remaining work):**
- **Domain layout.** Push subscriptions, saved passwords, sign-in links, links in sent texts, and the Play Store app's domain check (assetlinks) are all tied to the domain. Pick before Friday's Resend/Twilio setup and before Play Store packaging.
- **Privacy policy, terms and SMS terms pages.** Twilio's A2P 10DLC review and the Play Store listing both need a public website with these pages and the text opt-in wording.
- **Email sender:** `bookings@chairvana.app` with the salon's name as the display name and the salon's email as reply-to.

**Features others have that we don't (candidate order):**
1. **Done (Nov 26):** Waitlist: auto-notify when a slot opens (Meevo, Vagaro, Zenoti). Team Waitlist page, "Join the waitlist" in online booking, offers by text/email at most once a day with a link to book.
2. Card on file, no-show/late fees charged automatically (Booksy's top point). With Stripe.
3. **Done (Nov 26):** Digital forms: intake, color consultation, patch-test/consent, signed on a phone or the kiosk (Vagaro, Zenoti, Meevo). Settings → Forms; sent with bookings; shown on the client profile.
4. Gift cards, packages/memberships (all four).
5. Commissions, tips by stylist, booth rent collection (Vagaro, Zenoti). Decide how booth renters take payments before Stripe.
6. Reputation: review requests + private feedback (already in Phase E).
7. Book from Instagram/Google/Facebook (Zenoti); Reserve with Google later.
8. Later: AI receptionist / missed-call text-back (Meevo, Zenoti, Vagaro all lead with it).

**Pricing reference:** Vagaro $30/mo base (one calendar), add-ons priced separately (text marketing $20+, forms $10, website $20, branded app $100, payroll $34+$5/person). Opportunity: one simple price with booking page, branded salon page and app included.

**Marketing site pattern (from the reference sites):** short headline + one-line subhead + two buttons (primary action and "try the demo salon"); real app screenshots as the imagery; sections for each audience (owner, stylist, client, front desk); a "Questions" FAQ (price, data, Android); Sign in at the top right; footer with privacy/terms.

## Supplier & brand research (Nov 2026)

### Ordering (SalonCentric, CosmoProf)
- **SalonCentric** (L'Oréal USA's distributor) connects to salon software through **SalonInteractive**, an API platform it partly owns. Partners include Phorest, Meevo, Rosy, Vish, Square and Inspire/STX. Rosy auto-generates orders from preset thresholds and sends them to SalonCentric — exactly the min/max auto-ordering we want. Access is through a partner agreement (no public self-serve API found). **Action:** contact SalonInteractive about becoming a software partner once inventory (Phase C) exists.
- SalonCentric's own app: barcode scan to cart, save for later, reorder from purchase history, send order to a store or business partner.
- **CosmoProf** (Sally Beauty): no public software integration or API found. Its site has **Quick Order** and **Order Again** from past orders. **Plan:** Chairvana keeps each product's CosmoProf item number and builds a reorder list to enter in Quick Order (or email to the sales rep).
- saloncentric.com blocks automated reading; details above come from SalonCentric's app pages and partner software documentation.

### Product & shade data
No brand publishes a machine-readable catalog; shade charts are PDFs (often behind free professional registration):
- **Redken:** shade charts, Product Guide 2026 PDF, asset library (pro login).
- **L'Oréal Professionnel / Matrix:** shade charts on L'Oréal Pro resources and **L'Oréal Access** (free registration).
- **Wella:** Koleston Perfect leaflets and usage booklets (mixing ratios, e.g. 1:1 and 1:2 for special blondes); digital shade charts in the Wella Education app.
- **Schwarzkopf Professional:** US Download Center: IGORA ROYAL / VIBRANCE / ZERO AMM swatch charts, conversion guides, logos, packshots.
- **Joico:** technical charts (color intensity, LumiShine swatch chart) and Salon Toolkit.
- **Goldwell:** education PDFs; no public shade chart found. **L'ANZA:** L'ANZA Pro portal (certification); no public chart found.
- **Kenra:** 8 PDFs (shade chart, wall chart, product knowledge) on the salon-material page, no login shown.
- **Started (Nov 26):** `app/seed/color-catalog.json` holds the salon's lines, Kenra and Redken: **Kenra Color** (83 shades, each marked Permanent / Demi / both), Monochrome, Rapid Toner, Boosters, Studio Stylist Express, Simply Blonde; **Redken Shades EQ** (126 shades with names, marked Gloss / Bonder Inside / both, plus pastels and kickers), and Redken mixing ratios for Shades EQ, Shades ALK, Color Gels (Oils, Lacquers, 10 Min) and Color Fusion. Still to fill in: Kenra mixing ratios (not on the shade chart; confirm from Kenra's Product Knowledge PDF), tube/bottle sizes and item numbers (at the first stock count or by barcode), and any other Redken lines Karissa uses (their charts are in the same Product Guide).
- **Plan:** start inventory with the lines the salon actually uses: enter shades from the charts (Claude can transcribe PDFs), sizes and mixing ratios, then add anything else by **scanning the barcode**. Mixing ratios let usage be logged as "1 tube + developer 1:1".

### Marketing assets
Redken Asset Library and Social Media Kit, Schwarzkopf Download Center, L'Oréal Access resource bank, Joico Salon Toolkit, Wella marketing site and social media guides. These are for salons promoting the brands they carry and usually need a professional login. **Plan:** the stylist downloads with her own login and uploads into a Chairvana media library used by the graphics generator and signage; Chairvana does not scrape brand sites. Check each brand's terms before use on signage/ads.

### Color management tools (for comparison)
**Vish** and **SalonScale** weigh color on Bluetooth scales and track grams used; SalonScale lists 300+ color lines; Vish orders from SalonCentric via SalonInteractive. Chairvana can add a Bluetooth scale later (Web Bluetooth works in Chrome on Android) for gram-accurate per-client usage.
