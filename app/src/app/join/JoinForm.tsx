"use client";

import { useActionState } from "react";
import { TIMEZONES } from "@/lib/platform/zones";
import { applyToJoin, type JoinState } from "./actions";

const input = "mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-base";

export default function JoinForm() {
  const [state, action, pending] = useActionState<JoinState, FormData>(applyToJoin, { status: "idle" });
  if (state.status === "sent") {
    return (
      <div role="status" className="mt-6 rounded-xl border border-line bg-surface p-5">
        <p className="font-semibold">Thanks! We got your request.</p>
        <p className="mt-1 text-sm text-muted">{state.message ?? "We review each salon before it goes live. You'll hear from us by email, then you can sign in with the email you gave."}</p>
      </div>
    );
  }
  return (
    <form action={action} className="mt-6 space-y-3">
      <label className="block text-sm font-medium">Salon name<input name="salon" required className={input} /></label>
      <label className="block text-sm font-medium">Your name<input name="owner" required className={input} autoComplete="name" /></label>
      <label className="block text-sm font-medium">Email (you&apos;ll sign in with this)<input name="email" type="email" required className={input} autoComplete="email" /></label>
      <label className="block text-sm font-medium">Phone<input name="phone" className={input} inputMode="tel" autoComplete="tel" /></label>
      <label className="block text-sm font-medium">Street address<input name="street" className={input} autoComplete="street-address" /></label>
      <div className="grid grid-cols-[1fr_5rem_7rem] gap-2">
        <label className="text-sm font-medium">City<input name="city" className={input} /></label>
        <label className="text-sm font-medium">State<input name="state" maxLength={2} className={input} placeholder="AL" /></label>
        <label className="text-sm font-medium">ZIP<input name="zip" required inputMode="numeric" className={input} /></label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-sm font-medium">
          Time zone
          <select name="timezone" defaultValue="America/Chicago" className={input}>
            {TIMEZONES.map(([tz, label]) => <option key={tz} value={tz}>{label}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">Stylists<input name="stylists" type="number" min={1} max={200} defaultValue={1} className={input} /></label>
      </div>
      <label className="block text-sm font-medium">Website or Instagram (optional)<input name="website" className={input} /></label>
      <label className="block text-sm font-medium">Anything else? (optional)<textarea name="message" rows={3} className={input} /></label>
      <input name="website_url" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      {state.status === "error" && <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">{state.message}</p>}
      <button disabled={pending} className="w-full rounded-lg bg-foreground py-3 font-semibold text-background disabled:opacity-60">{pending ? "Sending…" : "Send request"}</button>
    </form>
  );
}
