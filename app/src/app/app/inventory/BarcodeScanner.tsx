"use client";

import { useEffect, useRef, useState } from "react";

interface Detector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: new (opts: { formats: string[] }) => Detector;
  }
}

/** Camera barcode reader (Chrome on Android has one built in). Falls back to typing the number. */
export default function BarcodeScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [typed, setTyped] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      if (!window.BarcodeDetector || !navigator.mediaDevices?.getUserMedia) {
        setProblem("This browser can't read barcodes with the camera. Type the number under the barcode instead.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (stopped || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const detector = new window.BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf"] });
        const tick = async () => {
          if (stopped || !video.current) return;
          try {
            const [hit] = await detector.detect(video.current);
            if (hit?.rawValue) {
              stopped = true;
              navigator.vibrate?.(60);
              onCode(hit.rawValue.trim());
              return;
            }
          } catch {
            /* frame not ready */
          }
          timer = setTimeout(tick, 200);
        };
        tick();
      } catch {
        setProblem("Couldn't open the camera. Allow camera access for chairvana.app, or type the number instead.");
      }
    })();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onCode]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Scan barcode" className="w-full max-w-md rounded-t-2xl bg-surface p-4 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-bold">Scan barcode</h2>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-xl" aria-label="Close">×</button>
        </div>
        {problem ? (
          <p className="text-sm">{problem}</p>
        ) : (
          <div className="relative overflow-hidden rounded-xl bg-black">
            <video ref={video} className="aspect-[4/3] w-full object-cover" muted playsInline />
            <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-red-500/80" />
          </div>
        )}
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (typed.trim()) onCode(typed.trim());
          }}
        >
          <input className="min-w-0 flex-1 rounded-lg border border-line bg-background px-3 py-2" inputMode="numeric" placeholder="Or type the barcode number" value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Barcode number" />
          <button className="rounded-lg bg-foreground px-4 py-2 font-semibold text-background">Go</button>
        </form>
      </div>
    </div>
  );
}
