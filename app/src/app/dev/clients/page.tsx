import { notFound } from "next/navigation";
import ClientProfile from "@/app/clients/[id]/ClientProfile";
import ClientsList from "@/app/clients/ClientsList";
import type { ClientProfileData } from "@/lib/clients/profile-types";
import type { ClientSummary } from "@/lib/clients/summary";
import type { PolicySettings } from "@/lib/policy/types";
import policyJson from "../../../../seed/policies.json";

/** Development-only preview of the Clients screens with sample data (404 in production). */
export const dynamic = "force-dynamic";

const base: ClientSummary = { id: "", firstName: "", lastName: null, phone: null, email: null, lastVisit: null, nextVisit: null, visits: 4, balance: 0, standing: "clear", activeFlag: null };
const list: ClientSummary[] = [
  { ...base, id: "00000000-0000-0000-0000-000000000001", firstName: "Jamie", lastName: "Rivers", phone: "(256) 555-0101", lastVisit: "2026-11-10T21:00:00Z", nextVisit: "2026-12-08T21:30:00Z", standing: "active", activeFlag: "no_show", balance: 6250 },
  { ...base, id: "2", firstName: "Morgan", lastName: "Tate", phone: "(256) 555-0102", lastVisit: "2026-08-02T15:00:00Z" },
  { ...base, id: "3", firstName: "Taylor", lastName: "Shaw", email: "taylor@example.com", visits: 0 },
  { ...base, id: "4", firstName: "Riley", lastName: "Park", phone: "(256) 555-0104", lastVisit: "2026-11-21T14:00:00Z", standing: "history" },
];

const flagAt = "2026-10-20T20:30:00.000Z";
const profile: ClientProfileData = {
  timezone: "America/Chicago",
  policy: policyJson as unknown as PolicySettings,
  paymentMethods: [{ key: "cash", label: "Cash" }, { key: "venmo_direct", label: "Venmo" }, { key: "zelle", label: "Zelle" }],
  client: {
    id: "00000000-0000-0000-0000-000000000001", firstName: "Jamie", lastName: "Rivers", phone: "(256) 555-0101", email: "jamie@example.com",
    notes: "Prefers cooler tones. Sensitive scalp: use barrier cream.", priorVisitCount: 6, source: "styleseat_import", createdAt: "2024-03-02T15:00:00Z",
    depositOverride: "none", depositOverrideCents: null,
    favorites: { serviceIds: ["s1"], weekdays: [5], block: "morning" },
  },
  services: [{ id: "s1", name: "All Over Color", category: "Color Services" }, { id: "s2", name: "Women's Cut", category: "Cut & Style" }, { id: "s3", name: "Style", category: "Cut & Style" }],
  state: {
    onTimeVisits: ["2026-11-10T21:00:00.000Z"], priorVisitCount: 6, depositOverride: null, outstandingBalance: 6250,
    flags: [
      { id: "f1", type: "no_show", createdAt: flagAt, appointmentStart: flagAt, permanent: false, clearedAt: null, clearNote: null, feeCharged: 12500 },
      { id: "f0", type: "late_cancel", createdAt: "2025-05-01T15:00:00Z", appointmentStart: "2025-05-01T15:00:00Z", permanent: false, clearedAt: "2025-06-01T15:00:00Z", clearNote: "Family emergency", feeCharged: 0 },
    ],
  },
  flagNotes: { f1: { clearNote: null, madePermanentAt: null }, f0: { clearNote: "Family emergency", madePermanentAt: null } },
  balances: [{ id: "b1", amount: 6250, reason: "No-show fee", createdAt: flagAt, settled: false }],
  refundsOwed: [],
  visits: [
    { id: "v3", start: "2026-12-08T21:30:00Z", status: "booked", services: ["Full Highlights", "Women's Cut"], total: 15200, paid: 0, cancelReason: null },
    { id: "v2", start: "2026-11-10T21:00:00Z", status: "completed", services: ["Toner", "Style"], total: 6500, paid: 7800, cancelReason: null },
    { id: "v1", start: flagAt, status: "no_show", services: ["All Over Color"], total: 9500, paid: 0, cancelReason: "No-show" },
  ],
  formulas: [
    { id: "x1", createdAt: "2026-11-10T21:00:00Z", formula: "Roots: 6N + 6G (1:1)\nEnds: 8V gloss", developer: "20 vol", processingMin: 35, notes: "Came out a touch warm, add more V next time.", photos: [] },
  ],
};

export default async function DevClients({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { view } = await searchParams;
  return view === "profile" ? <ClientProfile data={profile} /> : <ClientsList clients={list} timezone="America/Chicago" />;
}
