import Link from "next/link";
import { MoreMenu } from "./MoreMenu";

/** Simple line icons (24×24, currentColor). */
export function Icon({ name, className = "size-6" }: { name: "today" | "calendar" | "clients" | "sell" | "more" | "home" | "search" | "account" | "waitlist" | "book"; className?: string }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      {name === "today" && (
        <g {...p}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
        </g>
      )}
      {name === "calendar" && (
        <g {...p}>
          <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
          <path d="M3.5 10h17M8 3v4M16 3v4" />
        </g>
      )}
      {name === "clients" && (
        <g {...p}>
          <circle cx="9" cy="8.5" r="3.5" />
          <path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5" />
          <path d="M16 5.2a3.3 3.3 0 0 1 0 6.6M18.2 14.8c1.7.8 2.9 2.5 3.3 5.2" />
        </g>
      )}
      {name === "sell" && (
        <g {...p}>
          <path d="M4 8.5h16l-1.3 11.2a1.5 1.5 0 0 1-1.5 1.3H6.8a1.5 1.5 0 0 1-1.5-1.3z" />
          <path d="M8.5 8.5V7a3.5 3.5 0 0 1 7 0v1.5" />
        </g>
      )}
      {name === "waitlist" && (
        <g {...p}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5V12l3 2" />
        </g>
      )}
      {name === "more" && (
        <g {...p}>
          <path d="M4 7h16M4 12h16M4 17h16" />
        </g>
      )}
      {name === "home" && (
        <g {...p}>
          <path d="M3.5 10.5 12 4l8.5 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-4v-6h-6v6H5A1.5 1.5 0 0 1 3.5 19z" />
        </g>
      )}
      {name === "search" && (
        <g {...p}>
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m15.5 15.5 5 5" />
        </g>
      )}
      {name === "book" && (
        <g {...p}>
          <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
          <path d="M3.5 10h17M8 3v4M16 3v4M9 15l2 2 4-4" />
        </g>
      )}
      {name === "account" && (
        <g {...p}>
          <circle cx="12" cy="8.5" r="4" />
          <path d="M4 20.5c1-4 4.2-6 8-6s7 2 8 6" />
        </g>
      )}
    </svg>
  );
}

export type Tab = { href: string; label: string; icon: Parameters<typeof Icon>[0]["name"] };

/**
 * Bottom tab bar on phones (hidden from the small-tablet width up), like most
 * booking apps. `more` items open in a sheet above the bar.
 */
export function TabBar({ tabs, current, more = [], label = "Main" }: { tabs: Tab[]; current: string; more?: { href: string; label: string }[]; label?: string }) {
  const active = (href: string) => current === href || (href !== "/app" && current.startsWith(`${href}/`));
  const moreActive = more.some((m) => active(m.href));
  const item = "flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px]";
  return (
    <>
      <nav aria-label={label} className="tabbar fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
        <div className="mx-auto flex max-w-lg items-stretch gap-1 px-2 pt-1.5 pb-1.5">
          {tabs.map((t) => (
            <Link key={t.href} href={t.href} aria-current={active(t.href) ? "page" : undefined} className={`${item} ${active(t.href) ? "font-semibold text-foreground" : "text-muted"}`}>
              <span className={`flex h-7 w-12 items-center justify-center rounded-full ${active(t.href) ? "bg-accent/20" : ""}`}>
                <Icon name={t.icon} className="size-[22px]" />
              </span>
              {t.label}
            </Link>
          ))}
          {more.length > 0 && (
            <MoreMenu
              className="group relative flex flex-1"
              summary={
              <summary className={`${item} cursor-pointer list-none ${moreActive ? "font-semibold text-foreground" : "text-muted"}`}>
                <span className={`flex h-7 w-12 items-center justify-center rounded-full ${moreActive ? "bg-accent/20" : ""}`}>
                  <Icon name="more" className="size-[22px]" />
                </span>
                More
              </summary>
              }
            >
              <div className="absolute bottom-full right-0 mb-2 w-56 overflow-hidden rounded-2xl border border-line bg-surface shadow-xl">
                {more.map((m) => (
                  <Link key={m.href} href={m.href} aria-current={active(m.href) ? "page" : undefined} className={`block px-4 py-3 text-sm ${active(m.href) ? "bg-background font-semibold" : "hover:bg-background"}`}>
                    {m.label}
                  </Link>
                ))}
              </div>
            </MoreMenu>
          )}
        </div>
      </nav>
    </>
  );
}

/** Tabs for signed-in clients. */
export function ClientTabs({ current, bookHref = "/find" }: { current: string; bookHref?: string }) {
  return (
    <TabBar
      label="Client"
      current={current}
      tabs={[
        { href: "/app/me", label: "Home", icon: "home" },
        { href: bookHref, label: "Book", icon: "book" },
        { href: "/find", label: "Explore", icon: "search" },
        { href: "/app/account", label: "Account", icon: "account" },
      ]}
    />
  );
}
