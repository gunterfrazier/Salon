import "server-only";
import { loadProducts } from "./inventory";
import { lineTitle } from "../inventory/stock";
import type { ClientProfileData } from "../clients/profile-types";
import type { getContext } from "../context";
import { MANUAL_METHODS } from "./calendar";
import { loadClientStates } from "./clients";
import { cleanFavorites } from "../booking/search";
import { visibleClientIds } from "./client-scope";

type Ctx = Awaited<ReturnType<typeof getContext>>;

export async function loadClientProfile(ctx: Ctx, clientId: string): Promise<ClientProfileData | null> {
  const { supabase, business } = ctx;
  const visible = await visibleClientIds(ctx);
  if (visible && !visible.has(clientId)) return null;
  const { data: c } = await supabase
    .from("clients")
    .select("id,first_name,last_name,phone,email,notes,prior_visit_count,sms_opt_in,quiet,source,created_at,deposit_override,deposit_override_cents,preferences")
    .eq("business_id", business.id)
    .eq("id", clientId)
    .maybeSingle();
  if (!c) return null;

  const [states, flags, balances, refunds, appts, formulas, services] = await Promise.all([
    loadClientStates(supabase, business.id, [clientId]),
    supabase.from("client_flags").select("id,clear_note,made_permanent_at").eq("client_id", clientId),
    supabase.from("balances").select("id,amount_cents,reason,created_at,settled_payment_id").eq("client_id", clientId).order("created_at", { ascending: false }),
    supabase.from("payments").select("id,amount_cents,note,created_at").eq("client_id", clientId).eq("kind", "refund").eq("status", "pending").order("created_at"),
    supabase
      .from("appointments")
      .select("id,start_at,status,cancel_reason,appointment_services(sort,price_quoted_cents,services(name)),payments(kind,amount_cents,status)")
      .eq("client_id", clientId)
      .order("start_at", { ascending: false })
      .limit(200),
    supabase.from("color_formulas").select("id,created_at,formula_text,developer,processing_min,notes,photo_paths").eq("client_id", clientId).order("created_at", { ascending: false }),
    supabase.from("services").select("id,name,sort,service_categories(name,sort)").eq("business_id", business.id).eq("archived", false),
  ]);
  for (const r of [flags, balances, refunds, appts, formulas, services]) if (r.error) throw new Error(r.error.message);

  // Inventory: products to pick from, and what each formula used.
  const products = await loadProducts(supabase, business.id);
  const byId = new Map(products.map((p) => [p.id, p]));
  const formulaIds = (formulas.data ?? []).map((f) => f.id as string);
  const { data: used } = formulaIds.length
    ? await supabase.from("stock_moves").select("formula_id,product_id,change,amount,unit").eq("reason", "used").in("formula_id", formulaIds)
    : { data: [] as { formula_id: string; product_id: string; change: number; amount: number | null; unit: string | null }[] };
  const usage = new Map<string, ClientProfileData["formulas"][number]["usage"]>();
  for (const m of used ?? []) {
    const p = byId.get(m.product_id);
    const list = usage.get(m.formula_id) ?? [];
    list.push({ productId: m.product_id, label: p ? `${lineTitle(p)} ${p.name}` : "Removed product", amount: m.amount === null ? null : Number(m.amount), unit: m.unit, containers: -Number(m.change), kind: p?.kind ?? "color" });
    usage.set(m.formula_id, list);
  }

  // Short-lived links for private photos.
  const allPaths = (formulas.data ?? []).flatMap((f) => (f.photo_paths as string[]) ?? []);
  const urls: Record<string, string | null> = {};
  if (allPaths.length) {
    const { data } = await supabase.storage.from("client-photos").createSignedUrls(allPaths, 3600);
    for (const s of data ?? []) if (s.path) urls[s.path] = s.signedUrl ?? null;
  }

  type ApptRow = {
    id: string; start_at: string; status: string; cancel_reason: string | null;
    appointment_services: { sort: number; price_quoted_cents: number; services: { name: string } | null }[];
    payments: { kind: string; amount_cents: number; status: string }[];
  };

  return {
    can: { edit: ctx.can("clients.edit"), policy: ctx.can("clients.policy"), formulas: ctx.can("formulas"), checkout: ctx.can("checkout") },
    timezone: business.timezone,
    policy: business.policy_settings,
    paymentMethods: MANUAL_METHODS,
    client: {
      id: c.id,
      firstName: c.first_name,
      lastName: c.last_name,
      phone: c.phone,
      email: c.email,
      notes: c.notes,
      priorVisitCount: c.prior_visit_count,
      smsOptIn: !!c.sms_opt_in,
      quiet: !!c.quiet,
      source: c.source,
      createdAt: c.created_at,
      depositOverride: c.deposit_override,
      depositOverrideCents: c.deposit_override_cents,
      favorites: cleanFavorites(c.preferences),
    },
    services: ((services.data ?? []) as unknown as { id: string; name: string; sort: number; service_categories: { name: string; sort: number } | null }[])
      .sort((a, b) => (a.service_categories?.sort ?? 99) - (b.service_categories?.sort ?? 99) || a.sort - b.sort)
      .map((s) => ({ id: s.id, name: s.name, category: s.service_categories?.name ?? "Other" })),
    state: states[clientId] ?? { onTimeVisits: [], priorVisitCount: c.prior_visit_count, flags: [], depositOverride: null, outstandingBalance: 0 },
    flagNotes: Object.fromEntries((flags.data ?? []).map((f) => [f.id, { clearNote: f.clear_note, madePermanentAt: f.made_permanent_at }])),
    balances: (balances.data ?? []).map((b) => ({ id: b.id, amount: b.amount_cents, reason: b.reason, createdAt: b.created_at, settled: !!b.settled_payment_id })),
    refundsOwed: (refunds.data ?? []).map((r) => ({ id: r.id, amount: -r.amount_cents, note: r.note, createdAt: r.created_at })),
    visits: ((appts.data ?? []) as unknown as ApptRow[]).map((a) => ({
      id: a.id,
      start: new Date(a.start_at).toISOString(),
      status: a.status,
      services: [...a.appointment_services].sort((x, y) => x.sort - y.sort).map((s) => s.services?.name ?? "Service"),
      total: a.appointment_services.reduce((s, l) => s + l.price_quoted_cents, 0),
      paid: a.payments.filter((p) => p.status === "succeeded" && p.kind !== "refund").reduce((s, p) => s + p.amount_cents, 0),
      cancelReason: a.cancel_reason,
    })),
    formulas: (formulas.data ?? []).map((f) => ({
      id: f.id,
      createdAt: f.created_at,
      formula: f.formula_text,
      developer: f.developer,
      processingMin: f.processing_min,
      notes: f.notes,
      photos: ((f.photo_paths as string[]) ?? []).map((p) => ({ path: p, url: urls[p] ?? null })),
      usage: usage.get(f.id) ?? [],
    })),
    products: products.map((p) => ({ id: p.id, label: `${lineTitle(p)} ${p.name}`, size: p.size, unit: p.unit, kind: p.kind, onHand: p.onHand })),
  };
}
