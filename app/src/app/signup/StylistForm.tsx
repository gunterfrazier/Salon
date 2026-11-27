"use client";

import { useActionState } from "react";
import { TIMEZONES } from "@/lib/platform/zones";
import { signUpStylist, type SignupState } from "./actions";

const input = "mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-base";

/** Stylist sign-up: their own business now; joining a salon is optional. */
export default function StylistForm({ code }: { code?: string | null }) {
  const [state, action, pending] = useActionState<SignupState, FormData>(signUpStylist, { status: "idle" });
  if (state.status === "sent") {
    return (
      <div role="status" className="mt-6 rounded-xl border border-line bg-surface p-5">
        <p className="font-semibold">Check your email</p>
        <p className="mt-1 text-sm text-muted">
          We sent a sign-in link to <strong className="text-foreground">{state.message}</strong>. Open it in this browser{code ? " to finish joining the salon" : ""}. Then set a password in Account so next time you can sign in right away.
        </p>
      </div>
    );
  }
  return (
    <form action={action} className="mt-6 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="text-sm font-medium">First name<input name="first" required autoComplete="given-name" className={input} /></label>
        <label className="text-sm font-medium">Last name<input name="last" required autoComplete="family-name" className={input} /></label>
      </div>
      <label className="block text-sm font-medium">Email (you sign in with this)<input name="email" type="email" required autoComplete="email" className={input} /></label>
      <label className="block text-sm font-medium">Mobile (optional)<input name="phone" inputMode="tel" autoComplete="tel" className={input} /></label>
      <label className="block text-sm font-medium">
        Business name (optional)
        <input name="business" maxLength={80} className={input} placeholder="Your name, or your studio's" />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-sm font-medium">ZIP<input name="zip" required inputMode="numeric" maxLength={5} className={input} placeholder="36280" /></label>
        <label className="text-sm font-medium">
          Time zone
          <select name="timezone" defaultValue="America/Chicago" className={input}>
            {TIMEZONES.map(([tz, label]) => <option key={tz} value={tz}>{label}</option>)}
          </select>
        </label>
      </div>
      <label className="block text-sm font-medium">
        Salon join code (optional)
        <input name="code" defaultValue={code ?? ""} maxLength={12} autoCapitalize="characters" className={`${input} font-mono uppercase tracking-widest`} placeholder="From your salon" />
        <span className="mt-1 block text-xs font-normal text-muted">Working at a salon on Chairvana? Their code adds you to their team. You can also ask to join later.</span>
      </label>
      <input name="company" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      {state.status === "error" && <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">{state.message}</p>}
      <button disabled={pending} className="w-full rounded-lg bg-foreground py-3 font-semibold text-background disabled:opacity-60">{pending ? "Setting up…" : "Create my account"}</button>
      <p className="text-xs text-muted">You can use it right away: clients, calendar and payments. Your public booking page opens once we&rsquo;ve checked your account.</p>
    </form>
  );
}
