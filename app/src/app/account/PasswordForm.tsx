"use client";

import { useActionState } from "react";
import { setPassword, type PwState } from "./actions";

const input = "w-full rounded-lg border border-line bg-background px-3 py-2.5 text-base";

export default function PasswordForm({ hasPassword, reset }: { hasPassword: boolean; reset: boolean }) {
  const [state, action, pending] = useActionState<PwState, FormData>(setPassword, { status: "idle" });
  return (
    <form action={action} className="space-y-2">
      <h2 className="font-semibold">{hasPassword ? "Change password" : "Set a password"}</h2>
      {(reset || !hasPassword) && state.status !== "saved" && (
        <p className="text-sm text-muted">{reset ? "Choose a new password." : "Set one so you can sign in with your email and password instead of waiting for a link."}</p>
      )}
      <input name="password" type="password" autoComplete="new-password" placeholder="New password (8+ characters)" aria-label="New password" className={input} autoFocus={reset} />
      <input name="confirm" type="password" autoComplete="new-password" placeholder="Type it again" aria-label="Confirm new password" className={input} />
      {state.status === "error" && <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">{state.message}</p>}
      {state.status === "saved" && <p role="status" className="text-sm font-semibold">Saved. Next time, sign in with your email and this password.</p>}
      <button disabled={pending} className="rounded-lg bg-foreground px-4 py-2.5 font-semibold text-background disabled:opacity-60">{pending ? "Saving…" : "Save password"}</button>
    </form>
  );
}
