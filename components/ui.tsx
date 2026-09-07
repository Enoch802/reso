"use client";
import React, { useEffect, useState } from "react";
import { Check } from "lucide-react";

/* ---------- Glass: primary content cards only (light 12px blur, airy) ---------- */
export function GlassCard({
  children, className = "", strong = false, ...rest
}: React.HTMLAttributes<HTMLDivElement> & { strong?: boolean }) {
  return (
    <div
      {...rest}
      className={`glass rounded-3xl ${strong ? "!" : ""} ${className}`}
      style={strong ? { background: "var(--glass-fill-strong)" } : undefined}
    >
      {children}
    </div>
  );
}

/* ---------- Neomorphic button: small, tactile, embossed ---------- */
export function NeoButton({
  children, className = "", onClick, disabled, type = "button", title, ariaLabel, variant = "default",
}: {
  children: React.ReactNode; className?: string;
  onClick?: () => void; disabled?: boolean; type?: "button" | "submit";
  title?: string; ariaLabel?: string;
  variant?: "default" | "accent";
}) {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      type={type}
      title={title}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      className={`focus-ring rounded-xl min-h-[44px] px-4 py-2 text-sm font-medium transition-[box-shadow,transform] duration-150 select-none
        ${pressed ? "neo-pressed translate-y-[1px]" : "neo"}
        ${disabled ? "opacity-45 cursor-not-allowed" : "cursor-pointer active:translate-y-[1px] hover:-translate-y-[1px]"}
        ${variant === "accent" ? "text-[var(--accent)]" : "text-[var(--ink)]"}
        ${className}`}
    >
      {children}
    </button>
  );
}

/* ---------- Neomorphic checkbox (checklist items, choices) ---------- */
export function NeoCheck({
  checked, onToggle, label, size = 44,
}: { checked: boolean; onToggle: () => void; label: string; size?: number }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
      className="focus-ring rounded-xl shrink-0 cursor-pointer transition-all duration-150 flex items-center justify-center"
      style={{
        width: size, height: size,
        background: "var(--neo-base)",
        boxShadow: checked
          ? "inset 4px 4px 9px rgba(58,56,82,0.14), inset -4px -4px 9px rgba(255,255,255,0.85)"
          : "3px 3px 8px rgba(58,56,82,0.13), -3px -3px 7px rgba(255,255,255,0.9)",
      }}
    >
      {checked && <Check size={19} strokeWidth={2.5} className="text-[var(--accent)] animate-checkpop" />}
    </button>
  );
}

/* ---------- Text / number input ---------- */
export function Field({
  label, value, onChange, type = "text", placeholder, step, min, max, className = "",
}: {
  label?: string; value: string | number; onChange: (v: string) => void;
  type?: string; placeholder?: string; step?: string | number; min?: string | number; max?: string | number; className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      {label && <span className="block text-xs font-medium text-[var(--ink-faint)] mb-1.5 tracking-wide uppercase">{label}</span>}
      <input
        type={type}
        value={value}
        step={step}
        min={min}
        max={max}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="focus-ring w-full rounded-xl px-4 py-3 text-[15px] bg-[var(--neo-base)] text-[var(--ink)]
          shadow-[inset_3px_3px_7px_rgba(58,56,82,0.1),inset_-3px_-3px_7px_rgba(255,255,255,0.75)]
          dark:shadow-[inset_3px_3px_8px_rgba(0,0,0,0.45),inset_-3px_-3px_7px_rgba(255,255,255,0.04)]
          border border-white/30 dark:border-white/5"
      />
    </label>
  );
}

/* ---------- Section heading: editorial serif, quiet ---------- */
export function SectionHeader({ icon, title, sub }: { icon?: React.ReactNode; title: string; sub?: string }) {
  return (
    <div className="flex items-start gap-3 mb-4">
      {icon && (
        <span className="mt-0.5 text-[var(--accent)]" aria-hidden>{icon}</span>
      )}
      <div>
        <h2 className="font-serif text-xl sm:text-2xl tracking-tight text-[var(--ink)]">{title}</h2>
        {sub && <p className="text-sm text-[var(--ink-soft)] mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

/* ---------- Warm empty state (never "No data") ---------- */
export function EmptyState({ icon, title, sub, action }: { icon: React.ReactNode; title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center py-10 px-6 animate-fade-up">
      <span className="mb-3 text-[var(--ink-faint)]" aria-hidden>{icon}</span>
      <p className="font-serif text-lg text-[var(--ink)]">{title}</p>
      {sub && <p className="text-sm text-[var(--ink-soft)] mt-1 max-w-xs">{sub}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ---------- Modal ---------- */
export function Modal({ open, onClose, title, children, wide }: {
  open: boolean; onClose?: () => void; title: string; children: React.ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose?.();
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-6 animate-fade-in" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-[rgba(24,22,38,0.45)] backdrop-blur-[6px]" onClick={onClose} />
      <GlassCard strong className={`relative w-full ${wide ? "max-w-2xl" : "max-w-md"} max-h-[86vh] overflow-y-auto p-6 animate-fade-up`}>
        <h3 className="font-serif text-xl mb-3 text-[var(--ink)]">{title}</h3>
        {children}
      </GlassCard>
    </div>
  );
}

/* ---------- Progress bar (topics coverage, etc.) ---------- */
export function ProportionBar({ segments, height = 10 }: { segments: Array<{ value: number; className: string; label: string }>; height?: number }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  if (!total) return <div className="w-full rounded-full bg-black/5 dark:bg-white/5" style={{ height }} />;
  return (
    <div className="w-full rounded-full overflow-hidden flex bg-black/5 dark:bg-white/5" style={{ height }} role="img" aria-label={segments.map((s) => `${s.label}: ${s.value}`).join(", ")}>
      {segments.map((s, i) => (
        <div key={i} className={`${s.className} transition-all duration-500`} style={{ width: `${(s.value / total) * 100}%` }} />
      ))}
    </div>
  );
}

/* ---------- Number that counts up gently ---------- */
export function CountUp({ value, decimals = 0, suffix = "" }: { value: number; decimals?: number; suffix?: string }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const from = 0;
    const dur = 900;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(from + (value - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{display.toFixed(decimals)}{suffix}</>;
}

/* ---------- Pill tag ---------- */
export function Tag({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "accent" | "warn" | "good" }) {
  const tones: Record<string, string> = {
    neutral: "bg-black/[0.05] text-[var(--ink-soft)] dark:bg-white/[0.07]",
    accent: "bg-accent-500/12 text-[var(--accent)]",
    warn: "bg-rose-500/12 text-rose-600 dark:text-rose-300",
    good: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300",
  };
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}
