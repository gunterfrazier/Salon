"use client";

import { useActionState } from "react";
import { sendSignInLink, type LoginState } from "./actions";

export default function LoginForm({ error }: { error?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(sendSignInLink, { status: "idle" });

  if (state.status === "sent") {
    return (
      <div className="rounded-xl border border-line bg-surface p-5" role="status">
        <p className="font-semibold">Check your email</p>
        <p className="mt-1 text-sm text-muted">
          If <strong className="text-foreground">{state.message}</strong> is an owner address, a sign-in link is on its way. Open it on this device.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <label htmlFor="email" className="block text-sm font-semibold">Email</label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        className="w-full rounded-lg border border-line bg-surface px-3 py-3 text-base"
      />
      {(state.status === "error" || error) && (
        <p className="text-sm text-red-700 dark:text-red-300" role="alert">{state.message ?? error}</p>
      )}
      <button type="submit" disabled={pending} className="w-full rounded-lg bg-foreground py-3 font-semibold text-background disabled:opacity-60">
        {pending ? "Sending…" : "Email me a sign-in link"}
      </button>
    </form>
  );
}
