import "server-only";
import { cookies } from "next/headers";
import { createAdminClient } from "../supabase/admin";
import { DEVICE_COOKIE, sha256 } from "./pairing";

export interface PairedDevice {
  id: string;
  businessId: string;
  screenId: string;
  name: string;
}

/** The TV this request comes from, if it has been paired (and not removed since). */
export async function pairedDevice(): Promise<PairedDevice | null> {
  const key = (await cookies()).get(DEVICE_COOKIE)?.value;
  if (!key || !/^[0-9a-f]{64}$/.test(key)) return null;
  const { data } = await createAdminClient().from("screen_devices").select("id,business_id,screen_id,name").eq("key_hash", await sha256(key)).maybeSingle();
  return data ? { id: data.id, businessId: data.business_id, screenId: data.screen_id, name: data.name } : null;
}
