/* eslint-disable @next/next/no-img-element -- the salon's own logo from storage */
import { WHITE_LOGO } from "@/lib/branding";

/**
 * A salon's logo. "badge": in a tile (cropped to fill it). "free": a
 * transparent logo on its own, whole, with a soft shadow so it reads over a
 * photo; optionally all white. Without a logo, the tile shows initials.
 */
export function SalonLogo({ url, name, look, tileClass, freeClass, initialsClass = "" }: { url: string | null; name: string; look: { logoStyle: "badge" | "free"; logoTint: "original" | "white" }; tileClass: string; freeClass: string; initialsClass?: string }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  if (url && look.logoStyle === "free") {
    return (
      <img
        src={url}
        alt={`${name} logo`}
        className={`shrink-0 object-contain object-left drop-shadow-[0_2px_10px_rgba(0,0,0,0.55)] ${freeClass}`}
        style={look.logoTint === "white" ? { filter: `${WHITE_LOGO} drop-shadow(0 2px 10px rgba(0,0,0,0.55))` } : undefined}
      />
    );
  }
  return (
    <span className={`flex shrink-0 items-center justify-center overflow-hidden ${tileClass} ${url ? "" : initialsClass}`}>
      {url ? <img src={url} alt={`${name} logo`} className="size-full object-cover" /> : initials}
    </span>
  );
}
