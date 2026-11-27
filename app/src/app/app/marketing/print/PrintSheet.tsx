"use client";

/* eslint-disable @next/next/no-img-element -- print artwork */
import Link from "next/link";
import { useState } from "react";
import QRCode from "@/components/QRCode";

type Props = { kind: "cling" | "counter" | "cards"; salon: string; bookUrl: string; pageUrl: string; reviewUrl: string; phone: string | null; handle: string | null };

const short = (u: string) => u.replace(/^https:\/\//, "");

export default function PrintSheet({ kind, salon, bookUrl, pageUrl, reviewUrl, phone, handle }: Props) {
  const [dark, setDark] = useState(false);
  const ink = dark ? "#f5efe6" : "#0f0f11";
  const paper = dark ? "#0f0f11" : "#ffffff";
  const mark = dark ? "/brand/mark-ivory.png" : "/brand/mark-dark.png";
  const page = kind === "cards" ? "8.5in 11in" : kind === "counter" ? "5in 7in" : "4in 4in";

  return (
    <div className="min-h-dvh bg-neutral-200 py-6 print:bg-white print:py-0">
      <style>{`@page { size: ${page}; margin: 0 } @media print { .no-print { display: none !important } body { background: #fff } }`}</style>
      <div className="no-print mx-auto mb-4 flex max-w-xl flex-wrap items-center justify-between gap-2 px-4 text-sm text-neutral-900">
        <Link href="/app/marketing" className="underline">‹ Marketing</Link>
        <span className="flex gap-2">
          <button className="rounded-full border border-neutral-500 px-3 py-1.5" onClick={() => setDark(!dark)}>{dark ? "Light version" : "Dark version"}</button>
          <button className="rounded-full bg-neutral-900 px-4 py-1.5 font-semibold text-white" onClick={() => window.print()}>Print</button>
        </span>
      </div>

      {kind === "cling" && (
        <section className="mx-auto flex flex-col items-center justify-center text-center shadow-xl print:shadow-none" style={{ width: "4in", height: "4in", background: paper, color: ink, padding: "0.3in" }}>
          <img src={mark} alt="" style={{ height: "0.45in" }} />
          <p className="font-display" style={{ fontSize: "17pt", lineHeight: 1.15, marginTop: "0.12in" }}>Love the look?</p>
          <p style={{ fontSize: "9.5pt", marginTop: "0.04in", opacity: 0.8 }}>Book your next visit before you leave the chair.</p>
          <div style={{ marginTop: "0.15in", background: "#fff", padding: "0.06in", borderRadius: "0.06in" }}>
            <QRCode text={bookUrl} className="size-[1.45in]" label="Booking QR code" />
          </div>
          <p className="font-wordmark" style={{ fontSize: "8pt", letterSpacing: "0.2em", marginTop: "0.12in" }}>{salon.toUpperCase()}</p>
        </section>
      )}

      {kind === "counter" && (
        <section className="mx-auto flex flex-col items-center text-center shadow-xl print:shadow-none" style={{ width: "5in", height: "7in", background: paper, color: ink, padding: "0.45in 0.4in" }}>
          <img src={mark} alt="" style={{ height: "0.55in" }} />
          <p className="font-display" style={{ fontSize: "26pt", lineHeight: 1.1, marginTop: "0.15in" }}>{salon}</p>
          <p className="font-display italic" style={{ fontSize: "12pt", opacity: 0.75 }}>Where your schedule finds its flow.</p>
          <div className="grid grid-cols-2" style={{ gap: "0.3in", marginTop: "0.35in" }}>
            {[
              ["Book your next visit", bookUrl],
              ["Loved it? Leave a review", reviewUrl],
            ].map(([t, u]) => (
              <div key={t} className="flex flex-col items-center">
                <div style={{ background: "#fff", padding: "0.07in", borderRadius: "0.06in" }}>
                  <QRCode text={u} className="size-[1.6in]" label={`${t} QR code`} />
                </div>
                <p style={{ fontSize: "10.5pt", fontWeight: 600, marginTop: "0.1in" }}>{t}</p>
              </div>
            ))}
          </div>
          <div style={{ marginTop: "auto", fontSize: "9.5pt", opacity: 0.8 }}>
            {handle && <p>Follow {handle}</p>}
            {phone && <p>{phone}</p>}
            <p>{short(pageUrl)}</p>
          </div>
        </section>
      )}

      {kind === "cards" && (
        <section className="mx-auto grid shadow-xl print:shadow-none" style={{ width: "8.5in", height: "11in", background: "#fff", gridTemplateColumns: "3.5in 3.5in", gridAutoRows: "2in", justifyContent: "center", alignContent: "center", gap: "0" }}>
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="flex items-center" style={{ width: "3.5in", height: "2in", background: paper, color: ink, padding: "0.2in", gap: "0.18in", outline: "0.5px dashed #bbb" }}>
              <div className="flex min-w-0 flex-1 flex-col justify-center">
                <img src={mark} alt="" style={{ height: "0.32in", width: "auto", alignSelf: "flex-start" }} />
                <p className="font-display" style={{ fontSize: "14pt", lineHeight: 1.1, marginTop: "0.08in" }}>{salon}</p>
                <p style={{ fontSize: "7.5pt", opacity: 0.8, marginTop: "0.04in" }}>Book online any time</p>
                <p style={{ fontSize: "7pt", marginTop: "0.08in", wordBreak: "break-all" }}>{short(bookUrl)}</p>
                {(phone || handle) && <p style={{ fontSize: "7pt", opacity: 0.8 }}>{[phone, handle].filter(Boolean).join(" · ")}</p>}
              </div>
              <div style={{ background: "#fff", padding: "0.04in", borderRadius: "0.04in" }}>
                <QRCode text={bookUrl} className="size-[1.1in]" label="Booking QR code" />
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
