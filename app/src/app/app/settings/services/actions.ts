"use server";

import { revalidatePath } from "next/cache";
import { denied, getContext, type Ctx } from "@/lib/context";
import { cleanGroupName, cleanOwn, cleanService, moveItem, offerChanges, uniqueKey, withOwn } from "@/lib/services/edit";

type Result = { ok: true } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function done() {
  revalidatePath("/app/settings/services");
  revalidatePath("/app/calendar");
  revalidatePath("/app/team");
}

async function editor(): Promise<Ctx | Result> {
  const ctx = await getContext();
  return denied(ctx, "settings.services") ?? ctx;
}
const isCtx = (x: Ctx | Result): x is Ctx => "business" in x;

/** Save the stylists who offer a service (their staff.service_ids lists). */
async function saveOfferedBy(ctx: Ctx, serviceId: string, offeredBy: string[]): Promise<Result> {
  const [{ data: staff }, { data: svc }] = await Promise.all([
    ctx.supabase.from("staff").select("id,service_ids").eq("business_id", ctx.business.id).eq("active", true).eq("bookable", true).is("suspended_at", null),
    ctx.supabase.from("services").select("id").eq("business_id", ctx.business.id).eq("archived", false),
  ]);
  const stylists = (staff ?? []).map((s) => ({ id: s.id as string, serviceIds: (s.service_ids as string[] | null)?.length ? (s.service_ids as string[]) : null }));
  const all = (svc ?? []).map((s) => s.id as string);
  if (!all.includes(serviceId)) all.push(serviceId);
  for (const c of offerChanges(stylists, all, serviceId, offeredBy)) {
    if (c.serviceIds && c.serviceIds.length === 0) return { ok: false, error: "Each stylist needs at least one service. Give them another service in Team first." };
    const { error } = await ctx.supabase.from("staff").update({ service_ids: c.serviceIds }).eq("business_id", ctx.business.id).eq("id", c.id);
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** Add or edit a service. Saving also confirms a price that was marked "to review". */
export async function saveService(input: { id?: string | null; service: unknown; offeredBy: string[]; own?: unknown }): Promise<Result & { id?: string }> {
  const ctx = await editor();
  if (!isCtx(ctx)) return ctx;
  const clean = cleanService(input.service);
  if (!clean.ok) return clean;
  const v = clean.value;
  const { data: cat } = await ctx.supabase.from("service_categories").select("id").eq("business_id", ctx.business.id).eq("id", v.category_id).maybeSingle();
  if (!cat) return { ok: false, error: "That group no longer exists. Refresh and try again." };
  const offeredBy = Array.isArray(input.offeredBy) ? input.offeredBy.filter((x) => typeof x === "string" && UUID.test(x)) : [];
  const { data: biz } = await ctx.supabase.from("businesses").select("stylist_pricing").eq("id", ctx.business.id).single();
  const ownOn = !!biz?.stylist_pricing && input.own !== undefined;
  const own = ownOn ? cleanOwn(input.own, offeredBy) : null;
  if (own && !own.ok) return own;

  let id = input.id ?? null;
  if (id) {
    if (!UUID.test(id)) return { ok: false, error: "Refresh and try again." };
    const { data: old } = await ctx.supabase.from("services").select("category_id,sort").eq("business_id", ctx.business.id).eq("id", id).maybeSingle();
    if (!old) return { ok: false, error: "That service no longer exists. Refresh and try again." };
    const sort = old.category_id === v.category_id ? old.sort : await nextSort(ctx, v.category_id);
    const { error } = await ctx.supabase.from("services").update({ ...v, sort, price_needs_review: false }).eq("business_id", ctx.business.id).eq("id", id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { data: keys } = await ctx.supabase.from("services").select("key").eq("business_id", ctx.business.id);
    const key = uniqueKey(v.name, (keys ?? []).map((k) => k.key as string));
    const { data, error } = await ctx.supabase
      .from("services")
      .insert({ ...v, business_id: ctx.business.id, key, sort: await nextSort(ctx, v.category_id) })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    id = data.id as string;
  }
  const who = await saveOfferedBy(ctx, id, offeredBy);
  if (who.ok && own?.ok) {
    const saved = await saveOwnPrices(ctx, id, own.value);
    if (!saved.ok) {
      done();
      return { ok: false, error: `Saved the service, but not the stylists' own prices: ${saved.error}` };
    }
  }
  done();
  if (!who.ok) return { ok: false, error: `Saved the service, but not who offers it: ${who.error}` };
  return { ok: true, id };
}

/** Each stylist's own price and time for one service; stylists without an entry go back to the menu's. */
async function saveOwnPrices(ctx: Ctx, serviceId: string, own: Record<string, { price?: number; active?: number }>): Promise<Result> {
  const { data: staff } = await ctx.supabase.from("staff").select("id,service_prices").eq("business_id", ctx.business.id).eq("active", true);
  for (const st of staff ?? []) {
    const current = (st.service_prices ?? {}) as Record<string, unknown>;
    const next = withOwn(current, serviceId, own[st.id as string] ?? null);
    if (JSON.stringify(next) === JSON.stringify(current)) continue;
    const { error } = await ctx.supabase.from("staff").update({ service_prices: next }).eq("business_id", ctx.business.id).eq("id", st.id);
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** The salon's choice: can stylists have their own price and time for a service? Off keeps what was set, unused. */
export async function setStylistPricing(on: boolean): Promise<Result> {
  const ctx = await editor();
  if (!isCtx(ctx)) return ctx;
  const { error } = await ctx.supabase.from("businesses").update({ stylist_pricing: !!on }).eq("id", ctx.business.id);
  if (error) return { ok: false, error: error.message };
  done();
  revalidatePath("/book");
  return { ok: true };
}

async function nextSort(ctx: Ctx, categoryId: string) {
  const { data } = await ctx.supabase.from("services").select("sort").eq("business_id", ctx.business.id).eq("category_id", categoryId).order("sort", { ascending: false }).limit(1);
  return ((data?.[0]?.sort as number | undefined) ?? 0) + 10;
}

/** Archive hides a service from booking and the menu; past appointments keep it. Restore brings it back. */
export async function archiveService(id: string, archived: boolean): Promise<Result> {
  const ctx = await editor();
  if (!isCtx(ctx)) return ctx;
  if (!UUID.test(id)) return { ok: false, error: "Refresh and try again." };
  const { error } = await ctx.supabase.from("services").update({ archived: !!archived }).eq("business_id", ctx.business.id).eq("id", id);
  if (error) return { ok: false, error: error.message };
  done();
  return { ok: true };
}

/** Mark a starting-menu price as checked without changing anything else. */
export async function confirmPrice(id: string): Promise<Result> {
  const ctx = await editor();
  if (!isCtx(ctx)) return ctx;
  if (!UUID.test(id)) return { ok: false, error: "Refresh and try again." };
  const { error } = await ctx.supabase.from("services").update({ price_needs_review: false }).eq("business_id", ctx.business.id).eq("id", id);
  if (error) return { ok: false, error: error.message };
  done();
  return { ok: true };
}

/** Move a service up or down within its group (archived ones keep their place). */
export async function moveService(id: string, dir: -1 | 1): Promise<Result> {
  const ctx = await editor();
  if (!isCtx(ctx)) return ctx;
  const { data: me } = await ctx.supabase.from("services").select("category_id").eq("business_id", ctx.business.id).eq("id", id).maybeSingle();
  if (!me) return { ok: false, error: "Refresh and try again." };
  const { data: list } = await ctx.supabase.from("services").select("id").eq("business_id", ctx.business.id).eq("category_id", me.category_id).eq("archived", false).order("sort").order("name");
  const ids = (list ?? []).map((r) => r.id as string);
  return renumber(ctx, "services", moveItem(ids, ids.indexOf(id), dir === -1 ? -1 : 1));
}

async function renumber(ctx: Ctx, table: "services" | "service_categories", ids: string[]): Promise<Result> {
  for (const [i, id] of ids.entries()) {
    const { error } = await ctx.supabase.from(table).update({ sort: (i + 1) * 10 }).eq("business_id", ctx.business.id).eq("id", id);
    if (error) return { ok: false, error: error.message };
  }
  done();
  return { ok: true };
}

/** Add a group, or rename one. */
export async function saveGroup(id: string | null, name: string): Promise<Result & { id?: string }> {
  const ctx = await editor();
  if (!isCtx(ctx)) return ctx;
  const clean = cleanGroupName(name);
  if (!clean.ok) return clean;
  if (id) {
    if (!UUID.test(id)) return { ok: false, error: "Refresh and try again." };
    const { error } = await ctx.supabase.from("service_categories").update({ name: clean.name }).eq("business_id", ctx.business.id).eq("id", id);
    if (error) return { ok: false, error: error.message };
    done();
    return { ok: true, id };
  }
  const { data: cats } = await ctx.supabase.from("service_categories").select("key,sort").eq("business_id", ctx.business.id);
  const sort = Math.max(0, ...(cats ?? []).map((c) => c.sort as number)) + 10;
  const { data, error } = await ctx.supabase
    .from("service_categories")
    .insert({ business_id: ctx.business.id, name: clean.name, key: uniqueKey(clean.name, (cats ?? []).map((c) => c.key as string)), sort })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  done();
  return { ok: true, id: data.id as string };
}

export async function moveGroup(id: string, dir: -1 | 1): Promise<Result> {
  const ctx = await editor();
  if (!isCtx(ctx)) return ctx;
  const { data: list } = await ctx.supabase.from("service_categories").select("id").eq("business_id", ctx.business.id).order("sort").order("name");
  const ids = (list ?? []).map((r) => r.id as string);
  if (!ids.includes(id)) return { ok: false, error: "Refresh and try again." };
  return renumber(ctx, "service_categories", moveItem(ids, ids.indexOf(id), dir === -1 ? -1 : 1));
}

/** Only an empty group can be deleted (archived services still count: past appointments use them). */
export async function deleteGroup(id: string): Promise<Result> {
  const ctx = await editor();
  if (!isCtx(ctx)) return ctx;
  if (!UUID.test(id)) return { ok: false, error: "Refresh and try again." };
  const { count } = await ctx.supabase.from("services").select("id", { count: "exact", head: true }).eq("business_id", ctx.business.id).eq("category_id", id);
  if (count) return { ok: false, error: "Move this group's services to another group first (archived ones too)." };
  const { error } = await ctx.supabase.from("service_categories").delete().eq("business_id", ctx.business.id).eq("id", id);
  if (error) return { ok: false, error: error.message };
  done();
  return { ok: true };
}
