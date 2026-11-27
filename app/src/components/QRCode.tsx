"use client";

import QR from "qrcode";
import { useEffect, useState } from "react";

/** A crisp QR code (SVG), ink on transparent. */
export default function QRCode({ text, className = "size-40", label, dark = "#0f0f11" }: { text: string; className?: string; label?: string; dark?: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    QR.toString(text, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark, light: "#0000" } })
      .then((s) => live && setSvg(s))
      .catch(() => live && setSvg(null));
    return () => {
      live = false;
    };
  }, [text, dark]);
  return <div role="img" aria-label={label ?? `QR code for ${text}`} className={className} dangerouslySetInnerHTML={svg ? { __html: svg } : undefined} />;
}

/** Download a QR code as a PNG (for social posts, flyers, Canva). */
export async function downloadQR(text: string, filename: string) {
  const url = await QR.toDataURL(text, { width: 1200, margin: 2, errorCorrectionLevel: "M", color: { dark: "#0f0f11", light: "#ffffff" } });
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
}
