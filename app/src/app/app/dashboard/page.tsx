import { redirect } from "next/navigation";

/** The old read-only services list; editing lives in Settings now. */
export default function OldServicesPage() {
  redirect("/app/settings/services");
}
