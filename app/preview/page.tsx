"use client";
import Ring from "@/components/Ring";
import { BookOpenCheck, Wallet2, Repeat2, AlarmClock, ListChecks, ScrollText } from "lucide-react";

/**
 * Static, ungated replica of the Overview screen with realistic sample data —
 * rendered inside the landing page's phone mockup. No local data required.
 */

function PillarRow({ icon, name, value, detail }: { icon: React.ReactNode; name: string; value: number; detail: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[var(--ink-faint)] shrink-0" aria-hidden>{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[13px] font-medium text-[var(--ink)]">{name}</span>
          <span className="text-[13px] tabular-nums text-[var(--ink-soft)]">{value}%</span>
        </div>
        <div className="h-2 rounded-full bg-black/[0.06] dark:bg-white/[0.07] mt-1 overflow-hidden" style={{ borderRadius: 999 }}>
          <div className="h-full rounded-full bg-[var(--ink)]" style={{ width: `${value}%` }} />
        </div>
        <p className="text-[11px] text-[var(--ink-faint)] mt-0.5">{detail}</p>
      </div>
    </div>
  );
}

const WEEK = [
  { d: "M", v: 64 }, { d: "T", v: 81 }, { d: "W", v: 58 },
  { d: "T", v: 88 }, { d: "F", v: 92 }, { d: "S", v: 74 }, { d: "S", v: 78 },
];

export default function PreviewPage() {
  return (
    <div className="min-h-screen px-3 pt-5 pb-6 space-y-3 text-[13px]" style={{ background: "var(--page)" }}>
      {/* Greeting */}
      <div>
        <p className="text-[10px] text-[var(--ink-faint)]">Friday, September 4</p>
        <h1 className="font-serif text-[22px] tracking-tight text-[var(--ink)] mt-0.5">Good evening, Ada.</h1>
        <p className="text-[11px] text-[var(--ink-soft)] mt-0.5">Day 34 of 160 — running at 78% today.</p>
        <div className="mt-2 h-1.5 rounded-full bg-black/[0.06] dark:bg-white/[0.07] overflow-hidden">
          <div className="h-full bg-[var(--ink)] rounded-full" style={{ width: "21%" }} />
        </div>
      </div>

      {/* Ring + pillars */}
      <div className="glass rounded-3xl p-4">
        <div className="flex items-center gap-4">
          <Ring percent={78} size={112} thickness={9} label="Today" />
          <div className="flex-1 space-y-2.5 min-w-0">
            <PillarRow icon={<BookOpenCheck size={13} aria-hidden />} name="Academics" value={83} detail="4/5 plan items" />
            <PillarRow icon={<Wallet2 size={13} aria-hidden />} name="Finance" value={70} detail="₦1,400 logged" />
            <PillarRow icon={<Repeat2 size={13} aria-hidden />} name="Routines" value={80} detail="4/5 done" />
          </div>
        </div>
      </div>

      {/* Exam reminder */}
      <div className="glass rounded-2xl p-3 flex items-center gap-3">
        <span className="neo-sm w-9 h-9 rounded-xl flex items-center justify-center shrink-0" aria-hidden><AlarmClock size={15} /></span>
        <div className="min-w-0">
          <p className="font-semibold text-[12.5px] text-[var(--ink)]">CSC141 exam in 3 days</p>
          <p className="text-[10.5px] text-[var(--ink-soft)] truncate">Mon, Sep 7 · 9:00 · Hall 2</p>
        </div>
      </div>

      {/* Checklist */}
      <div className="glass rounded-3xl p-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--ink-faint)] flex items-center gap-1.5 mb-2.5">
          <ListChecks size={12} aria-hidden /> Plan for Friday
        </p>
        <ul className="space-y-2">
          {[
            { t: "CSC141 — 2 hours", done: true },
            { t: "MTH102 problem set", done: true },
            { t: "Gym", done: true },
            { t: "GST105 summary", done: false },
          ].map((it) => (
            <li key={it.t} className="flex items-center gap-2.5 neo rounded-xl px-3 py-2">
              <span
                className="flex h-[16px] w-[16px] items-center justify-center rounded-md border shrink-0"
                style={it.done ? { background: "var(--ink)", borderColor: "var(--ink)" } : { borderColor: "var(--ink-faint)", opacity: 0.7 }}
              >
                {it.done && (
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="var(--page)" strokeWidth="3.5" aria-hidden>
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
              </span>
              <span className={`text-[12px] truncate ${it.done ? "line-through text-[var(--ink-faint)]" : "text-[var(--ink)]"}`}>{it.t}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Money */}
      <div className="glass rounded-3xl p-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--ink-faint)] flex items-center gap-1.5 mb-1.5">
          <Wallet2 size={12} aria-hidden /> This week's money
        </p>
        <div className="flex items-end justify-between">
          <div>
            <p className="font-serif text-[24px] text-[var(--ink)]">₦4,300</p>
            <p className="text-[10.5px] text-[var(--ink-soft)]">₦5,700 spent of ₦10,000</p>
          </div>
          <div className="flex items-end gap-1 h-9" aria-hidden>
            {[42, 68, 30, 55, 48].map((h, i) => (
              <span key={i} className="w-3.5 rounded-t" style={{ height: `${h}%`, background: "var(--ink)", opacity: i === 4 ? 1 : 0.3 }} />
            ))}
          </div>
        </div>
        <p className="text-[10.5px] text-[var(--ink-soft)] mt-1">Savings target made — ₦4,300 kept.</p>
      </div>

      {/* Digest highlight */}
      <div className="letter-card rounded-2xl p-3.5">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-faint)] flex items-center gap-1.5 mb-1">
          <ScrollText size={11} aria-hidden /> From your weekly letter
        </p>
        <p className="font-serif text-[12px] leading-snug text-[var(--ink)] line-clamp-2" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          Your pace held steady this week — plan completion climbed from 61% to 74%, and that is the number doing the quiet work.
        </p>
      </div>

      {/* Week strip */}
      <div className="glass rounded-3xl p-4">
        <div className="flex justify-between gap-1.5">
          {WEEK.map((d, i) => (
            <div key={i} className="flex flex-col items-center gap-1 flex-1">
              <span className={`text-[8px] uppercase ${i === 4 ? "font-bold text-[var(--ink)]" : "text-[var(--ink-faint)]"}`}>{d.d}</span>
              <div className="w-full rounded-full" style={{
                height: 30,
                background: `linear-gradient(to top, var(--ink) ${d.v}%, rgba(120,116,130,0.12) ${d.v}%)`,
                opacity: i === 4 ? 1 : 0.55,
                outline: i === 4 ? "1.5px solid var(--ink)" : "none",
                outlineOffset: 1.5,
              }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
