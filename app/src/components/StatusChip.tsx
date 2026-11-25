import type { CSSProperties } from "react";
import { STATUS, type StatusKey } from "@/lib/ui/status-colors";

export function statusVars(key: StatusKey): CSSProperties {
  const s = STATUS[key];
  return {
    "--l-bg": s.light.bg, "--l-fg": s.light.fg, "--l-border": s.light.border,
    "--d-bg": s.dark.bg, "--d-fg": s.dark.fg, "--d-border": s.dark.border,
  } as CSSProperties;
}

export function StatusChip({ status, text }: { status: StatusKey; text?: string }) {
  const s = STATUS[status];
  return (
    <span className="status inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm font-semibold whitespace-nowrap" style={statusVars(status)}>
      <span aria-hidden>{s.icon}</span>
      {text ?? s.label}
    </span>
  );
}
