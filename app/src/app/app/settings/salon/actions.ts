"use server";

import { revalidatePath } from "next/cache";
import { denied, getContext } from "@/lib/context";
import { locateAddress, slugify } from "@/lib/geo";

export interface SalonFields {
  name: string;
  slug: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  about: string;
  listed: boolean;
}

const RESERVED = new Set(["admin", "api", "app", "book", "find", "join", "signup", "login", "me", "s", "settings", "new"]);

export async function saveSalonProfile(f: SalonFields): Promise<{ ok: true; located: boolean; slug: string } | { ok: false; error: string }> {
  const ctx = await getContext();
  const no = denied(ctx, "settings.salon");
  if (no) return no;
  const name = f.name.trim().slice(0, 80);
  if (!name) return { ok: false, error: "Enter the salon's name." };
  const slug = slugify(f.slug || name);
  if (slug.length < 3 || RESERVED.has(slug)) return { ok: false, error: "Pick a different web address (3+ letters)." };
  const state = f.state.trim().toUpperCase().slice(0, 2);
  const zip = f.zip.trim().slice(0, 10);
  if (zip && !/^\d{5}(-\d{4})?$/.test(zip)) return { ok: false, error: "ZIP should look like 36280." };
  if (state && !/^[A-Z]{2}$/.test(state)) return { ok: false, error: "State should be two letters, like AL." };
  const addr = { street: f.street.trim().slice(0, 120), city: f.city.trim().slice(0, 60), state, zip };

  const { data: taken } = await ctx.supabase.from("businesses").select("id").eq("slug", slug).neq("id", ctx.business.id).limit(1);
  if (taken?.length) return { ok: false, error: "That web address is taken. Try another." };

  const point = addr.zip || (addr.city && addr.state) ? await locateAddress(addr) : null;
  const { error } = await ctx.supabase
    .from("businesses")
    .update({ name, slug, ...addr, phone: f.phone.trim().slice(0, 40) || null, about: f.about.trim().slice(0, 1500) || null, listed: !!f.listed, lat: point?.lat ?? null, lng: point?.lng ?? null })
    .eq("id", ctx.business.id);
  if (error) return { ok: false, error: error.code === "23505" ? "That web address is taken. Try another." : error.message };
  revalidatePath("/app/settings/salon");
  revalidatePath(`/s/${slug}`);
  return { ok: true, located: !!point, slug };
}
