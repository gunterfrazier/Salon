import type { CSSProperties } from "react";
import { STATUS, type StatusKey } from "@/lib/ui/status-colors";

export function statusVars(key: StatusKey): CSSProperties {
  const s = STATUS[key];
  return {
    "--l-bg": s.light.bg, "--l-fg": s.light.fg, "--l-border": s.light.border,
    "--d-bg": s.dark.bg, "--d-fg": s.dark.fg, "--d-border": s.dark.border,
  } as CSSProperties;
}

export function StatusChip({ status, text, size = "md" }: { status: StatusKey; text?: string; size?: "sm" | "md" }) {
  const s = STATUS[status];
  const sz = size === "sm" ? "gap-1 border px-1.5 py-0 text-[11px]" : "gap-1.5 px-2.5 py-0.5 text-sm";
  return (
    <span className={`status inline-flex items-center rounded-full font-semibold whitespace-nowrap ${sz}`} style={statusVars(status)} title={s.label}>
      <span aria-hidden>{s.icon}</span>
      {text ?? s.label}
    </span>
  );
}
