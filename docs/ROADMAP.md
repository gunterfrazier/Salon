# Chairvana — Roadmap & supplier research

_Updated 2026-11-26_

## Built so far
Calendar (day/week/month, go-to-date, Find a time), stylist booking with stacked services, deposits, flags and policy rules, check-out / cancel / no-show, clients (profiles, favorites, formulas with private photos, balances), StyleSeat import, online booking with search and remembered favorites, holiday schedule and days off, time zones everywhere, payment settings. Hosting: Cloudflare Workers at chairvana.app; database: Supabase.

## Progress (Nov 26)
- **A. Notifications & messaging: built.** Today agenda; Messages settings (reminder times, quiet hours, wording); outbox + 5-minute scheduler; deposit-hold reminders/release; receipts, review requests, rebook nudges; moving appointments with change notices; push alerts to the stylist's devices. Texts/email switch on when Twilio/Resend keys are added in Cloudflare.
- **B. Reporting: built.** Ranges with comparisons, money by type/method, visits, rates, clients, services, busiest times, CSV downloads.
- **C. Inventory: built (first pass).** Products from the Kenra/Redken catalog or by hand, counts, received, min/max, reorder lists by supplier, barcode scanning, usage per formula (oz/g/ml/tubes → % of a tube), supply check when booking and on Today, low stock in the day preview. Next: SalonInteractive partner inquiry for SalonCentric auto-ordering.

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
