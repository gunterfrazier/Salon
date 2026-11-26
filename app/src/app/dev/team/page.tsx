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
      salonHours={{ tue: ["09:00", "17:00"], wed: ["09:00", "17:00"], thu: ["09:00", "19:00"], fri: ["09:00", "17:00"], sat: ["08:00", "14:00"] }}
      services={[{ id: "s1", name: "Women's Cut", category: "Cut & Style" }, { id: "s2", name: "All Over Color", category: "Color Services" }]}
      members={[
        { id: "1", name: "Karissa Frazier", email: "owner@example.com", phone: null, role: "owner", active: true, joined: true, stylist: { bookable: true, title: "Owner · Color specialist", color: "#257de0", ownColor: null, hours: null, serviceIds: null } },
        { id: "2", name: "Sam Lee", email: "sam@example.com", phone: "(256) 555-0110", role: "stylist", active: true, joined: false, stylist: { bookable: true, title: "", color: "#f47230", ownColor: null, hours: { tue: ["10:00", "18:00"], thu: ["10:00", "18:00"] }, serviceIds: ["s1"] } },
        { id: "3", name: "Dana Cole", email: "dana@example.com", phone: null, role: "front_desk", active: false, joined: true, stylist: { bookable: false, title: "", color: null, ownColor: null, hours: null, serviceIds: null } },
      ]}
    />
  );
}
