import Link from "next/link";
import { navFor, roleLabel } from "@/lib/auth/permissions";
import { getContext } from "@/lib/context";
import { isPlatformAdmin } from "@/lib/platform/salons";

/** Main menu: shows only what the signed-in team member's role allows. */
export async function AppNav({ current, businessName }: { current: string; businessName: string }) {
  const ctx = await getContext();
  const links = [...navFor(ctx.perms), ...(isPlatformAdmin(ctx.user.email) ? [{ href: "/admin", label: "Platform" }] : [])];
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2">
        <div className="min-w-0">
          <p className="text-xs text-muted">
            Chairvana{ctx.staff.role !== "owner" ? ` · ${ctx.staff.display_name} (${roleLabel(ctx.staff.role)})` : ""}
          </p>
          <p className="truncate font-semibold">{businessName}</p>
        </div>
        <nav aria-label="Main" className="flex flex-wrap items-center gap-1 text-sm">
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
          <Link href="/account" aria-current={current === "/account" ? "page" : undefined} className={`rounded-lg px-3 py-2 ${current === "/account" ? "bg-foreground font-semibold text-background" : "text-muted hover:bg-background"}`}>
            Account
          </Link>
        </nav>
      </div>
    </header>
  );
}
