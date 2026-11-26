/**
 * Who can do what. Each role has defaults; the owner can switch individual
 * permissions on or off per role (businesses.role_permissions). The owner
 * always has everything, so a solo owner-operator never hits a locked door.
 */

export const PERMISSIONS = [
  { key: "calendar.all", group: "Calendar", label: "See and manage everyone's appointments", hint: "Off: only their own appointments" },
  { key: "booking.manage", group: "Calendar", label: "Book, move and cancel appointments" },
  { key: "checkout", group: "Calendar", label: "Check out, take payments and deposits" },
  { key: "clients.view_all", group: "Clients", label: "See all clients", hint: "Off: only clients they've seen or are booked with" },
  { key: "clients.edit", group: "Clients", label: "Add, edit and import clients" },
  { key: "clients.policy", group: "Clients", label: "Clear flags, deposit rules and balances" },
  { key: "formulas", group: "Clients", label: "See and add color formulas" },
  { key: "reports.view", group: "Business", label: "See reports and money totals" },
  { key: "sell", group: "Business", label: "Sell retail" },
  { key: "inventory.view", group: "Business", label: "See inventory" },
  { key: "inventory.manage", group: "Business", label: "Add products, count, receive and reorder" },
  { key: "settings.salon", group: "Settings", label: "Edit the salon profile (address, about, public listing)" },
  { key: "settings.services", group: "Settings", label: "Edit services and prices" },
  { key: "settings.schedule", group: "Settings", label: "Edit hours, holidays and days off" },
  { key: "settings.payments", group: "Settings", label: "Edit payment methods" },
  { key: "settings.messages", group: "Settings", label: "Edit client messages and reminders" },
  { key: "team.manage", group: "Settings", label: "Invite team members and change their roles" },
] as const;

export type Permission = (typeof PERMISSIONS)[number]["key"];
export type Role = "owner" | "manager" | "stylist" | "renter" | "front_desk";

export const ROLES: { key: Role; label: string; description: string }[] = [
  { key: "owner", label: "Owner / Admin", description: "Everything, including setup and roles. Can't be limited." },
  { key: "manager", label: "Manager", description: "Runs the salon day to day." },
  { key: "stylist", label: "Stylist", description: "Their own book, clients and checkout." },
  { key: "front_desk", label: "Front desk", description: "Booking, check-in, checkout and retail for everyone." },
  { key: "renter", label: "Booth renter", description: "Their own book and clients; no salon money or settings." },
];

const ALL = PERMISSIONS.map((p) => p.key) as Permission[];

export const ROLE_DEFAULTS: Record<Role, Permission[]> = {
  owner: ALL,
  manager: ALL.filter((p) => p !== "team.manage" && p !== "settings.payments"),
  stylist: ["booking.manage", "checkout", "clients.view_all", "clients.edit", "formulas", "sell", "inventory.view"],
  front_desk: ["calendar.all", "booking.manage", "checkout", "clients.view_all", "clients.edit", "sell", "inventory.view"],
  renter: ["booking.manage", "checkout", "clients.edit", "formulas", "sell"],
};

export type RoleOverrides = Partial<Record<Role, Partial<Record<Permission, boolean>>>>;

const isRole = (r: string): r is Role => r in ROLE_DEFAULTS;

export function permissionsFor(role: string, overrides: RoleOverrides | null | undefined): Set<Permission> {
  if (!isRole(role)) return new Set();
  if (role === "owner") return new Set(ALL);
  const set = new Set(ROLE_DEFAULTS[role]);
  for (const [k, on] of Object.entries(overrides?.[role] ?? {})) {
    if (!ALL.includes(k as Permission)) continue;
    if (on) set.add(k as Permission);
    else set.delete(k as Permission);
  }
  // Managing stock implies seeing it.
  if (set.has("inventory.manage")) set.add("inventory.view");
  return set;
}

/** Only keeps known roles/permissions, and never stores anything for the owner. */
export function cleanOverrides(raw: unknown): RoleOverrides {
  const out: RoleOverrides = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [role, perms] of Object.entries(raw as Record<string, unknown>)) {
    if (!isRole(role) || role === "owner" || !perms || typeof perms !== "object") continue;
    const clean: Partial<Record<Permission, boolean>> = {};
    for (const [k, v] of Object.entries(perms as Record<string, unknown>)) if (ALL.includes(k as Permission) && typeof v === "boolean") clean[k as Permission] = v;
    out[role] = clean;
  }
  return out;
}

export const roleLabel = (r: string) => ROLES.find((x) => x.key === r)?.label ?? r;

/** Menu items and what each needs. */
export const NAV: { href: string; label: string; need?: Permission | Permission[] }[] = [
  { href: "/app/today", label: "Today" },
  { href: "/app/calendar", label: "Calendar" },
  { href: "/app/waitlist", label: "Waitlist", need: "booking.manage" },
  { href: "/app/clients", label: "Clients" },
  { href: "/app/reports", label: "Reports", need: "reports.view" },
  { href: "/app/inventory", label: "Inventory", need: "inventory.view" },
  { href: "/app/sell", label: "Sell", need: "sell" },
  { href: "/app/settings/salon", label: "Salon", need: "settings.salon" },
  { href: "/app/dashboard", label: "Services", need: "settings.services" },
  { href: "/app/settings/schedule", label: "Schedule", need: "settings.schedule" },
  { href: "/app/settings/payments", label: "Payments", need: "settings.payments" },
  { href: "/app/settings/notifications", label: "Messages", need: "settings.messages" },
  { href: "/app/settings/forms", label: "Forms", need: "settings.messages" },
  { href: "/app/team", label: "Team", need: "team.manage" },
  { href: "/app/legend", label: "Color chart" },
];

export function navFor(perms: Set<Permission>) {
  return NAV.filter((n) => !n.need || (Array.isArray(n.need) ? n.need.some((p) => perms.has(p)) : perms.has(n.need)));
}
