import Link from "next/link";
import { SITE } from "@/lib/site";

export const metadata = { title: "Privacy policy · Chairvana", description: "What Chairvana collects, why, who it's shared with, and your choices." };

export default function Privacy() {
  return (
    <>
      <h1>Privacy policy</h1>
      <p className="text-muted">Last updated {SITE.legalUpdated}</p>
      <p>
        {SITE.name} ({SITE.url.replace("https://", "")}) is software that salons use to run their appointment book, client records and
        online booking, and that clients use to find salons and book. This policy explains what we collect, why, and your choices.
      </p>

      <h2>Who is responsible for your information</h2>
      <p>
        When you book with a salon, that salon keeps its own client record for you (for example, your appointment history, notes and
        color formulas). The salon decides how it uses that record; {SITE.name} stores it for them. For your {SITE.name} account and
        the website itself, {SITE.name} is responsible.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Contact details:</strong> name, mobile number and email address.</li>
        <li><strong>Appointments:</strong> services, times, stylist, deposits, payments and receipts, and the booking policy you agreed to (with the time and device it was agreed from).</li>
        <li><strong>Salon records:</strong> notes, preferences, color formulas and photos a salon adds to your client record.</li>
        <li><strong>Your account:</strong> sign-in email, password (stored scrambled; we can&apos;t read it), preferred salon and stylist, and home ZIP code or city if you add one to find nearby openings.</li>
        <li><strong>Messages:</strong> the texts, emails and phone alerts sent through {SITE.name}, and whether they were delivered.</li>
        <li><strong>Technical data:</strong> basic logs such as IP address and browser type, used to keep the service secure and working.</li>
      </ul>
      <p>We don&apos;t store card numbers. Payments recorded in {SITE.name} show the method and amount, not the card.</p>

      <h2>How we use it</h2>
      <ul>
        <li>To book, change and remind you about appointments, and send receipts.</li>
        <li>To let salons keep accurate client records.</li>
        <li>To show openings at your preferred salon, stylist, or nearby salons when you ask.</li>
        <li>To keep accounts secure, prevent abuse, and fix problems.</li>
      </ul>
      <p>We don&apos;t sell personal information, and we don&apos;t use it for advertising.</p>

      <h2>Text messages</h2>
      <p>
        We text you only if you agreed, either on the booking page or by telling your salon. Reply STOP to stop. We don&apos;t share
        mobile numbers or text-message consent with third parties or affiliates for their marketing. See the{" "}
        <Link href="/texting">texting terms</Link>.
      </p>

      <h2>Who we share it with</h2>
      <ul>
        <li><strong>The salon you book with</strong>, which sees your details and appointment history at that salon only.</li>
        <li>
          <strong>Service providers that run {SITE.name} for us</strong>, only as needed: hosting and database (Supabase, Cloudflare),
          text messages (Twilio), email (Resend), and phone alerts (your browser&apos;s push service, such as Google).
        </li>
        <li><strong>When required by law</strong>, or to protect people from harm or fraud.</li>
      </ul>

      <h2>How long we keep it</h2>
      <p>
        Salon records are kept while the salon uses {SITE.name}, or until the salon deletes them. Your account stays until you ask us to
        close it. Message logs are kept up to two years.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>Update your details on your account page, or ask your salon.</li>
        <li>Turn off texts by replying STOP; turn off phone alerts in your browser or phone settings.</li>
        <li>
          Ask for a copy of your information, or ask us to delete your account, by emailing{" "}
          <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>. For a salon&apos;s client record, we&apos;ll work with that salon.
        </li>
      </ul>

      <h2>Security</h2>
      <p>Data is encrypted in transit, access is limited by role inside each salon, and formula photos are stored privately.</p>

      <h2>Children</h2>
      <p>{SITE.name} accounts are for people 13 and older. A parent or guardian can book for a child.</p>

      <h2>Changes</h2>
      <p>If we change this policy, we&apos;ll update the date above, and tell account holders about important changes.</p>

      <h2>Contact</h2>
      <p>
        Questions: <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>
      </p>
    </>
  );
}
