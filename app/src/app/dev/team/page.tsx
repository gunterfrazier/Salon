import { notFound } from "next/navigation";
import TeamView from "@/app/team/TeamView";

/** Development-only preview of the Team page (404 in production). */
export const dynamic = "force-dynamic";

export default function DevTeam() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <TeamView
      me="1"
      isOwner
      salon="Intensity Salon"
      overrides={{ stylist: { "reports.view": true } }}
      members={[
        { id: "1", name: "Karissa Frazier", email: "owner@example.com", phone: null, role: "owner", active: true, joined: true },
        { id: "2", name: "Sam Lee", email: "sam@example.com", phone: "(256) 555-0110", role: "stylist", active: true, joined: false },
        { id: "3", name: "Dana Cole", email: "dana@example.com", phone: null, role: "front_desk", active: false, joined: true },
      ]}
    />
  );
}
