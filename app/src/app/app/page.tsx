import { redirect } from "next/navigation";
import { whoAmI } from "@/lib/auth/whoami";

export const dynamic = "force-dynamic";

/** Sends each person to their home: salon team → Today, clients → their page. */
export default async function Home() {
  const who = await whoAmI();
  if (who.kind === "staff") redirect("/app/today");
  if (who.kind === "customer") redirect("/app/me");
  if (who.kind === "none") redirect("/app/login?error=noaccess");
  redirect("/app/login");
}
