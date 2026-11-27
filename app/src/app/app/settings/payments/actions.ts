"use server";

import { revalidatePath } from "next/cache";
import { denied, getContext } from "@/lib/context";
import { validateHandle } from "@/lib/payments/methods";
import { mergeMethods, NOT_YET_AVAILABLE, SEED_METHODS } from "@/lib/payments/settings";

export async function savePaymentMethod(key: string, patch: { enabled?: boolean; handle?: string }): Promise<{ ok: true; handle?: string } | { ok: false; error: string }> {
  const seed = SEED_METHODS.find((m) => m.key === key);
  if (!seed) return { ok: false, error: "Unknown payment method." };
  if (NOT_YET_AVAILABLE.has(key) && patch.enabled) return { ok: false, error: `${seed.label} isn't connected yet.` };

  const ctx = await getContext();

  const no = denied(ctx, "settings.payments");

  if (no) return no;
  const methods = mergeMethods(ctx.business.payment_methods);
  const current = methods.find((m) => m.key === key)!;
  let handle = current.handle ?? "";

  if (patch.handle !== undefined) {
    if (seed.setup !== "handle") return { ok: false, error: "This method doesn't use a handle." };
    if (patch.handle.trim() === "") handle = "";
    else {
      const v = validateHandle(key, patch.handle);
      if (!v.ok) return { ok: false, error: v.error };
      handle = v.value;
    }
  }
  const enabled = patch.enabled ?? current.enabled;
  if (enabled && seed.setup === "handle" && !handle) return { ok: false, error: `Add your ${seed.label} details before switching it on.` };

  const next = methods.map((m) => (m.key === key ? { ...m, enabled: handle || seed.setup !== "handle" ? enabled : false, handle } : m));
  const { error } = await ctx.supabase
    .from("businesses")
    .update({ payment_methods: { methods: next.map(({ key: k, enabled: e, handle: h }) => ({ key: k, enabled: e, handle: h })) } })
    .eq("id", ctx.business.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/app/settings/payments");
  return { ok: true, handle };
}

