# Business email for chairvana.app (Purelymail)

A real inbox for **hello@chairvana.app** that works in the **Gmail app** (or any mail app) on your phone.

**Cost:** about **$10 a year for the whole account**, not per person. Unlimited addresses (hello@, support@, karissa@…) and unlimited domains, so your other two apps' domains can share the same account later.

**It won't affect the app's emails.** Booking confirmations and reminders go out from **mail.chairvana.app** (Cloudflare). This inbox uses the main **chairvana.app** address. Only touch the records listed below, and leave anything with `mail` in its name alone.

Takes about 20 minutes. You switch between two tabs: **Purelymail** and **Cloudflare → chairvana.app → DNS → Records**.

---

## 1. Create the account
1. Go to **purelymail.com** → sign up and pay the $10/year.
2. You'll get a starter address on Purelymail's own domain. That's fine; you'll add chairvana.app next.
3. Turn on two-factor sign-in under your account security settings.

## 2. Add the domain
1. Open **purelymail.com/manage/domains** → add **chairvana.app**.
2. Purelymail shows an **ownership TXT record**. Keep this page open; its value is unique to your account.

## 3. Turn off Cloudflare Email Routing (only if it's on)
Cloudflare → chairvana.app → **Email → Email Routing**.
- If Email Routing is **enabled** for chairvana.app, open **Settings** and **Disable** it. That frees up the mail (MX) records.
- If disabling would remove anything named **mail** or **mail.chairvana.app**, stop and send me a screenshot first.
- If routing was never turned on, skip this step.

## 4. Add the DNS records in Cloudflare
In Cloudflare DNS, first delete any old **MX** records on **@** / chairvana.app (not ones on `mail`). Then **Add record** for each row:

| Type | Name | Content / Target | Extra |
|---|---|---|---|
| TXT | @ | *the ownership value Purelymail showed* | |
| MX | @ | `mailserver.purelymail.com` | Priority **50** |
| TXT | @ | `v=spf1 include:_spf.purelymail.com ~all` | see SPF note |
| CNAME | purelymail1._domainkey | `key1.dkimroot.purelymail.com` | **DNS only** (grey cloud) |
| CNAME | purelymail2._domainkey | `key2.dkimroot.purelymail.com` | **DNS only** |
| CNAME | purelymail3._domainkey | `key3.dkimroot.purelymail.com` | **DNS only** |
| CNAME | _dmarc | `dmarcroot.purelymail.com` | **DNS only**, see DMARC note |

**DNS only matters.** For each CNAME, click the orange cloud under Proxy status so it turns **grey (DNS only)**. Purelymail calls this very important.

**SPF note:** there can only be one SPF record on **@**. If a TXT on **@** starting with `v=spf1` already exists, don't add a second one. Edit it to include `include:_spf.purelymail.com` before the `~all`. Leave the SPF record on **mail** alone.

**DMARC note:** if a record named **_dmarc** already exists (TXT or CNAME), skip that last row and leave it as is.

## 5. Verify
Back on **purelymail.com/manage/domains**, check chairvana.app. Each record should turn green within a few minutes. If one stays red after 15 minutes, send me a screenshot of the Cloudflare DNS list.

## 6. Create the inbox
1. **purelymail.com/manage/users** → add user **hello@chairvana.app** with a strong password.
2. Optional extra addresses that land in the same inbox: **purelymail.com/manage/routing** → add a rule for an exact address (e.g. **support@chairvana.app** → hello@chairvana.app). There's also a catch-all option that sends *any* @chairvana.app address to hello@.

## 7. Add it to your phone (Gmail app)
Gmail app → your profile picture → **Add another account** → **Other** → enter **hello@chairvana.app** → **Personal (IMAP)** → password, then:

| | Server | Port | Security |
|---|---|---|---|
| Incoming (IMAP) | `imap.purelymail.com` | 993 | SSL/TLS |
| Outgoing (SMTP) | `smtp.purelymail.com` | 465 | SSL/TLS |

Username is the **full address** (hello@chairvana.app). If you turned on two-factor, create an **App Password** in Purelymail and use that instead of your normal password.

## 8. Test
1. From your personal email, send a message to **hello@chairvana.app**. It should show up in the Gmail app within a minute or two.
2. Reply from hello@. Check it arrives and isn't in spam.
3. Book a test appointment in Chairvana. The confirmation should still arrive as before, from bookings@mail.chairvana.app.

DNS changes usually show up within minutes, occasionally up to an hour.
