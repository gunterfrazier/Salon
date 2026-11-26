"use client";

import { useState, useTransition } from "react";
import { savePaymentMethod } from "./actions";
import { paymentRequest, validateHandle, type PaymentMethod } from "@/lib/payments/methods";

/**
 * Settings > Payments. Every supported method is listed; the stylist links
 * and switches each on or off whenever they like. Saved to the salon's
 * settings in the database.
 */
type Saved = Record<string, { enabled: boolean; handle?: string }>;

const HANDLE_HINT: Record<string, string> = {
  venmo_direct: "Venmo username, e.g. @StyledByK",
  cash_app_direct: "$Cashtag, e.g. $StyledByK",
  paypal_me: "PayPal.Me name, e.g. StyledByK",
  zelle: "Phone or email registered with Zelle",
  apple_cash: "iPhone number or Apple ID email",
};

function Toggle({ label, on, disabled, onChange }: { label: string; on: boolean; disabled?: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`${label} ${on ? "on" : "off"}`}
      disabled={disabled}
      onClick={onChange}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-40 ${on ? "bg-emerald-600" : "bg-stone-400 dark:bg-stone-600"}`}
    >
      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${on ? "left-6" : "left-1"}`} />
    </button>
  );
}

function Badge({ text, tone }: { text: string; tone: "on" | "off" | "warn" }) {
  const tones = {
    on: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
    warn: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
    off: "bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300",
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tones[tone]}`}>{text}</span>;
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-line bg-surface p-4">{children}</div>;
}

export default function PaymentSettings({ methods }: { methods: PaymentMethod[] }) {
  const [saved, setSaved] = useState<Saved>(() => Object.fromEntries(methods.map((m) => [m.key, { enabled: m.enabled, handle: m.handle }])));
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [, startSaving] = useTransition();

  const state = (m: PaymentMethod) => ({ enabled: saved[m.key]?.enabled ?? m.enabled, handle: saved[m.key]?.handle ?? "" });

  /** Optimistic update, then save; roll back and show the error if refused. */
  const update = (key: string, patch: { enabled?: boolean; handle?: string }) => {
    const before = saved[key];
    setSaved((s) => ({ ...s, [key]: { ...s[key], ...patch } as Saved[string] }));
    setErrors((e) => ({ ...e, [key]: "" }));
    startSaving(async () => {
      const r = await savePaymentMethod(key, patch);
      if (!r.ok) {
        setSaved((s) => ({ ...s, [key]: before }));
        setErrors((e) => ({ ...e, [key]: r.error }));
      } else if (r.handle !== undefined) {
        setSaved((s) => ({ ...s, [key]: { ...s[key], handle: r.handle } }));
        setDrafts((d) => ({ ...d, [key]: r.handle! }));
      }
    });
  };

  const stripe = methods.filter((m) => m.provider === "stripe");
  const paypal = methods.filter((m) => m.provider === "paypal");
  const manual = methods.filter((m) => m.provider === "manual");

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Cards &amp; wallets</h2>
        <p className="text-sm text-muted">One Stripe account links all four. These can be saved for later, so late-cancel and no-show fees can be charged automatically.</p>
        <Card>
          <div>
            <p className="font-semibold">Stripe</p>
            <p className="text-sm text-muted">Not connected yet. Card, Google Pay, Apple Pay and Cash App Pay arrive when Stripe is set up.</p>
          </div>
          <ul className="mt-4 divide-y divide-line">
            {stripe.map((m) => (
              <li key={m.key} className="flex items-center justify-between gap-3 py-3">
                <span className="flex items-center gap-2">{m.label} <Badge text="Not connected" tone="off" /></span>
                <Toggle label={m.label} on={false} disabled onChange={() => {}} />
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Send-to-me apps</h2>
        <p className="text-sm text-muted">
          Clients pay you directly; you tap <em>Mark received</em> when it arrives. These can&rsquo;t be charged later, so any required deposit must be paid before the booking is confirmed.
        </p>
        {manual.map((m) => {
          const s = state(m);
          const needsHandle = m.setup === "handle";
          const draft = drafts[m.key] ?? s.handle;
          let preview: ReturnType<typeof paymentRequest> | null = null;
          if (!needsHandle || s.handle) {
            try {
              preview = paymentRequest({ ...m, handle: s.handle }, 5000, "Deposit");
            } catch {
              preview = null;
            }
          }
          const linked = !needsHandle || !!s.handle;
          return (
            <Card key={m.key}>
              <div className="flex items-center justify-between gap-3">
                <span className="flex flex-wrap items-center gap-2 font-semibold">
                  {m.label}
                  {s.enabled && linked ? <Badge text="On" tone="on" /> : linked ? <Badge text="Linked · off" tone="off" /> : <Badge text="Not linked" tone="warn" />}
                </span>
                <Toggle label={m.label} on={s.enabled} disabled={!linked} onChange={() => update(m.key, { enabled: !s.enabled })} />
              </div>
              {needsHandle && (
                <form
                  className="mt-3 flex flex-col gap-2 sm:flex-row"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const r = validateHandle(m.key, draft);
                    if (!r.ok) return setErrors((x) => ({ ...x, [m.key]: r.error }));
                    update(m.key, { handle: r.value });
                  }}
                >
                  <label className="sr-only" htmlFor={`h-${m.key}`}>{HANDLE_HINT[m.key]}</label>
                  <input
                    id={`h-${m.key}`}
                    value={draft}
                    placeholder={HANDLE_HINT[m.key]}
                    onChange={(e) => setDrafts({ ...drafts, [m.key]: e.target.value })}
                    className="min-w-0 flex-1 rounded-lg border border-line bg-background px-3 py-2"
                  />
                  <button type="submit" className="rounded-lg bg-foreground px-4 py-2 font-semibold text-background">Save</button>
                </form>
              )}
              {errors[m.key] && <p className="mt-1 text-sm text-red-700 dark:text-red-300">{errors[m.key]}</p>}
              {preview && (
                <p className="mt-3 text-sm text-muted break-words">
                  Client sees: {preview.instructions}{" "}
                  {preview.url && (
                    <a className="font-semibold text-foreground underline" href={preview.url} target="_blank" rel="noreferrer">Test $50 link</a>
                  )}
                </p>
              )}
            </Card>
          );
        })}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">PayPal &amp; Venmo checkout</h2>
        <p className="text-sm text-muted">Coming later: clients pay inside the booking page. Until then, use Venmo / PayPal.Me above.</p>
        <Card>
          <ul className="divide-y divide-line">
            {paypal.map((m) => (
              <li key={m.key} className="flex items-center justify-between gap-3 py-3">
                <span className="flex items-center gap-2">{m.label} <Badge text="Coming later" tone="off" /></span>
                <Toggle label={m.label} on={false} disabled onChange={() => {}} />
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <p className="text-xs text-muted">Methods switched on here appear on your online booking page when a deposit is due. Reports will show payments by method so you can compare which ones clients use most.</p>
    </div>
  );
}
