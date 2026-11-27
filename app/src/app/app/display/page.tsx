import { redirect } from "next/navigation";

/** The old single TV display now lives under Screens (Front desk lists them). */
export default function DisplayPage() {
  redirect("/app/front-desk");
}
