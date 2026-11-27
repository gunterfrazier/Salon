"use client";

import { useState } from "react";

/** Share the salon's page (phone share sheet, or copy the link). */
export default function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label="Share this salon"
      className="flex size-10 items-center justify-center rounded-full border border-white/20 bg-black/20 text-[#f5efe6] backdrop-blur"
      onClick={async () => {
        const url = window.location.href.split("?")[0];
        try {
          if (navigator.share) await navigator.share({ title, url });
          else {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          }
        } catch {}
      }}
    >
      {copied ? (
        <span className="text-[10px]">Copied</span>
      ) : (
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5M5 12.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-6.5" />
        </svg>
      )}
    </button>
  );
}
