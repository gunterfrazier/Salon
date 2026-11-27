import SiteFooter from "@/components/SiteFooter";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import SignupForm from "./SignupForm";
import StylistForm from "./StylistForm";

export const metadata = { title: "Create an account", description: "Book with any salon on Chairvana, or run your own book as a stylist." };

async function signedIn() {
  try {
    const { data } = await (await createClient()).auth.getClaims();
    return Boolean(data?.claims);
  } catch {
    return false;
  }
}

const TABS = [
  { key: "client", label: "I book appointments" },
  { key: "stylist", label: "I'm a stylist" },
  { key: "owner", label: "I own a salon" },
] as const;

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ as?: string; code?: string }> }) {
  const sp = await searchParams;
  const code = sp.code?.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12) || null;
  // Scanned a salon's join QR code while signed in: join straight away.
  if (code && (await signedIn())) redirect(`/app/join-salon?code=${code}`);
  const as = code ? "stylist" : sp.as === "stylist" ? "stylist" : "client";
  return (
    <>
      <main className="mx-auto max-w-md px-4 py-10">
        <h1 className="text-3xl font-bold">Create an account</h1>
        <nav aria-label="Account type" className="mt-4 grid grid-cols-3 gap-1 rounded-xl border border-line bg-surface p-1 text-center text-sm">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={t.key === "owner" ? "/join" : t.key === "stylist" ? `/signup?as=stylist${code ? `&code=${code}` : ""}` : "/signup"}
              aria-current={as === t.key ? "page" : undefined}
              className={`rounded-lg px-2 py-2 ${as === t.key ? "bg-foreground font-semibold text-background" : "text-muted hover:text-foreground"}`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        {as === "stylist" ? (
          <>
            <p className="mt-4 text-muted">Your own book from day one: clients, calendar, reminders and payments. Join a salon&rsquo;s team whenever you&rsquo;re ready.</p>
            <StylistForm code={code} />
          </>
        ) : (
          <>
            <p className="mt-4 text-muted">One account for every salon you book with: your appointments, deposits and history in one place.</p>
            <SignupForm />
          </>
        )}
        <p className="mt-6 text-sm text-muted">Already have one? <Link href="/app/login" className="underline">Sign in</Link>. Own a salon with a team? <Link href="/join" className="underline">List your salon</Link>.</p>
      </main>
      <SiteFooter />
    </>
  );
}
