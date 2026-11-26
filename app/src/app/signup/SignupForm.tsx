"use client";

import { useActionState } from "react";
import { signUp, type SignupState } from "./actions";

const input = "mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-base";

export default function SignupForm() {
  const [state, action, pending] = useActionState<SignupState, FormData>(signUp, { status: "idle" });
  if (state.status === "sent") {
    return (
      <div role="status" className="mt-6 rounded-xl border border-line bg-surface p-5">
        <p className="font-semibold">Check your email</p>
        <p className="mt-1 text-sm text-muted">We sent a sign-in link to <strong className="text-foreground">{state.message}</strong>. Open it in this browser, then set a password so next time you can sign in right away.</p>
      </div>
    );
  }
  return (
    <form action={action} className="mt-6 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="text-sm font-medium">First name<input name="first" required autoComplete="given-name" className={input} /></label>
        <label className="text-sm font-medium">Last name<input name="last" autoComplete="family-name" className={input} /></label>
      </div>
      <label className="block text-sm font-medium">Email<input name="email" type="email" required autoComplete="email" className={input} /></label>
      <label className="block text-sm font-medium">Mobile (optional)<input name="phone" inputMode="tel" autoComplete="tel" className={input} /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="texts" className="h-4 w-4" /> Text me appointment reminders</label>
      <label className="block text-sm font-medium">ZIP or City, ST (to find salons near you)<input name="zip" className={input} placeholder="36280" /></label>
      <input name="company" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      {state.status === "error" && <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">{state.message}</p>}
      <button disabled={pending} className="w-full rounded-lg bg-foreground py-3 font-semibold text-background disabled:opacity-60">{pending ? "Creating…" : "Create account"}</button>
    </form>
  );
}
