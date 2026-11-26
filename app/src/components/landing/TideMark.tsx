"use client";

import { useEffect, useRef } from "react";
import { CASCADE_PATHS, HAIR_CLIP } from "./cascade-paths";

/**
 * The Cascade mark, drawn in like a tide (stroke-dashoffset), then filled, then
 * the hair pours into the pool as a slow waterfall. Shown already drawn for
 * people who prefer reduced motion.
 */
export default function TideMark({ duration = 2.2, className = "" }: { duration?: number; className?: string }) {
  const svg = useRef<SVGSVGElement>(null);
  const water = useRef<SVGGElement>(null);

  useEffect(() => {
    const root = svg.current;
    if (!root) return;
    const paths = Array.from(root.querySelectorAll<SVGPathElement>(".tide-path"));
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (still) {
      paths.forEach((p) => p.classList.add("filled"));
      if (water.current) water.current.style.opacity = "1";
      return;
    }
    const timers: number[] = [];
    paths.forEach((p, i) => {
      const len = p.getTotalLength();
      p.style.transition = "none";
      p.style.strokeDasharray = `${len}`;
      p.style.strokeDashoffset = `${len}`;
      p.getBoundingClientRect();
      const delay = (i / paths.length) * duration * 0.48;
      p.style.transition = `stroke-dashoffset ${(duration * 0.62).toFixed(2)}s cubic-bezier(0.22, 1, 0.36, 1) ${delay.toFixed(2)}s, fill 0.85s ease, stroke-opacity 0.85s ease`;
      p.style.strokeDashoffset = "0";
    });
    timers.push(window.setTimeout(() => paths.forEach((p) => p.classList.add("filled")), duration * 760));
    timers.push(window.setTimeout(() => water.current && (water.current.style.opacity = "1"), duration * 960));
    return () => timers.forEach(clearTimeout);
  }, [duration]);

  return (
    <svg ref={svg} viewBox="195 215 635 455" className={`tide-mark h-auto w-full overflow-visible ${className}`} role="img" aria-label="Chairvana: a figure reclining in a salon chair, her hair flowing like a waterfall">
      <defs>
        <clipPath id="tide-hair">
          {HAIR_CLIP.map((d, i) => <path key={i} d={d} />)}
        </clipPath>
      </defs>
      <g>
        {CASCADE_PATHS.map((d, i) => <path key={i} className="tide-path" d={d} />)}
      </g>
      <g ref={water} opacity={0} style={{ transition: "opacity 0.9s ease" }} aria-hidden="true">
        <g clipPath="url(#tide-hair)" fill="none" strokeLinecap="round">
          <path className="wf-stream" d="M 684 242 C 734 282, 764 342, 754 422 C 746 482, 738 526, 756 572" stroke="#b9dcf2" strokeWidth="3.2" strokeDasharray="22 70" opacity="0.78" />
          <path className="wf-stream" d="M 672 256 C 714 306, 730 374, 718 446 C 708 498, 706 534, 720 574" stroke="#b9dcf2" strokeWidth="2.6" strokeDasharray="18 74" opacity="0.68" />
          <path className="wf-stream" d="M 664 274 C 694 330, 694 396, 680 462 C 670 506, 672 540, 686 572" stroke="#b9dcf2" strokeWidth="2.2" strokeDasharray="16 76" opacity="0.58" />
        </g>
        <g fill="none" strokeLinecap="round">
          <ellipse className="pool-ring" cx="708" cy="586" rx="58" ry="9" stroke="#b9dcf2" strokeWidth="1.35" />
          <ellipse className="pool-ring pool-ring-2" cx="708" cy="586" rx="58" ry="9" stroke="#f5efe6" strokeWidth="1.1" />
        </g>
      </g>
    </svg>
  );
}
