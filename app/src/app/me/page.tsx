import Link from "next/link";
import { redirect } from "next/navigation";
import { whoAmI } from "@/lib/auth/whoami";

export const metadata = { title: "My appointments" };
export const dynamic = "force-dynamic";

/** Client home. (The full client portal is built in the next step.) */
export default async function MePage() {
  const who = await whoAmI();
  if (who.kind === "staff") redirect("/today");
  if (who.kind !== "client") redirect("/login");
  return (
    <main className="mx-auto max-w-md space-y-4 px-4 py-8">
      <h1 className="text-2xl font-semibold">You&apos;re signed in</h1>
      <p className="text-muted">Your appointments will show here.</p>
      <div className="flex gap-2">
        <Link href="/book" className="rounded-lg bg-foreground px-4 py-2.5 font-semibold text-background">Book</Link>
        <Link href="/account" className="rounded-lg border border-line px-4 py-2.5">Account</Link>
      </div>
    </main>
  );
}
