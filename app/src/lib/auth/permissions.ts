/**
 * Who can do what. Each role has defaults; the owner can switch individual
 * permissions on or off per role (businesses.role_permissions). The owner
 * always has everything, so a solo owner-operator never hits a locked door.
 */

export const PERMISSIONS = [
  { key: "calendar.all", group: "Calendar", label: "See and manage everyone's appointments", hint: "Off: only their own appointments" },
  { key: "booking.manage", group: "Calendar", label: "Book new appointments" },
  { key: "booking.change", group: "Calendar", label: "Move and cancel appointments" },
  { key: "booking.override", group: "Calendar", label: "Book outside working hours or double-book", hint: "Always asks to confirm first" },
  { key: "deposits.override", group: "Calendar", label: "Change or waive a deposit when booking", hint: "Only if the salon's deposit policy allows it" },
  { key: "checkout", group: "Calendar", label: "Check out, take payments and deposits" },
  { key: "pricing.adjust", group: "Calendar", label: "Lower prices and give discounts", hint: "Off: can raise a price, never lower it below the quote" },
  { key: "clients.view_all", group: "Clients", label: "See all clients", hint: "Off: only clients they've seen or are booked with" },
  { key: "clients.edit", group: "Clients", label: "Add, edit and import clients" },
  { key: "clients.policy", group: "Clients", label: "Clear flags, deposit rules and balances" },
  { key: "formulas", group: "Clients", label: "See and add color formulas" },
  { key: "reports.view", group: "Business", label: "See reports and money totals" },
  { key: "sell", group: "Business", label: "Sell retail" },
  { key: "inventory.view", group: "Business", label: "See inventory" },
  { key: "inventory.manage", group: "Business", label: "Add and edit products" },
  { key: "inventory.count", group: "Business", label: "Count, receive and adjust stock" },
  { key: "inventory.order", group: "Business", label: "Reorder lists and supplier orders" },
  { key: "settings.salon", group: "Settings", label: "Edit the salon profile (address, about, public listing)" },
  { key: "settings.services", group: "Settings", label: "Edit services and prices" },
  { key: "settings.schedule", group: "Settings", label: "Edit hours, holidays and days off" },
  { key: "settings.payments", group: "Settings", label: "Edit payment methods and policies (deposits, fees, cancellations)" },
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

/**
 * Newer, finer permissions follow the one they were split from unless they are
 * set on their own, so splitting them never quietly takes access away.
 */
export const FOLLOWS: Partial<Record<Permission, Permission>> = {
  "booking.change": "booking.manage",
  "booking.override": "booking.manage",
  "inventory.count": "inventory.manage",
  "inventory.order": "inventory.manage",
};

export const ROLE_DEFAULTS: Record<Role, Permission[]> = {
  owner: ALL,
  manager: ALL.filter((p) => p !== "team.manage" && p !== "settings.payments"),
  stylist: ["booking.manage", "deposits.override", "checkout", "pricing.adjust", "clients.view_all", "clients.edit", "formulas", "sell", "inventory.view"],
  front_desk: ["calendar.all", "booking.manage", "checkout", "clients.view_all", "clients.edit", "sell", "inventory.view"],
  renter: ["booking.manage", "deposits.override", "checkout", "pricing.adjust", "clients.edit", "formulas", "sell"],
};

export type Overrides = Partial<Record<Permission, boolean>>;
export type RoleOverrides = Partial<Record<Role, Overrides>>;

const isRole = (r: string): r is Role => r in ROLE_DEFAULTS;

/**
 * What someone can do: their role's defaults, the salon's changes for that
 * role, then changes just for them. Owners always have everything.
 */
export function permissionsFor(role: string, overrides: RoleOverrides | null | undefined, personal?: Overrides | null): Set<Permission> {
  if (!isRole(role)) return new Set();
  if (role === "owner") return new Set(ALL);
  const set = new Set(ROLE_DEFAULTS[role].filter((p) => !FOLLOWS[p]));
  const explicit = new Set<Permission>();
  for (const layer of [overrides?.[role] ?? {}, personal ?? {}]) {
    for (const [k, on] of Object.entries(layer)) {
      if (!ALL.includes(k as Permission) || typeof on !== "boolean") continue;
      explicit.add(k as Permission);
      if (on) set.add(k as Permission);
      else set.delete(k as Permission);
    }
  }
  for (const [child, parent] of Object.entries(FOLLOWS) as [Permission, Permission][]) {
    if (!explicit.has(child) && set.has(parent)) set.add(child);
  }
  // Managing or counting stock implies seeing it.
  if (set.has("inventory.manage") || set.has("inventory.count") || set.has("inventory.order")) set.add("inventory.view");
  return set;
}

/** Only keeps known permissions with true/false values. */
export function cleanPersonal(raw: unknown): Overrides {
  const out: Overrides = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (ALL.includes(k as Permission) && typeof v === "boolean") out[k as Permission] = v;
  return out;
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
  { href: "/app/front-desk", label: "Front desk", need: ["booking.manage", "calendar.all"] },
  { href: "/app/reports", label: "Reports", need: "reports.view" },
  { href: "/app/inventory", label: "Inventory", need: "inventory.view" },
  { href: "/app/sell", label: "Sell", need: "sell" },
  { href: "/app/settings/salon", label: "Salon", need: "settings.salon" },
  { href: "/app/dashboard", label: "Services", need: "settings.services" },
  { href: "/app/settings/schedule", label: "Schedule", need: "settings.schedule" },
  { href: "/app/settings/payments", label: "Payments", need: "settings.payments" },
  { href: "/app/settings/policies", label: "Policies", need: "settings.payments" },
  { href: "/app/settings/notifications", label: "Messages", need: "settings.messages" },
  { href: "/app/settings/forms", label: "Forms", need: "settings.messages" },
  { href: "/app/reviews", label: "Reviews", need: "settings.messages" },
  { href: "/app/marketing", label: "Marketing", need: "settings.salon" },
  { href: "/app/team", label: "Team", need: "team.manage" },
  { href: "/app/pay", label: "Pay" },
  { href: "/app/legend", label: "Color chart" },
];

export function navFor(perms: Set<Permission>) {
  return NAV.filter((n) => !n.need || (Array.isArray(n.need) ? n.need.some((p) => perms.has(p)) : perms.has(n.need)));
}
