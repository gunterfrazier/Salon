import { redirect } from "next/navigation";
import { whoAmI } from "@/lib/auth/whoami";

export const dynamic = "force-dynamic";

/** Sends each person to their home: salon team → Today, clients → their page. */
export default async function Home() {
  const who = await whoAmI();
  if (who.kind === "staff") redirect("/today");
  if (who.kind === "customer") redirect("/me");
  if (who.kind === "none") redirect("/login?error=noaccess");
  redirect("/login");
}
