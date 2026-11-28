"use server";

import { cancelFromOffer, rebookFromOffer } from "@/lib/sick/server";

export async function pickTime(token: string, staffId: string, start: string) {
  return rebookFromOffer(String(token), String(staffId), String(start));
}

export async function cancelVisit(token: string) {
  return cancelFromOffer(String(token));
}
