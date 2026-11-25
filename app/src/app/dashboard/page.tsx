import Link from "next/link";
import { redirect } from "next/navigation";
import { ensureBusinessFor } from "@/lib/setup/bootstrap";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

type Service = {
  id: string;
  name: string;
  price_type: string;
  price_cents: number;
  active_min: number;
  processing_min: number;
  finish_min: number;
  price_needs_review: boolean;
  sort: number;
};
type Category = { id: string; name: string; sort: number; services: Service[] };

const money = (c: number) => `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`;
const mins = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} hr${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`);

export default async function Dashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const businessId = await ensureBusinessFor(user);
  if (!businessId) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-xl font-bold">This account isn&rsquo;t set up yet</h1>
        <p className="mt-2 text-muted">{user.email} isn&rsquo;t on the owner list.</p>
        <div className="mt-6 flex justify-center">
          <SignOut />
        </div>
      </main>
    );
  }

  // Read back through row-level security, exactly as the app will.
  const [{ data: biz }, { data: cats, error }] = await Promise.all([
    supabase.from("businesses").select("name").eq("id", businessId).single(),
    supabase
      .from("service_categories")
      .select("id,name,sort,services(id,name,price_type,price_cents,active_min,processing_min,finish_min,price_needs_review,sort)")
      .eq("business_id", businessId)
      .order("sort"),
  ]);
  const categories = (cats ?? []) as Category[];
  const count = categories.reduce((n, c) => n + c.services.length, 0);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Chairvana</p>
          <h1 className="text-2xl font-bold">{biz?.name ?? "Your salon"}</h1>
          <p className="text-sm text-muted">Signed in as {user.email}</p>
        </div>
        <SignOut />
      </header>

      <nav className="mt-6 flex flex-wrap gap-2 text-sm">
        <Link className="rounded-lg border border-line bg-surface px-3 py-2" href="/settings/payments">
          Payments
        </Link>
        <Link className="rounded-lg border border-line bg-surface px-3 py-2" href="/legend">
          Color chart
        </Link>
      </nav>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Services ({count})</h2>
        {error && <p className="mt-2 text-sm text-red-700 dark:text-red-300">Couldn&rsquo;t load services: {error.message}</p>}
        <div className="mt-3 space-y-5">
          {categories.map((c) => (
            <div key={c.id}>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">{c.name}</h3>
              <ul className="mt-2 divide-y divide-line rounded-xl border border-line bg-surface">
                {[...c.services]
                  .sort((a, b) => a.sort - b.sort)
                  .map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                      <span>
                        {s.name}
                        {s.price_needs_review && (
                          <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                            price to review
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-sm text-muted tabular-nums">
                        {money(s.price_cents)}
                        {s.price_type === "starting_at" ? "+" : ""} · {mins(s.active_min + s.processing_min + s.finish_min)}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function SignOut() {
  return (
    <form action="/auth/signout" method="post">
      <button className="rounded-lg border-2 border-foreground px-3 py-1.5 text-sm font-semibold">Sign out</button>
    </form>
  );
}
