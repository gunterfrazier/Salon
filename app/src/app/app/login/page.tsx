import Link from "next/link";
import { BrandLogo } from "@/components/Brand";
import SiteFooter from "@/components/SiteFooter";
import LoginForm from "./LoginForm";

export const metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  link: "That sign-in link has expired or was already used. Request a new one.",
  noaccess: "That account isn't on the salon team or linked to a client yet. Ask the salon to add your email, then try again.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <>
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <Link href="/" className="mx-auto" aria-label="Chairvana home">
        <BrandLogo className="h-auto w-48" alt="" />
      </Link>
      <h1 className="sr-only">Sign in to Chairvana</h1>
      <p className="mt-3 mb-8 text-center font-display text-lg italic text-muted">Where your schedule finds its flow.</p>
      <LoginForm error={error ? ERRORS[error] ?? ERRORS.link : undefined} />
      <p className="mt-8 text-center text-sm text-muted">
        New here? <Link href="/signup" className="underline">Create an account</Link> or <Link href="/find" className="underline">find a salon</Link>. Own a salon? <Link href="/join" className="underline">List it</Link>.
      </p>
    </main>
      <SiteFooter />
    </>
  );
}
