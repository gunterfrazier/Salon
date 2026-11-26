import Link from "next/link";
import { SITE } from "@/lib/site";

export const metadata = { title: "Texting terms · Chairvana", description: "How appointment text messages from salons on Chairvana work, and how to stop them." };

export default function TextingTerms() {
  return (
    <>
      <h1>Texting terms</h1>
      <p className="text-muted">Last updated {SITE.legalUpdated}</p>

      <h2>What these messages are</h2>
      <p>
        Salons use {SITE.name} to send their clients text messages about appointments: booking confirmations, reminders, changes and
        cancellations, deposit reminders, receipts, and replies about your visit. Each message names the salon it comes from. If you
        turn it on, a salon may also send an occasional message asking for a review or inviting you to book your next visit.
      </p>

      <h2>How you agree to them</h2>
      <ul>
        <li>When you book online, by ticking <strong>&ldquo;Text me about my appointments&rdquo;</strong>. The box is not ticked for you, and you don&apos;t need to tick it to book.</li>
        <li>Or by telling your salon in person or by phone that it&apos;s OK to text you. The salon records that in your client record.</li>
      </ul>
      <p>Agreeing to texts is never a condition of buying anything.</p>

      <h2>How often</h2>
      <p>Message frequency varies with your appointments. Most clients get two to four texts per appointment.</p>

      <h2>Stopping and help</h2>
      <ul>
        <li>Reply <strong>STOP</strong> to any message to stop texts from that number. You&apos;ll get one message confirming you&apos;re opted out.</li>
        <li>Reply <strong>START</strong> to turn them back on.</li>
        <li>Reply <strong>HELP</strong> for help, or email <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>. You can also contact your salon directly.</li>
      </ul>

      <h2>Costs</h2>
      <p>Message and data rates may apply, depending on your mobile plan. {SITE.name} and salons don&apos;t charge for these texts.</p>

      <h2>Carriers</h2>
      <p>Mobile carriers are not liable for delayed or undelivered messages.</p>

      <h2>Your number and privacy</h2>
      <p>
        We don&apos;t sell your phone number, and we don&apos;t share mobile numbers or text-message consent with third parties or
        affiliates for their marketing. See our <Link href="/privacy">privacy policy</Link> for more.
      </p>
    </>
  );
}
