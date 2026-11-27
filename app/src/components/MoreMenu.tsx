"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * The phone tab bar's "More" menu. A plain <details> stays open until you pick
 * something; this one also closes on a tap anywhere else, on Escape, and after
 * a choice.
 */
export function MoreMenu({ summary, children, className }: { summary: ReactNode; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = () => ref.current?.removeAttribute("open");
    const onDown = (e: PointerEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && ref.current?.open) {
        close();
        ref.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
  return (
    <details ref={ref} className={className} onClick={(e) => (e.target as HTMLElement).closest("a") && ref.current?.removeAttribute("open")}>
      {summary}
      {children}
    </details>
  );
}
