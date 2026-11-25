"use client";

import { useEffect, useState } from "react";
import { paymentRequest, validateHandle, type PaymentMethod } from "@/lib/payments/methods";

/**
 * Settings > Payments. Every supported method is listed; the stylist links
 * and switches each on or off whenever they like.
 *
 * Preview build: settings are kept in this browser only. Once the database
 * is connected they're saved to the business's settings instead.
 */
const STORE_KEY = "salon.paymentSettings.v1";

type Saved = Record<string, { enabled: boolean; handle?: string; connected?: boolean }>;

function load(): Saved {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}") as Saved;
  } catch {
    return {};
  }
}
function save(s: Saved) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: settings last for this visit only */
  }
}

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
  const [saved, setSaved] = useState<Saved>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    // Read browser-only settings after mount so the server render matches.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaved(load());
  }, []);

  const state = (m: PaymentMethod) => ({
    enabled: saved[m.key]?.enabled ?? m.enabled,
    handle: saved[m.key]?.handle ?? m.handle ?? "",
    connected: saved[m.key]?.connected ?? false,
  });
  const update = (key: string, patch: Saved[string]) => {
    const next = { ...saved, [key]: { ...saved[key], ...patch } };
    setSaved(next);
    save(next);
  };

  const stripe = methods.filter((m) => m.provider === "stripe");
  const paypal = methods.filter((m) => m.provider === "paypal");
  const manual = methods.filter((m) => m.provider === "manual");
  const stripeLinked = saved.__stripe?.connected ?? false;

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Cards &amp; wallets</h2>
        <p className="text-sm text-muted">One Stripe account links all four. These can be saved for later, so late-cancel and no-show fees can be charged automatically.</p>
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold">Stripe</p>
              <p className="text-sm text-muted">{stripeLinked ? "Linked (preview)" : "Not linked"}</p>
            </div>
            <button
              type="button"
              onClick={() => update("__stripe", { enabled: false, connected: !stripeLinked })}
              className="rounded-lg border-2 border-foreground px-3 py-1.5 text-sm font-semibold"
            >
              {stripeLinked ? "Unlink" : "Link Stripe account"}
            </button>
          </div>
          <ul className="mt-4 divide-y divide-line">
            {stripe.map((m) => (
              <li key={m.key} className="flex items-center justify-between gap-3 py-3">
                <span className="flex items-center gap-2">
                  {m.label}
                  {state(m).enabled && stripeLinked ? <Badge text="On" tone="on" /> : <Badge text="Off" tone="off" />}
                </span>
                <Toggle label={m.label} on={state(m).enabled} disabled={!stripeLinked} onChange={() => update(m.key, { enabled: !state(m).enabled })} />
              </li>
            ))}
          </ul>
          {!stripeLinked && <p className="mt-2 text-xs text-muted">Linking opens Stripe&rsquo;s sign-up as a sole proprietor. Available once the Stripe account is created.</p>}
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
                <Toggle label={m.label} on={s.enabled} disabled={!linked} onChange={() => update(m.key, { enabled: !s.enabled, handle: s.handle || undefined })} />
              </div>
              {needsHandle && (
                <form
                  className="mt-3 flex flex-col gap-2 sm:flex-row"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const r = validateHandle(m.key, draft);
                    if (!r.ok) return setErrors({ ...errors, [m.key]: r.error });
                    setErrors({ ...errors, [m.key]: "" });
                    setDrafts({ ...drafts, [m.key]: r.value });
                    update(m.key, { handle: r.value, enabled: s.enabled });
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
        <p className="text-sm text-muted">Coming in Phase 2: clients pay inside the booking page, and these may be chargeable later too.</p>
        <Card>
          <ul className="divide-y divide-line">
            {paypal.map((m) => (
              <li key={m.key} className="flex items-center justify-between gap-3 py-3">
                <span className="flex items-center gap-2">{m.label} <Badge text="Phase 2" tone="off" /></span>
                <Toggle label={m.label} on={false} disabled onChange={() => {}} />
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <p className="text-xs text-muted">Preview: settings are saved in this browser only until the app&rsquo;s database is connected. Reports will show payments by method so you can compare which ones clients use most.</p>
    </div>
  );
}
