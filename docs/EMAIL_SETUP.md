# Business email for chairvana.app (Zoho Mail, free)

A real inbox for **hello@chairvana.app**, with its own phone app. It costs nothing on Zoho's **Forever Free** plan: up to 5 addresses, 5 GB each, and 25 MB attachments. You read it in the Zoho Mail app or at mail.zoho.com. The free plan doesn't connect to the Gmail or Outlook apps.

**It won't affect the app's emails.** Booking confirmations and reminders go out from **mail.chairvana.app** (Cloudflare). This inbox uses the main **chairvana.app** address. Only touch the records listed below, and leave anything with `mail` in its name alone.

Takes about 20–30 minutes. You switch between two tabs: **Zoho** (setup) and **Cloudflare → chairvana.app → DNS → Records**.

---

## 1. Sign up for the free plan
1. Go to **zoho.com/mail** → **Pricing**. Scroll to the bottom to **Forever Free Plan** and tap **Sign up now**. Zoho pushes paid trials; skip those.
2. Choose **Sign up with a domain I already own** and enter **chairvana.app**.
3. Create your account. For the email address, use **hello** (so it's hello@chairvana.app). Use a strong password and turn on two-step sign-in when Zoho offers it.

## 2. Prove you own the domain
1. Zoho shows a verification record. Pick the **TXT** method.
2. In Cloudflare DNS, **Add record**:
   - Type **TXT**, Name **@**, Content = the `zoho-verification=…` text Zoho shows.
3. Back in Zoho, tap **Verify**. It can take a few minutes. Try again if it fails the first time.

## 3. Turn off Cloudflare Email Routing (only if it's on)
Cloudflare → chairvana.app → **Email → Email Routing**.
- If it says Email Routing is **enabled** for chairvana.app, open **Settings** and **Disable** it. That frees up the mail (MX) records for Zoho.
- If disabling would remove anything named **mail** or **mail.chairvana.app**, stop and send me a screenshot first.
- If routing was never turned on, skip this step.

## 4. Point incoming mail to Zoho (MX records)
In Cloudflare DNS, delete any old **MX** records on **@** / chairvana.app (not ones on `mail`). Then add three. **Use exactly what Zoho's setup screen shows**: the values below are for US accounts, and EU accounts use `zoho.eu`.

| Type | Name | Mail server | Priority |
|---|---|---|---|
| MX | @ | mx.zoho.com | 10 |
| MX | @ | mx2.zoho.com | 20 |
| MX | @ | mx3.zoho.com | 50 |

In Zoho, tap **Verify MX**.

## 5. SPF (lets Zoho send as chairvana.app)
- Look for an existing **TXT** record on **@** that starts with `v=spf1`.
  - **None:** add TXT, Name **@**, Content `v=spf1 include:zoho.com ~all`
  - **One already there:** don't add a second one. Edit it to add `include:zoho.com` before the `~all` (or `-all`) at the end.
- Leave the SPF record on **mail** alone. That one is for the app.

## 6. DKIM (signs your emails so they don't land in spam)
1. Zoho → **Admin Console → Domains → chairvana.app → Email configuration → DKIM → Add**. Selector: **zmail**.
2. Zoho shows a long TXT value. In Cloudflare add TXT, Name **zmail._domainkey**, Content = that value.
3. In Zoho, tap **Verify**.

## 7. DMARC (if there isn't one yet)
Look for a TXT record named **_dmarc**.
- **None:** add TXT, Name **_dmarc**, Content `v=DMARC1; p=none; rua=mailto:hello@chairvana.app`
- **One already there:** leave it.

## 8. Extra addresses (optional)
**Admin Console → Users → hello → Mail aliases** to add addresses that land in the same inbox, such as **support@** and **billing@**. To give someone their own login (up to 5 on free), use **Users → Add user**, for example **karissa@chairvana.app**.

## 9. Phone app
Install **Zoho Mail** from the Play Store. Sign in as hello@chairvana.app and turn on notifications.

## 10. Test
1. From your personal email, send a message to **hello@chairvana.app**. It should arrive within a minute or two.
2. Reply from Zoho. Check it arrives at your personal email and isn't in spam.
3. Book a test appointment in Chairvana. The confirmation email should still arrive as before, from bookings@mail.chairvana.app.

If anything doesn't verify, send me a screenshot of your Cloudflare DNS list (or Zoho's error) and I'll tell you which record to fix. DNS changes can take up to an hour to show up, but usually just minutes.
