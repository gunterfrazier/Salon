/** The compact Chairvana mark (the wave), ink in light mode and ivory in dark mode. */
export function BrandMark({ className = "h-8 w-auto", alt = "" }: { className?: string; alt?: string }) {
  return (
    <picture>
      <source media="(prefers-color-scheme: dark)" srcSet="/brand/mark-ivory.png" />
      <img src="/brand/mark-dark.png" alt={alt} className={className} width={327} height={305} />
    </picture>
  );
}

/** The full Cascade lockup with the CHAIRVANA wordmark. Use at 140px wide or larger. */
export function BrandLogo({ className = "w-56 h-auto", alt = "Chairvana" }: { className?: string; alt?: string }) {
  return (
    <picture>
      <source media="(prefers-color-scheme: dark)" srcSet="/brand/logo-ivory.png" />
      <img src="/brand/logo-dark.png" alt={alt} className={className} width={706} height={555} />
    </picture>
  );
}

/** CHAIRVANA set in Cinzel with wide tracking, as in the brand guide. */
export function Wordmark({ className = "text-sm" }: { className?: string }) {
  return <span className={`font-wordmark tracking-[0.34em] ${className}`}>CHAIRVANA</span>;
}
