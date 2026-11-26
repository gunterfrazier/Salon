"use client";

import { useEffect, useState, useTransition } from "react";
import { pushPublicKey, removePushDevice, savePushDevice, sendTestPush } from "./actions";

type State = "checking" | "unsupported" | "blocked" | "off" | "on";

function deviceName(): string {
  const ua = navigator.userAgent;
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Windows/.test(ua) ? "Windows" : /Mac/.test(ua) ? "Mac" : "Device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "browser";
  return `${os} · ${browser}`;
}

function keyBytes(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64.length + 3) % 4));
  const out = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** Turn on push alerts (new bookings, day preview…) for the phone or tablet in hand. */
export default function PushSetup({ devices }: { devices: { endpoint: string; device: string | null; lastOk: string | null }[] }) {
  const [state, setState] = useState<State>("checking");
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      Promise.resolve().then(() => setState("unsupported"));
      return;
    }
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        setEndpoint(sub?.endpoint ?? null);
        setState(Notification.permission === "denied" ? "blocked" : sub ? "on" : "off");
      })
      .catch(() => setState("unsupported"));
  }, []);

  const turnOn = () =>
    start(async () => {
      setMsg(null);
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setState(permission === "denied" ? "blocked" : "off");
          return;
        }
        const reg = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
        const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(await pushPublicKey()) }));
        const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
        const r = await savePushDevice(json, deviceName());
        if (!r.ok) throw new Error(r.error);
        setEndpoint(sub.endpoint);
        setState("on");
        const t = await sendTestPush();
        setMsg(t.ok ? { ok: true, text: "Alerts are on. A test alert is on its way." } : { ok: false, text: `Turned on, but the test didn't send: ${t.error}` });
      } catch (e) {
        setMsg({ ok: false, text: (e as Error).message || "Couldn't turn on alerts." });
      }
    });

  const turnOff = () =>
    start(async () => {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removePushDevice(sub.endpoint);
        await sub.unsubscribe();
      }
      setEndpoint(null);
      setState("off");
      setMsg({ ok: true, text: "Alerts are off on this device." });
    });

  const test = () =>
    start(async () => {
      const t = await sendTestPush();
      setMsg(t.ok ? { ok: true, text: `Sent to ${t.devices} device${t.devices === 1 ? "" : "s"}.` } : { ok: false, text: t.error });
    });

  const btn = "rounded-lg border border-line px-3 py-2 text-sm font-semibold disabled:opacity-50";
  const others = devices.filter((d) => d.endpoint !== endpoint);

  return (
    <section className="mx-auto max-w-3xl px-4">
      <div className="rounded-xl border border-line bg-surface p-4">
        <h2 className="font-semibold">Alerts on your phone</h2>
        <p className="mt-0.5 text-sm text-muted">Free notifications from Chairvana itself: new online bookings, released holds, your day preview. No texting account needed.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {state === "checking" && <p className="text-sm text-muted">Checking this device…</p>}
          {state === "unsupported" && <p className="text-sm">This browser can&apos;t get alerts. On Android, open chairvana.app in Chrome.</p>}
          {state === "blocked" && <p className="text-sm">Notifications are blocked for chairvana.app. Allow them in the browser&apos;s site settings, then come back.</p>}
          {state === "off" && (
            <button type="button" onClick={turnOn} disabled={busy} className={`${btn} bg-foreground text-background`}>
              {busy ? "Turning on…" : "Turn on alerts on this device"}
            </button>
          )}
          {state === "on" && (
            <>
              <p className="text-sm font-semibold">On for this device.</p>
              <button type="button" onClick={test} disabled={busy} className={btn}>Send a test</button>
              <button type="button" onClick={turnOff} disabled={busy} className={btn}>Turn off here</button>
            </>
          )}
        </div>
        {msg && <p role="status" className={`mt-2 text-sm ${msg.ok ? "" : "font-semibold"}`}>{msg.text}</p>}
        {others.length > 0 && (
          <p className="mt-2 text-xs text-muted">Also on: {others.map((d) => d.device ?? "another device").join(", ")}.</p>
        )}
        <p className="mt-2 text-xs text-muted">When alerts are on, your alerts come here instead of by text.</p>
      </div>
    </section>
  );
}
