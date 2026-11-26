import Link from "next/link";

const LINKS = [
  { href: "/calendar", label: "Calendar" },
  { href: "/clients", label: "Clients" },
  { href: "/dashboard", label: "Services" },
  { href: "/settings/payments", label: "Payments" },
  { href: "/legend", label: "Color chart" },
] as const;

export function AppNav({ current, businessName }: { current: (typeof LINKS)[number]["href"]; businessName: string }) {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2">
        <div className="min-w-0">
          <p className="text-xs text-muted">Chairvana</p>
          <p className="truncate font-semibold">{businessName}</p>
        </div>
        <nav aria-label="Main" className="flex flex-wrap items-center gap-1 text-sm">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={l.href === current ? "page" : undefined}
              className={`rounded-lg px-3 py-2 ${l.href === current ? "bg-foreground font-semibold text-background" : "hover:bg-background"}`}
            >
              {l.label}
            </Link>
          ))}
          <form action="/auth/signout" method="post">
            <button className="rounded-lg px-3 py-2 text-muted hover:bg-background">Sign out</button>
          </form>
        </nav>
      </div>
    </header>
  );
}
