import { bookableDates } from "@/lib/booking/availability";
import { loadClosedChecker, loadPublicBusiness, loadPublicServices } from "@/lib/data/public-booking";
import { policyText } from "@/lib/policy/text";
import { todayIn } from "@/lib/time/zone";
import BookingWizard from "./BookingWizard";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const b = await loadPublicBusiness();
  return { title: b ? `Book with ${b.name}` : "Book online" };
}

export default async function BookPage() {
  const b = await loadPublicBusiness();
  if (!b) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-xl font-bold">Online booking isn&rsquo;t open yet</h1>
      </main>
    );
  }
  const services = await loadPublicServices(b.id);
  return (
    <BookingWizard
      business={{ name: b.name, timezone: b.timezone, hours: b.hours, policy: b.policy, rules: b.rules }}
      services={services}
      dates={bookableDates(todayIn(b.timezone), b.hours, b.settings, await loadClosedChecker(b))}
      policyLines={policyText(b.policy)}
    />
  );
}
