import "server-only";
import { supabaseUrlOrNull } from "./supabase/env";

/** Public address of a file in the salon-media bucket. */
export function mediaUrl(path: string | null | undefined): string | null {
  const base = supabaseUrlOrNull();
  if (!path || !base) return null;
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/salon-media/${path.split("/").map(encodeURIComponent).join("/")}`;
}
