/* eslint-disable @next/next/no-img-element -- static brand art */
import Link from "next/link";
import SiteFooter from "@/components/SiteFooter";
import TideMark from "@/components/landing/TideMark";

export const metadata = {
  title: { absolute: "Chairvana · Where your schedule finds its flow" },
  description: "Where your schedule finds its flow. Salon booking and management for salon owners and independent stylists: online booking with deposits, reminders, waitlist, client records and color formulas, forms, gift cards, inventory, pay and reports.",
};

const OWNER = [
  ["Online booking that respects your rules", "Clients pick services, a stylist or anyone, and an open time. Deposits, notice, holidays and processing time are handled for you."],
  ["Ghost Chair Rescue", "A cancellation opens a time; Chairvana texts the people on your waitlist a link to grab it."],
  ["Chair Memory", "Every client's history, notes, color formulas and photos, with the products each formula used."],
  ["Reminders that sound like you", "Confirmations, reminders and changes by text or email, never during quiet hours."],
  ["Forms and consent", "New-client, color consultation and patch-test forms, signed on a phone or the check-in tablet."],
  ["Sell, pay and know your numbers", "Retail, gift cards and packages; commission, tips and booth rent; reports you can download."],
];

const QUESTIONS = [
  ["How much does it cost?", "Chairvana is in early access while we finish testing. Salons are approved one at a time, and we'll tell you any price before you're ever charged."],
  ["Who owns my client list?", "You do. Each salon keeps its own client records, notes and formulas, and you can ask for a copy at any time."],
  ["Can my clients book without an app?", "Yes. Your booking page works in any browser. Clients can also make a free account to see all their appointments in one place."],
  ["Does it work on Android?", "Yes, in Chrome today, and you can add it to your home screen. A Google Play app is coming."],
  ["What about texting rules?", "Clients only get texts if they agree, and every text says how to stop. See our texting terms."],
];

export default function Home() {
  return (
    <div className="brand-dark min-h-dvh">
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
        <Link href="/" className="flex items-center gap-3" aria-label="Chairvana home">
          <img src="/brand/mark-ivory.png" alt="" width={327} height={305} className="h-8 w-auto" />
          <span className="font-wordmark text-sm tracking-[0.3em]">CHAIRVANA</span>
        </Link>
        <nav aria-label="Main" className="flex flex-wrap items-center gap-1 text-sm">
          <a href="#owners" className="rounded-full px-3 py-2 text-muted hover:text-foreground">For salons</a>
          <a href="#clients" className="rounded-full px-3 py-2 text-muted hover:text-foreground">For clients</a>
          <a href="#questions" className="rounded-full px-3 py-2 text-muted hover:text-foreground">Questions</a>
          <Link href="/app" className="rounded-full border border-line px-4 py-2 hover:bg-surface">Sign in</Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-6 text-center" aria-labelledby="hero-title">
          <div className="mx-auto w-full max-w-md">
            <TideMark />
          </div>
          <h1 id="hero-title" className="mt-2 font-wordmark text-3xl tracking-[0.34em] pl-[0.34em] sm:text-5xl">CHAIRVANA</h1>
          <p className="mt-3 font-display text-xl italic text-muted sm:text-2xl">Where your schedule finds its flow.</p>
          <p className="mx-auto mt-4 max-w-xl text-base text-muted">Calm, beautiful booking and salon management for owners and independent stylists, and a spa-like way for clients to book.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/join" className="rounded-full bg-foreground px-6 py-3 text-sm font-semibold uppercase tracking-wider text-background">List your salon</Link>
            <Link href="/find" className="rounded-full border border-line px-6 py-3 text-sm font-semibold uppercase tracking-wider hover:bg-surface">Book an appointment</Link>
          </div>
        </section>

        <section id="owners" className="border-t border-line bg-surface/40 py-16" aria-labelledby="owners-title">
          <div className="mx-auto max-w-6xl px-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-water">For salon owners and stylists</p>
            <h2 id="owners-title" className="mt-2 font-display text-4xl">Full chairs. Quiet mind.</h2>
            <p className="mt-2 max-w-2xl text-muted">Everything a salon runs on, in one calm place, from the first online booking to checkout and payday.</p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {OWNER.map(([t, d]) => (
                <article key={t} className="rounded-2xl border border-line bg-surface p-5">
                  <h3 className="font-semibold">{t}</h3>
                  <p className="mt-2 text-sm text-muted">{d}</p>
                </article>
              ))}
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/join" className="rounded-full bg-foreground px-6 py-3 text-sm font-semibold text-background">List your salon</Link>
              <Link href="/s/intensity-salon" className="rounded-full border border-line px-6 py-3 text-sm font-semibold hover:bg-surface">See a salon&rsquo;s booking page</Link>
            </div>
          </div>
        </section>

        <section id="clients" className="py-16" aria-labelledby="clients-title">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 md:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-water">For clients</p>
              <h2 id="clients-title" className="mt-2 font-display text-4xl">Book in a minute. See you in the chair.</h2>
              <ul className="mt-5 space-y-3 text-muted">
                <li><span className="text-foreground">Your stylist, your times.</span> Save your favorite services, days and times; openings show the moment you arrive.</li>
                <li><span className="text-foreground">All your salons in one place.</span> Change or cancel within the salon&rsquo;s policy, and see what&rsquo;s coming up.</li>
                <li><span className="text-foreground">Nearby openings.</span> When your stylist is booked, see who else nearby has your time.</li>
              </ul>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/find" className="rounded-full bg-water px-6 py-3 text-sm font-semibold text-[#0f0f11]">Find a salon</Link>
                <Link href="/signup" className="rounded-full border border-line px-6 py-3 text-sm font-semibold hover:bg-surface">Create an account</Link>
              </div>
            </div>
            <div className="rounded-3xl border border-line bg-surface p-6">
              <p className="text-[10px] uppercase tracking-[0.22em] text-water">Chairvana booking</p>
              <p className="mt-1 font-display text-2xl">Intensity Salon</p>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-muted">Service</dt><dd>All Over Color + Style</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Stylist</dt><dd>Karissa</dd></div>
                <div className="flex justify-between"><dt className="text-muted">When</dt><dd className="font-mono text-xs">Fri, Dec 4 · 10:30 AM</dd></div>
              </dl>
              <p className="mt-5 rounded-2xl border border-water/40 bg-water/10 px-4 py-3 text-center text-sm">You&rsquo;re all set. See you in the chair.</p>
            </div>
          </div>
        </section>

        <section id="questions" className="border-t border-line py-16" aria-labelledby="q-title">
          <div className="mx-auto max-w-3xl px-4">
            <h2 id="q-title" className="font-display text-4xl">Questions</h2>
            <div className="mt-6 divide-y divide-line">
              {QUESTIONS.map(([q, a]) => (
                <details key={q} className="group py-4">
                  <summary className="cursor-pointer list-none font-semibold">
                    <span className="mr-2 inline-block text-water transition group-open:rotate-45">+</span>
                    {q}
                  </summary>
                  <p className="mt-2 pl-6 text-muted">
                    {a}
                    {q.startsWith("What about texting") && (
                      <>
                        {" "}
                        <Link href="/texting" className="underline">Texting terms</Link>.
                      </>
                    )}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-line py-16 text-center">
          <p className="font-display text-3xl italic">Where your schedule finds its flow.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/join" className="rounded-full bg-foreground px-6 py-3 text-sm font-semibold text-background">List your salon</Link>
            <Link href="/app" className="rounded-full border border-line px-6 py-3 text-sm font-semibold hover:bg-surface">Sign in</Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
