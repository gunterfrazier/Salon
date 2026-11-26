import LoginForm from "./LoginForm";

export const metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  link: "That sign-in link has expired or was already used. Request a new one.",
  noaccess: "That account isn't on the salon team or linked to a client yet. Ask the salon to add your email, then try again.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <h1 className="text-3xl font-bold">Chairvana</h1>
      <p className="mt-1 mb-8 text-muted">Calm days behind the chair.</p>
      <LoginForm error={error ? ERRORS[error] ?? ERRORS.link : undefined} />
      <p className="mt-8 text-center text-sm text-muted">
        New here? <a href="/signup" className="underline">Create an account</a> or <a href="/find" className="underline">find a salon</a>. Own a salon? <a href="/join" className="underline">List it</a>.
      </p>
    </main>
  );
}
