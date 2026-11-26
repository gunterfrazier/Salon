import Link from "next/link";
import { SITE } from "@/lib/site";

/** Footer for public pages: legal links and contact. */
export default function SiteFooter() {
  return (
    <footer className="mx-auto mt-10 max-w-2xl border-t border-line px-4 py-6 text-sm text-muted">
      <nav className="flex flex-wrap gap-x-4 gap-y-2">
        <Link href="/find" className="hover:underline">Find a salon</Link>
        <Link href="/join" className="hover:underline">List your salon</Link>
        <Link href="/privacy" className="hover:underline">Privacy</Link>
        <Link href="/terms" className="hover:underline">Terms</Link>
        <Link href="/texting" className="hover:underline">Texting terms</Link>
        <a href={`mailto:${SITE.contactEmail}`} className="hover:underline">{SITE.contactEmail}</a>
      </nav>
      <p className="mt-3">© {new Date().getFullYear()} {SITE.name}</p>
    </footer>
  );
}
