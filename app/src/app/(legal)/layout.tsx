import Link from "next/link";
import SiteFooter from "@/components/SiteFooter";
import { SITE } from "@/lib/site";

/** Shared look for the privacy, terms and texting pages. */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="mx-auto flex max-w-2xl items-center justify-between px-4 pt-6">
        <Link href="/" className="text-lg font-bold">{SITE.name}</Link>
        <Link href="/app/login" className="text-sm underline">Sign in</Link>
      </header>
      <main className="legal mx-auto max-w-2xl px-4 py-8 [&_h1]:text-3xl [&_h1]:font-bold [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_li]:mt-1 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6 [&_a]:underline">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
