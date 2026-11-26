import Link from "next/link";
import SignupForm from "./SignupForm";

export const metadata = { title: "Create an account", description: "One account for booking with any salon on Chairvana." };

export default function SignupPage() {
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-3xl font-bold">Create an account</h1>
      <p className="mt-2 text-muted">One account for every salon you book with: your appointments, deposits and history in one place.</p>
      <SignupForm />
      <p className="mt-6 text-sm text-muted">Already have one? <Link href="/app/login" className="underline">Sign in</Link>. Own a salon? <Link href="/join" className="underline">List your salon</Link>.</p>
    </main>
  );
}
