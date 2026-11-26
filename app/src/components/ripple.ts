/** Three concentric water ripples from the tap point (brand "Confirm ripple"). The element must be position: relative + overflow-hidden. */
export function waterRipple(el: HTMLElement, e: { clientX: number; clientY: number }) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const r = el.getBoundingClientRect();
  const x = e.clientX ? e.clientX - r.left : r.width / 2;
  const y = e.clientY ? e.clientY - r.top : r.height / 2;
  const size = Math.max(r.width, r.height) * 0.6;
  for (const cls of ["", "ring-2", "ring-3"]) {
    const ring = document.createElement("span");
    ring.className = `ripple-wave ${cls}`.trim();
    ring.setAttribute("aria-hidden", "true");
    Object.assign(ring.style, { left: `${x}px`, top: `${y}px`, width: `${size}px`, height: `${size}px` });
    el.appendChild(ring);
    window.setTimeout(() => ring.remove(), 1600);
  }
}
