"use client";
import { useEffect, useRef, useState } from "react";

/**
 * The signature discipline ring — draws itself on load.
 * r=80 -> circumference = 2*pi*80 ~ 502.65
 */
const R = 80;
const CIRC = 2 * Math.PI * R;

export default function Ring({
  percent, size = 200, label, sublabel, thickness = 11,
}: {
  percent: number; size?: number; label?: string; sublabel?: string; thickness?: number;
}) {
  const [shown, setShown] = useState(0);
  const [phase, setPhase] = useState<"delay" | "draw">("delay");
  const raf = useRef(0);
  const clamped = Math.max(0, Math.min(100, percent));

  useEffect(() => {
    // brief beat before the draw so the page settles first
    const t = setTimeout(() => setPhase("draw"), 350);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (phase !== "draw") return;
    const start = performance.now();
    const dur = 1400;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 4);
      setShown(clamped * eased);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [phase, clamped]);

  const offset = CIRC - (shown / 100) * CIRC;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={`Discipline ${Math.round(percent)} percent`}>
      <svg width={size} height={size} viewBox="0 0 200 200" className="-rotate-90">
        <circle cx="100" cy="100" r={R} fill="none" stroke="rgba(120,116,150,0.14)" strokeWidth={thickness} />
        <circle
          cx="100" cy="100" r={R} fill="none"
          stroke="url(#ringGrad)" strokeWidth={thickness} strokeLinecap="round"
          strokeDasharray={CIRC} strokeDashoffset={offset}
          style={{ ["--ring-circ" as string]: `${CIRC}px`, ["--ring-offset" as string]: `${offset}px` }}
        />
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--accent)" />
            <stop offset="100%" stopColor="#6e6e78" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-serif text-4xl sm:text-[42px] leading-none tabular-nums text-[var(--ink)]">
          {Math.round(shown)}<span className="text-xl text-[var(--ink-faint)]">%</span>
        </span>
        {label && <span className="mt-1.5 text-[11px] uppercase tracking-[0.14em] text-[var(--ink-faint)]">{label}</span>}
        {sublabel && <span className="text-xs text-[var(--ink-soft)] mt-0.5">{sublabel}</span>}
      </div>
    </div>
  );
}
