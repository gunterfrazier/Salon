# Chairvana: your to-do and test checklist

_Updated Nov 26, 2026. Check items off as you go. The app is now at **chairvana.app/app** (sign in at chairvana.app/app/login); old links still work._

## Part 1: Setup (things only you can do)

### Accounts and security
- [ ] Sign in once with the email link, then **Account → Set a password**. From then on, sign in with email + password.
- [ ] Have Karissa do the same with her email.
- [ ] Cloudflare: delete the API token you created for me (it starts with `cfut_`, expires Dec 3). Dashboard → My Profile → API Tokens.
- [ ] Supabase: delete the personal access token you made for me (Account → Access Tokens).
- [ ] Supabase: set up custom email sending (SMTP) so sign-in links aren't limited (see Texting and email below).

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
- [ ] Email (Cloudflare Email Service, mail.chairvana.app is set up): check your Workers plan. On **Workers Free**, Cloudflare only delivers to addresses verified in your account, so clients won't get emails. **Workers Paid ($5/month per account)** covers all your apps and includes 3,000 emails a month. Free alternative: a Brevo account (300 emails/day), then add `BREVO_API_KEY` and `EMAIL_FROM` in Cloudflare.
- [ ] **Account → Send me a test email**: it arrives from "Intensity Salon" at bookings@mail.chairvana.app.
- [ ] Supabase sign-in emails through Cloudflare (Supabase → Authentication → Emails → SMTP Settings): host `smtp.mx.cloudflare.net`, port `465`, username `api_token`, password = a Cloudflare API token with "Email Sending: Edit", sender `bookings@mail.chairvana.app`, name `Chairvana`.

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

### Pay
- [ ] **Pay**: set the pretend employee to Commission (e.g. 40% services, 10% retail); check out one of their visits with a tip. Their commission and tips show for this week.
- [ ] Switch them to Booth rent ($200/week, collects their own); record $100 rent received. Rent still owed shows $100.
- [ ] Switch to "salon collects and pays them out": pay out = their services + tips minus rent.
- [ ] Sign in as the pretend employee: **Pay** shows only their own numbers.
- [ ] **Download CSV** opens in a spreadsheet.

### Inventory (new screen)
- [ ] Stock: tap + and − on a product; the number changes right away and stays after refresh.
- [ ] Tap the number: count a partly used tube with ½.
- [ ] + Add: type "6N" and add one; use Brand → Line → Kind → Color to add another; Add to inventory.
- [ ] Scan a box: pick which color it is; next time, scanning opens that product.

### Reviews and marketing
- [ ] Check out a visit for the pretend client; about 3 hours later a "How was your visit?" link arrives (or see Messages → Recent messages).
- [ ] Rate it 5 stars: it appears on chairvana.app/s/intensity-salon under Reviews. Reply from **Reviews**.
- [ ] Rate another 2 stars: it shows only under Reviews → Private feedback.
- [ ] **Messages**: paste your Google review link so happy clients are offered Google too.
- [ ] **Marketing**: copy the booking link into Instagram/TikTok bios; download a QR code; print the mirror cling and business cards; add social links.

### Promo codes, loyalty and referrals
- [ ] **Marketing → Promo codes**: make NEWCLIENT15 (15% off, new clients only). Book online as a new pretend client with the code: the saving shows before booking.
- [ ] Apply a code at checkout: service prices drop; uses go up on Marketing.
- [ ] **Marketing → Loyalty & referrals**: turn on a punch card (e.g. every 3 visits for testing) and referrals; save.
- [ ] The pretend client's home page shows their card and "Share my link".
- [ ] Open their link in a private window and book as another new client: "Jamie sent you" shows; the welcome reward appears at that client's checkout.
- [ ] After that first visit, the referrer's reward appears at their next checkout.

### Booking and team access
- [ ] **New appointment**: pick a date; open times show soonest first. Add a long service: the list shrinks to times it fits.
- [ ] **Other time**: pick one outside your hours or on top of a booking; confirm **Book anyway**; it saves.
- [ ] New client with a deposit: lower it below the minimum, then try **Don't require one**.
- [ ] **Settings → Policies**: switch the team deposit option off; the deposit choices disappear when booking.
- [ ] **Settings → Policies**: set your real deposit amounts, notice hours and fees; check the client wording at the bottom.
- [ ] Move an appointment to an **Other time** on top of another booking; confirm **Move anyway**.
- [ ] **Team** → the pretend employee → **Access**: turn off *Lower prices*; at their checkout a lower price is refused.
- [ ] **Team → What each role can do**: turn off *Move and cancel* for Stylist; the buttons disappear for them.

### Check-in kiosk (tablet)
- [ ] On the tablet, sign in, **Front desk → Check-in kiosk**. Enter the pretend client's phone and tap **I'm here** on a same-day appointment.
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

### Look, studio and extras
- [ ] **Settings → Salon → Look & photos**: add a logo, cover photo, accent color and a few portfolio photos.
- [ ] **Screens** → add a *Front window sign*; **Copy TV link**; open it on a TV or phone: OPEN/CLOSED and the week's hours.
- [ ] **Screens** → add a *Waiting area*; add a **Message** slide (e.g. holiday hours) with a *Show until* date.
- [ ] **Screens** → add a *Front desk* (staff, touch); **Front desk → Open on this device**; tap the view tabs.
- [ ] **Graphics studio → Send to salon screens**; add it to a playlist with a **Picture** slide.
- [ ] *Color bar* screen: **Client card** finds a client and shows their formulas.
- [ ] On a TV's web browser open **chairvana.app/tv**; enter the 6-letter code on the screen's page under **TVs**. Set an **Exit PIN** and try the lock in the corner.
- [ ] **Remote** on your phone: Next, Back, Pause, and **Play something else** for an hour; then **Back to the schedule**.
- [ ] Add a **Schedule** rule (e.g. after closing, show the Window sign) and check it switches.
- [ ] Unplug the TV's internet for a minute: it keeps playing and shows *Offline*; the Screens list shows the TV as off after 5 minutes.
- [ ] Try **Look** (Dark / Light / Your accent color), **TV mounted on its side**, a **Background picture** on a slide, and **Upload video** with a **Video** slide.
- [ ] **Marketing → Graphics studio**: save an Openings post and a Chair Wrapped story; post one.
- [ ] Open **chairvana.app/intensity-salon** (your short link): it opens your salon page.
- [ ] Book online with **☾ Quiet visit** ticked: the Quiet visit tag shows on Today and the calendar.
- [ ] When testing is done: **Clients → Clean up** removes the practice clients and their bookings.

## Part 3: Known gaps (not built yet)
- Texts don't send until Twilio is set up; email needs Cloudflare Workers Paid (or a Brevo key) to reach clients.
- Clients without an email can't sign in (text-message sign-in can come with Twilio).
- Card payments / Tap to Pay (Stripe) aren't set up.
- Automatic ordering with SalonCentric needs a SalonInteractive partner agreement.
- Before the Play Store: Android app packaging, salon subscriptions (check Google Play billing rules), and open self-serve salon sign-up.
