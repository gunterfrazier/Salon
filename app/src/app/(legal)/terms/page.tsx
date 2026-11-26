import Link from "next/link";
import { SITE } from "@/lib/site";

export const metadata = { title: "Terms of service · Chairvana", description: "The terms for using Chairvana as a client or a salon." };

export default function Terms() {
  return (
    <>
      <h1>Terms of service</h1>
      <p className="text-muted">Last updated {SITE.legalUpdated}</p>
      <p>By using {SITE.name} ({SITE.url.replace("https://", "")}), you agree to these terms.</p>

      <h2>For clients</h2>
      <ul>
        <li>Appointments are with the salon, not with {SITE.name}. Prices, deposits, cancellation and no-show fees are set by each salon and shown before you book; when you book, you agree to that salon&apos;s policy.</li>
        <li>Openings shown are the salon&apos;s current availability and can change until your booking is confirmed.</li>
        <li>Give accurate contact details, and keep your password private.</li>
      </ul>

      <h2>For salons</h2>
      <ul>
        <li>You&apos;re responsible for your services, prices, policies, staff accounts and the client information you enter.</li>
        <li>Only text clients who agreed to receive texts, and record that agreement in {SITE.name}. Follow the <Link href="/texting">texting terms</Link>.</li>
        <li>Your client records belong to you. You can ask for a copy at any time.</li>
        <li>Salon accounts are approved by {SITE.name}. Paid plans, when offered, will be described before you&apos;re charged.</li>
      </ul>

      <h2>Acceptable use</h2>
      <p>Don&apos;t misuse {SITE.name}: no spam, false bookings, attempts to access other people&apos;s data, or interfering with the service.</p>

      <h2>Availability</h2>
      <p>
        We work to keep {SITE.name} running and your data safe, but the service is provided &ldquo;as is&rdquo;, without guarantees that
        it will always be available or error-free. To the extent the law allows, {SITE.name} isn&apos;t liable for indirect losses, such
        as missed appointments or lost business.
      </p>

      <h2>Ending use</h2>
      <p>You can stop using {SITE.name} at any time. We may suspend accounts that break these terms.</p>

      <h2>Changes</h2>
      <p>We may update these terms; we&apos;ll change the date above and tell account holders about important changes.</p>

      <h2>Contact</h2>
      <p>
        <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a> · <Link href="/privacy">Privacy policy</Link>
      </p>
    </>
  );
}
