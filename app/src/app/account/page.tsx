import Link from "next/link";
import { redirect } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { whoAmI } from "@/lib/auth/whoami";
import { createAdminClient } from "@/lib/supabase/admin";
import { signOutEverywhere } from "./actions";
import PasswordForm from "./PasswordForm";

export const metadata = { title: "Account" };
export const dynamic = "force-dynamic";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  const who = await whoAmI();
  if (who.kind === "signed_out") redirect("/login");
  const user = who.user;
  const hasPassword = user.user_metadata?.has_password === true;
  let businessName = "";
  if (who.kind === "staff") {
    const { data: b } = await createAdminClient().from("businesses").select("name").eq("id", who.businessId).single();
    businessName = b?.name ?? "";
  }
  return (
    <>
      {who.kind === "staff" ? (
        <AppNav current="/account" businessName={businessName} />
      ) : (
        <header className="border-b border-line bg-surface">
          <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
            <span className="font-semibold">Chairvana</span>
            {who.kind === "client" && <Link href="/me" className="text-sm underline">My appointments</Link>}
          </div>
        </header>
      )}
      <main className="mx-auto max-w-md space-y-6 px-4 py-6">
        <div>
          <h1 className="text-2xl font-semibold">Account</h1>
          <p className="text-sm text-muted">Signed in as {user.email}</p>
        </div>
        <section className="rounded-xl border border-line bg-surface p-4">
          <PasswordForm hasPassword={hasPassword} reset={(await searchParams).reset === "1"} />
        </section>
        <section className="flex flex-wrap gap-2">
          <form action="/auth/signout" method="post">
            <button className="rounded-lg border border-line px-4 py-2.5 text-sm">Sign out</button>
          </form>
          <form action={signOutEverywhere}>
            <button className="rounded-lg px-2 py-2.5 text-sm underline">Sign out on all devices</button>
          </form>
        </section>
      </main>
    </>
  );
}
