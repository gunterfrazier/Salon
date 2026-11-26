"use client";

import { useActionState, useState } from "react";
import { sendSignInLink, signInWithPassword, type LoginState } from "./actions";

const input = "w-full rounded-lg border border-line bg-surface px-3 py-3 text-base";

export default function LoginForm({ error }: { error?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(signInWithPassword, { status: "idle" });
  const [linkState, linkAction, linkPending] = useActionState<LoginState, FormData>(sendSignInLink, { status: "idle" });
  const [email, setEmail] = useState("");

  if (linkState.status === "sent") {
    return (
      <div className="rounded-xl border border-line bg-surface p-5" role="status">
        <p className="font-semibold">Check your email</p>
        <p className="mt-1 text-sm text-muted">
          If <strong className="text-foreground">{linkState.message}</strong> has an account, a sign-in link is on its way. Open it in this same browser (if your email app opens it somewhere else, copy the link into this browser instead).
        </p>
        <p className="mt-3 text-sm text-muted">Once you&apos;re in, set a password in <strong className="text-foreground">Account</strong> so next time you can sign in right here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <form action={action} className="space-y-3">
        <div>
          <label htmlFor="email" className="block text-sm font-semibold">Email</label>
          <input id="email" name="email" type="email" autoComplete="username" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={`${input} mt-1`} />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-semibold">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" className={`${input} mt-1`} />
        </div>
        {(state.status === "error" || error) && (
          <p className="text-sm text-red-700 dark:text-red-300" role="alert">{state.message ?? error}</p>
        )}
        <button type="submit" disabled={pending} className="w-full rounded-lg bg-foreground py-3 font-semibold text-background disabled:opacity-60">
          {pending ? "Signing in…" : "Sign in"}
        </button>
        <p className="text-xs text-muted">You&apos;ll stay signed in on this device until you sign out.</p>
      </form>

      <form action={linkAction} className="space-y-2 border-t border-line pt-5">
        <input type="hidden" name="email" value={email} />
        <p className="text-sm text-muted">No password yet, or forgot it?</p>
        {linkState.status === "error" && <p className="text-sm text-red-700 dark:text-red-300" role="alert">{linkState.message}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="submit" name="purpose" value="signin" disabled={linkPending} className="rounded-lg border border-line px-4 py-2.5 text-sm font-semibold disabled:opacity-60">
            {linkPending ? "Sending…" : "Email me a sign-in link"}
          </button>
          <button type="submit" name="purpose" value="reset" disabled={linkPending} className="rounded-lg px-2 py-2.5 text-sm underline disabled:opacity-60">
            Reset my password
          </button>
        </div>
      </form>
    </div>
  );
}
