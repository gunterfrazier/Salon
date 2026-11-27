import Link from "next/link";
import { navFor, roleLabel } from "@/lib/auth/permissions";
import { getContext } from "@/lib/context";
import { isPlatformAdmin } from "@/lib/platform/salons";
import { BrandMark, Wordmark } from "./Brand";
import { TabBar, type Tab } from "./TabBar";

const TAB_ICON: Record<string, Tab["icon"]> = { "/app/today": "today", "/app/calendar": "calendar", "/app/clients": "clients", "/app/sell": "sell", "/app/waitlist": "waitlist" };

/** Main menu: shows only what the signed-in team member's role allows. */
export async function AppNav({ current, businessName }: { current: string; businessName: string }) {
  const ctx = await getContext();
  const links = [...navFor(ctx.perms), ...(isPlatformAdmin(ctx.user.email) ? [{ href: "/app/admin", label: "Platform" }] : [])];
  // Phones: four tabs at the bottom, everything else under More.
  const tabHrefs = ["/app/today", "/app/calendar", "/app/clients", links.some((l) => l.href === "/app/sell") ? "/app/sell" : "/app/waitlist"].filter((h) => links.some((l) => l.href === h));
  const tabs: Tab[] = tabHrefs.map((h) => ({ href: h, label: links.find((l) => l.href === h)!.label, icon: TAB_ICON[h] }));
  const more = [...links.filter((l) => !tabHrefs.includes(l.href)), { href: "/app/account", label: "Account" }];
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2">
        <Link href="/app" className="flex min-w-0 items-center gap-3" aria-label={`${businessName} on Chairvana: home`}>
          <BrandMark className="h-8 w-auto shrink-0" />
          <span className="min-w-0">
            <span className="block text-[10px] text-muted">
              <Wordmark className="text-[10px]" />
              {ctx.staff.role !== "owner" ? ` · ${ctx.staff.display_name} (${roleLabel(ctx.staff.role)})` : ""}
            </span>
            <span className="block truncate font-semibold">{businessName}</span>
          </span>
        </Link>
        <nav aria-label="Main" className="hidden flex-wrap items-center gap-1 text-sm sm:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={l.href === current ? "page" : undefined}
              className={`rounded-lg px-3 py-2 ${l.href === current ? "bg-foreground font-semibold text-background" : "hover:bg-background"}`}
            >
              {l.label}
            </Link>
          ))}
          <Link href="/app/account" aria-current={current === "/app/account" ? "page" : undefined} className={`rounded-lg px-3 py-2 ${current === "/app/account" ? "bg-foreground font-semibold text-background" : "text-muted hover:bg-background"}`}>
            Account
          </Link>
        </nav>
      </div>
      <TabBar tabs={tabs} more={more} current={current} />
    </header>
  );
}
