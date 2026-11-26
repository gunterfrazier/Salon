# Chairvana: your to-do and test checklist

_Updated Nov 26, 2026. Check items off as you go. The app is now at **chairvana.app/app** (sign in at chairvana.app/app/login); old links still work._

## Part 1: Setup (things only you can do)

### Accounts and security
- [ ] Sign in once with the email link, then **Account → Set a password**. From then on, sign in with email + password.
- [ ] Have Karissa do the same with her email.
- [ ] Cloudflare: delete the API token you created for me (it starts with `cfut_`, expires Dec 3). Dashboard → My Profile → API Tokens.
- [ ] Supabase: delete the personal access token you made for me (Account → Access Tokens).
- [ ] Supabase: set up custom email sending (SMTP) so sign-in links aren't limited. Supabase's built-in email only sends a few messages per hour. Do this with the email service below.

### Salon profile and menu
- [ ] **Settings → Salon**: address, salon phone, about, web address. Saving the address puts you in nearby search.
- [ ] **Services**: set prices for the 9 services marked "price needs review" (the color-only prices).
- [ ] **Payments**: turn on the apps you take (Venmo, Cash App, Zelle, PayPal…) and add your handles.
- [ ] **Schedule**: check which holidays are closed; add upcoming days off.
- [ ] **Team → Schedule & services** for Karissa: title (e.g. "Color specialist"), short bio, calendar color, her hours if different from the salon's.
- [ ] **Team**: if you (Gunter) don't do hair, open your Schedule & services and turn off **Takes appointments**.

### Forms
- [ ] **Settings → Forms**: add the starter forms you want (New client form, Color consultation, Patch test & color consent). Read the consent wording and change anything that doesn't fit; it isn't legal advice.

### Messages and alerts
- [ ] **Account** (each person): enter your mobile under "Send my alerts to", then on your Android phone tap **Turn on alerts on this device** and **Send a test**.
- [ ] **Messages**: read the reminder and notice wording; change anything that doesn't sound like you.
- [ ] **Messages**: if you want review requests, paste your Google review link and turn it on.
- [ ] **Clients**: open regular clients who agreed to texts and tick **OK to text** (needed before reminders can be texted).

### Texting and email (Twilio is Friday Nov 27, 9:00 AM)
- [ ] Before Twilio: make the mailbox **hello@chairvana.app** work (free: Cloudflare → chairvana.app → Email → Email Routing → forward it to your Gmail). The privacy and texting pages list it.
- [ ] Twilio: create the account, register for business texting (Sole Proprietor A2P 10DLC), buy a local number.
- [ ] In the Twilio registration form, use these links:
  - Website / privacy policy: https://chairvana.app/privacy
  - Terms: https://chairvana.app/terms (texting terms: https://chairvana.app/texting)
  - How clients opt in: "On the online booking page (https://chairvana.app/s/intensity-salon/book) clients tick an unchecked box, 'Text me about my appointments', with message frequency, rates, STOP/HELP and links to terms and privacy. Clients can also agree in person; the stylist records it on the client's record."
  - Sample messages: copy two from **Messages → Recent messages** (a confirmation and a reminder).
- [ ] Add 3 Twilio keys in Cloudflare (Workers → salon → Settings → Variables and Secrets): `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_MESSAGING_SERVICE_SID` (or `TWILIO_FROM`).
- [ ] Email: create a Resend account, verify chairvana.app (add the DNS records in Cloudflare), then add `RESEND_API_KEY` and `EMAIL_FROM` in Cloudflare.
- [ ] Use the same Resend account as Supabase's SMTP (see above).

### Inventory (when you're ready)
- [ ] **Inventory → Add products**: add the Kenra and Redken shades you stock.
- [ ] Enter the tube/bottle sizes, your costs, and SalonCentric / CosmoProf item numbers.
- [ ] Do a first **Count** of everything on the shelf.
- [ ] Tell me Karissa's usual Kenra mixing ratios so I can add them.

## Part 2: Testing

Use a second email address (a Gmail you control) as a pretend client, and a third as a pretend employee. Text messages show as "Not sent: Texting isn't connected yet" in **Messages → Recent messages** until Twilio is set up. That's expected, and it shows what would have gone out.

### Sign-in
- [ ] Sign in with email + password; close the browser; reopen. You should still be signed in.
- [ ] "Reset my password" from the sign-in page works.
- [ ] Account → "Sign out on all devices" signs out your other devices.

### Calendar (as the owner)
- [ ] Book an appointment with stacked services (color + cut). Check the 5% package discount and the deposit.
- [ ] Book a short service during another appointment's processing time (the striped part).
- [ ] **Move** an appointment to another day. Check "Let the client know" creates a "changed" message in the log.
- [ ] **Cancel** one inside 24 hours. Check the charge prompt and that a flag is added.
- [ ] **No-show** one (after its start time).
- [ ] **Check out** with an adjusted price, a tip, and a retail product. Open **Receipt** and print it.
- [ ] Mark a deposit received on a pending online booking.
- [ ] Month view, Go to date, and **Find a time** (try "Fridays, morning, 4 weeks out").
- [ ] After checkout, use **Book next visit** (rebooking).

### Online booking (as the pretend client, in a private browser window)
- [ ] Open chairvana.app/s/intensity-salon, tap **Book online**, book as a new client. A deposit should be requested, and the time held.
- [ ] Back as the owner: it shows as pending deposit; you get a "new online booking" alert.
- [ ] Try booking a holiday (e.g. Christmas Eve). It shouldn't be offered.

### Customer account and portal (pretend client)
- [ ] Sign up at chairvana.app/signup, open the email link, set a password.
- [ ] The home page shows the booking you made above.
- [ ] **Change time** (more than 24 hours out) and **Cancel** both work. A cancel inside 24 hours warns about the late fee.
- [ ] **My salon & stylist**: pick Intensity Salon and Karissa; add a home ZIP.
- [ ] **Openings for you**: try each level (stylist → salon → nearby).
- [ ] chairvana.app/find: search "women's cut" near your ZIP. Tapping a time opens booking at that time.

### Waitlist
- [ ] Online booking (pretend client): pick services, choose days/times with no openings, tap **Join the waitlist**, tick "Text me", join.
- [ ] As owner: a "joined the waitlist" alert arrives, and the client shows on **Waitlist**.
- [ ] Cancel an appointment that matches; within about 5 minutes a waitlist offer appears in **Messages → Recent messages** (texts send after Twilio). Its link opens booking at that time.
- [ ] Book that time as the client: the waitlist entry moves to "Booked" (closed list) within 5 minutes.
- [ ] Client home page shows the waitlist spot; **Leave the waitlist** removes it.
- [ ] Add someone from a client's profile (**Add to waitlist**) and remove them.

### Forms
- [ ] Book a color service for the pretend client: the confirmation includes a forms link (see **Messages → Recent messages**).
- [ ] Open the link on a phone: answer, sign with your finger, send. "Next form" appears if there's another.
- [ ] Client profile → **Forms**: answers, signature and any allergy/reaction warning show; **Print** works.
- [ ] Client profile → **Fill in on this device** opens a form on the tablet.
- [ ] Kiosk: check in a client with a waiting form; **Fill it in now** appears, and "Back to check-in" returns.
- [ ] Book the same color service again within 6 months: the consent form isn't asked again.

### Gift cards and packages
- [ ] **Sell → Gift card**: sell a $50 card; print it.
- [ ] Check out a visit using the card for part of it and cash for the rest. Its balance goes down on **Gift cards & packages**.
- [ ] Try to spend more than the balance: it's refused.
- [ ] Use the card on a product sale under **Sell → Products**.
- [ ] **Gift cards & packages → New package**: e.g. "3 blowouts", then **Sell → Package** to the pretend client.
- [ ] Check out that client's blowout: tick **Use package**; the line shows "Package" and visits left go down (client profile and their home page).
- [ ] **Reports**: gift card and package sales show under money received; gift card spending shows as "Also paid with gift cards".

### Check-in kiosk (tablet)
- [ ] On the tablet, sign in, Today → **Check-in kiosk**. Enter the pretend client's phone and tap **I'm here** on a same-day appointment.
- [ ] You get a check-in alert; the calendar shows "Checked in".

### Team and roles (pretend employee)
- [ ] **Team → Add**: add the pretend employee as **Stylist**. Send them the invite.
- [ ] They sign in: the menu is limited (no Reports, Payments, Team).
- [ ] With "See and manage everyone's appointments" off for Stylist, they only see their own book and clients.
- [ ] Give them their own hours and only some services. Online booking offers them only for those, plus "Anyone available".
- [ ] Add personal time off for them (Schedule → Who's off). Only their book is blocked.
- [ ] When done, **Turn off** the test employee.

### Salon sign-up and approval
- [ ] Submit chairvana.app/join with a test salon and email.
- [ ] **Platform**: approve it; copy the owner message.
- [ ] Sign in as that test owner: the salon has a starter menu and its own page.
- [ ] Back on **Platform**, **Suspend** the test salon so it isn't public.

### Inventory, sales and reports
- [ ] Inventory: count a product, scan a barcode with the phone camera, check the **Reorder** list.
- [ ] Save a color formula with **Products used**. Stock goes down; booking that client warns if you're short.
- [ ] **Sell**: a walk-in retail sale; print its receipt.
- [ ] **Reports**: check today's/this month's numbers against your test data; download the CSVs.

### Alerts and messages
- [ ] Evening day preview arrives at 7:30 PM (push, or text once Twilio is on).
- [ ] After Twilio: book a test appointment for your own phone, then check the confirmation, a reminder, and a cancel notice arrive, and nothing arrives during quiet hours.

## Part 3: Known gaps (not built yet)
- Texts and email don't send until Twilio and Resend keys are added.
- Clients without an email can't sign in (text-message sign-in can come with Twilio).
- Card payments / Tap to Pay (Stripe) aren't set up.
- There's no way to delete test clients or appointments yet; cancel test appointments instead. I can add cleanup tools if you need them.
- Automatic ordering with SalonCentric needs a SalonInteractive partner agreement.
- Before the Play Store: Android app packaging, salon subscriptions (check Google Play billing rules), and open self-serve salon sign-up.
