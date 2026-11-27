import { notFound } from "next/navigation";
import LicensesView, { type LicenseCard } from "@/app/app/licenses/LicensesView";
import { daysLeft, licenseStatus, lookupLink } from "@/lib/licenses/rules";

/** Development-only preview of Licenses with sample data (404 in production). */
export default function DevLicenses() {
  if (process.env.NODE_ENV === "production") notFound();
  const today = "2026-11-27";
  const c = (id: string, kind: string, number: string, expiresOn: string | null, confirmed = false): LicenseCard => ({
    id, kind, state: "AL", number, holderName: "Karissa Frazier", expiresOn, hasFile: true,
    status: licenseStatus(expiresOn, today), daysLeft: expiresOn ? daysLeft(expiresOn, today) : null,
    confirmed: confirmed ? { at: "2026-11-01T00:00:00Z", note: null } : null, lookup: lookupLink("AL", kind),
  });
  return (
    <LicensesView
      salon="Intensity Salon"
      mine={[c("1", "cosmetology", "C-12345", "2026-12-27", true)]}
      salonLicenses={[]}
      canEditSalon
      manage
      blockExpired={false}
      team={[
        { id: "a", name: "Jordan Lee", role: "Stylist", joined: true, suspended: false, licenses: [c("2", "cosmetology", "C-77881", "2026-10-31")] },
        { id: "b", name: "Riley Park", role: "Booth renter", joined: true, suspended: false, licenses: [] },
        { id: "c", name: "Avery Cole", role: "Stylist", joined: true, suspended: false, licenses: [c("3", "barber", "B-4410", "2028-03-31")] },
      ]}
    />
  );
}
