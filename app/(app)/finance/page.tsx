"use client";
import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Wallet2, Plus, TrendingDown, PiggyBank, ReceiptText } from "lucide-react";
import { db, Expense } from "@/lib/db";
import { GlassCard, SectionHeader, Field, NeoButton, Tag, EmptyState, Modal } from "@/components/ui";
import { useToday } from "@/components/AppShell";
import { daySpendClass, weekBalance } from "@/lib/calc";
import { fmtMoney, prettyDate, weekStartOnOrBefore, todayStr, DAY_SHORT } from "@/lib/dates";

export default function FinancePage() {
  const today = useToday();
  const [showAdd, setShowAdd] = useState(false);
  const [showAdjust, setShowAdjust] = useState(false);

  const fs = useLiveQuery(() => db.finance_settings.toArray(), []);
  const weeks = useLiveQuery(() => db.finance_weeks.toArray(), []);
  const expenses = useLiveQuery(() => db.expenses.toArray(), []);

  const settings = fs?.[0];

  const week = useMemo(() => {
    if (!weeks?.length || !settings) return undefined;
    const ws = weekStartOnOrBefore(today, settings.allowance_collection_day);
    return weeks.find((w) => w.week_start_date === ws);
  }, [weeks, settings, today]);

  const weekExpenses = useMemo(
    () => (expenses ?? []).filter((e) => week && e.finance_week_id === week.id),
    [expenses, week]
  );
  const bal = week ? weekBalance(week, expenses ?? []) : null;

  const wants = weekExpenses.filter((e) => e.tag === "want");
  const needs = weekExpenses.filter((e) => e.tag === "need");
  const wantTotal = wants.reduce((a, e) => a + e.amount, 0);
  const needTotal = needs.reduce((a, e) => a + e.amount, 0);

  const days = useMemo(() => {
    if (!week || !settings) return [];
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(week.week_start_date + "T00:00:00");
      d.setDate(d.getDate() + i);
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const dayEx = weekExpenses.filter((e) => e.date === ds);
      return { ds, day: DAY_SHORT[d.getDay()], total: dayEx.reduce((a, e) => a + e.amount, 0), cls: daySpendClass(dayEx, settings.daily_spending_target) };
    });
  }, [week, weekExpenses, settings]);

  const cycleEnd = week ? days[6] : null;
  const isCycleEnd = cycleEnd ? cycleEnd.ds === today || cycleEnd.ds < today : false;
  const saved = bal ? Math.max(0, bal.balance - 0) : 0;
  const savingsOk = settings ? saved >= settings.weekly_savings_target : false;

  return (
    <div className="space-y-6 pb-8 max-w-3xl mx-auto">
      <div className="flex items-end justify-between animate-fade-up">
        <div>
          <h1 className="font-serif text-3xl sm:text-4xl tracking-tight text-[var(--ink)]">Finance</h1>
          <p className="text-sm text-[var(--ink-soft)] mt-1">
            {week ? `Week of ${prettyDate(week.week_start_date)}${week.rollover_from_previous ? ` — with ${fmtMoney(week.rollover_from_previous)} rolled over` : ""}` : "Your first allowance week opens here."}
          </p>
        </div>
        <NeoButton variant="accent" onClick={() => setShowAdd(true)} className="font-semibold">
          <span className="inline-flex items-center gap-2"><Plus size={16} aria-hidden /> Add expense</span>
        </NeoButton>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-fade-up [animation-delay:80ms]">
        <GlassCard className="p-5">
          <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--ink-faint)] flex items-center gap-1.5"><Wallet2 size={12} aria-hidden /> Balance</p>
          <p className="font-serif text-2xl sm:text-3xl mt-2 text-[var(--ink)]">{bal ? fmtMoney(bal.balance) : "—"}</p>
        </GlassCard>
        <GlassCard className="p-5">
          <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--ink-faint)] flex items-center gap-1.5"><ReceiptText size={12} aria-hidden /> Spent this week</p>
          <p className="font-serif text-2xl sm:text-3xl mt-2 text-[var(--ink)]">{bal ? fmtMoney(bal.spent) : "—"}</p>
        </GlassCard>
        <GlassCard className="p-5">
          <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--ink-faint)] flex items-center gap-1.5"><TrendingDown size={12} aria-hidden /> Wants / needs</p>
          <p className="font-serif text-2xl sm:text-3xl mt-2 text-[var(--ink)]">{fmtMoney(wantTotal)} <span className="text-sm text-[var(--ink-faint)]">/ {fmtMoney(needTotal)}</span></p>
        </GlassCard>
        <GlassCard className="p-5">
          <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--ink-faint)] flex items-center gap-1.5"><PiggyBank size={12} aria-hidden /> Savings check</p>
          <p className="font-serif text-2xl sm:text-3xl mt-2" style={{ color: savingsOk ? "#10b981" : "var(--ink)" }}>{settings ? fmtMoney(saved) : "—"}</p>
          <p className="text-[11px] mt-1">{settings ? `target ${fmtMoney(settings.weekly_savings_target)} — ${savingsOk ? "made it" : "not yet"}` : ""}</p>
        </GlassCard>
      </div>

      {/* Daily spend chart vs target */}
      {days.length > 0 && settings && (
        <GlassCard className="p-5 animate-fade-up [animation-delay:140ms] ledger">
          <SectionHeader title="Spending trend" sub={`Daily pace against your ${fmtMoney(settings.daily_spending_target)} target.`} />
          <ForexTrendChart
            days={days.map((d) => ({ ...d, amount: d.total }))}
            target={settings.daily_spending_target}
          />
          <div className="h-px bg-black/5 dark:bg-white/5 my-4" />
          <div className="space-y-2">
            {weekExpenses.slice(-5).reverse().map((e) => (
              <div key={e.id} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-[var(--ink)]">
                  <Tag tone={e.tag === "want" ? "warn" : "good"}>{e.tag}</Tag>
                  {e.note || "—"} <span className="text-[var(--ink-faint)]">{prettyDate(e.date)}</span>
                </span>
                <span className="tabular-nums">{fmtMoney(e.amount)}</span>
              </div>
            ))}
            {weekExpenses.length === 0 && <EmptyState icon={<ReceiptText size={22} aria-hidden />} title="Nothing spent this week" sub="Quiet weeks are allowed." />}
          </div>
          {isCycleEnd && settings && (
            <CycleVerdict
              days={days}
              saved={saved}
              target={settings.weekly_savings_target}
              currency={undefined}
            />
          )}
        </GlassCard>
      )}

      <AddExpenseModal open={showAdd} onClose={() => setShowAdd(false)} weekId={week?.id} today={today} />
      <AdjustBalanceModal open={showAdjust} onClose={() => setShowAdjust(false)} week={week} />
    </div>
  );
}

function AddExpenseModal({ open, onClose, weekId, today }: { open: boolean; onClose: () => void; weekId?: number; today: string }) {
  const [amount, setAmount] = useState("");
  const [tag, setTag] = useState<"want" | "need">("need");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { setErr("An amount above zero, please."); return; }
    if (!weekId) { setErr("Open your finance week first (set your allowance in Settings)."); return; }
    const ex: Expense = { finance_week_id: weekId, date: todayStr() || today, amount: amt, tag, note: note.trim() };
    await db.expenses.add(ex);
    setAmount(""); setNote(""); setErr("");
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Add an expense">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Amount" value={amount} onChange={setAmount} type="number" placeholder="0.00" />
        <div>
          <p className="text-xs font-medium text-[var(--ink-faint)] mb-2 uppercase tracking-wide">Want or need?</p>
          <div className="grid grid-cols-2 gap-3">
            {(["need", "want"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTag(t)}
                aria-pressed={tag === t}
                className={`focus-ring rounded-xl px-4 py-3 text-sm font-medium min-h-[44px] transition-all ${tag === t ? "neo-pressed text-[var(--accent)]" : "neo text-[var(--ink-soft)]"}`}
              >
                {t === "need" ? "Need" : "Want"}
                <span className="block text-[11px] font-normal opacity-75">{t === "need" ? "essential, planned" : "nice-to-have"}</span>
              </button>
            ))}
          </div>
        </div>
        <Field label="Note" value={note} onChange={setNote} placeholder="lunch, data, haircut…" />
        {err && <p className="text-sm text-amber-600 dark:text-amber-300">{err}</p>}
        <div className="flex justify-end gap-2">
          <NeoButton onClick={onClose}>Cancel</NeoButton>
          <NeoButton type="submit" variant="accent" className="font-semibold">Save</NeoButton>
        </div>
      </form>
    </Modal>
  );
}

/** Modal: manually correct the balance (extra money from any source, or a correction). */
function AdjustBalanceModal({ open, onClose, week }: { open: boolean; onClose: () => void; week?: { id?: number; opening_balance: number } }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  return (
    <Modal open={open} onClose={onClose} title="Add funds">
      <p className="text-sm text-[var(--ink-soft)] mb-4">
        Any money beyond your allowance — a gift, payment for work, a larger collection, anything — goes in here, whenever it happens. Your balance updates by the amount; use a negative number to correct downward. Collected less than usual on allowance day? Log the shortfall as a regular expense instead.
      </p>
      {week?.id ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const amt = parseFloat(amount);
            if (isNaN(amt) || amt === 0) return;
            await db.finance_weeks.update(week.id!, {
              opening_balance: week.opening_balance + amt,
            });
            setAmount(""); setNote(""); onClose();
          }}
          className="space-y-4"
        >
          <Field label="Amount (negative to reduce)" value={amount} onChange={setAmount} type="number" placeholder="+2000 or -500" />
          <Field label="Note (optional)" value={note} onChange={setNote} />
          <div className="flex justify-end gap-2">
            <NeoButton onClick={onClose}>Cancel</NeoButton>
            <NeoButton type="submit" variant="accent" className="font-semibold">Apply</NeoButton>
          </div>
        </form>
      ) : (
        <p className="text-sm text-[var(--ink-soft)]">No week is open yet — your allowance week opens on collection day.</p>
      )}
    </Modal>
  );
}

/** Professional cycle-end verdict: per-day classification + exact savings outcome. */
function CycleVerdict({ days, saved, target, currency }: {
  days: Array<{ ds: string; day: string; total: number; cls: string }>;
  saved: number;
  target: number;
  currency?: string;
}) {
  const verdict = target > 0
    ? saved > target * 1.05 ? { label: "Oversaved", tone: "good" as const }
    : saved < target * 0.95 ? { label: "Undersaved", tone: "warn" as const }
    : { label: "Saved as planned", tone: "good" as const }
    : null;
  return (
    <div className="mt-5 rounded-2xl neo-pressed p-4 sm:p-5">
      <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--ink-faint)] mb-3">End-of-cycle verdict</p>
      <div className="grid grid-cols-7 gap-1.5 mb-4">
        {days.map((d) => (
          <div key={d.ds} className="text-center">
            <div
              className={`h-10 rounded-lg flex items-center justify-center text-[10px] font-semibold
                ${d.cls === "overspent" ? "bg-rose-500/15 text-rose-600 dark:text-rose-300"
                  : d.cls === "underspent" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300"
                  : "bg-black/[0.05] dark:bg-white/[0.06] text-[var(--ink-soft)]"}`}
              title={`${d.day}: ${d.total} (${d.cls})`}
              role="img"
              aria-label={`${d.day}: spent ${d.total}, ${d.cls}`}
            >
              {d.total > 0 ? Math.round(d.total / 1000) + "k" : "—"}
            </div>
            <span className="text-[9px] text-[var(--ink-faint)] mt-1 block">{d.day}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-[var(--ink-soft)]">
          {days.filter((d) => d.cls === "overspent").length} day(s) over, {days.filter((d) => d.cls === "underspent").length} under, {days.filter((d) => d.cls === "on target").length} on target.
        </span>
        {verdict && (
          <span className="flex items-center gap-2 font-medium">
            {fmtMoney(saved, currency)} saved — {verdict.label}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Forex-style spending trend: a monochrome line chart with horizontal
 * gridlines, price-style axis labels, an area fill, and a dashed daily-target
 * reference line — the way a market chart reads.
 */
function ForexTrendChart({ days, target }: {
  days: Array<{ ds: string; day: string; amount: number }>;
  target: number;
}) {
  const W = 640, H = 220, PADL = 56, PADR = 14, PADT = 14, PADB = 26;
  const amounts = days.map((d) => d.amount);
  const rawMax = Math.max(target * 1.35, ...amounts, 1);
  const step = niceStep(rawMax / 3);
  const max = Math.ceil(rawMax / step) * step;
  const x = (i: number) => PADL + (i / Math.max(1, days.length - 1)) * (W - PADL - PADR);
  const y = (v: number) => PADT + (1 - v / max) * (H - PADT - PADB);

  const pts = days.map((d, i) => [x(i), y(d.amount)] as const);
  const line = pts.map(([px, py], i) => `${i === 0 ? "M" : "L"} ${px.toFixed(1)} ${py.toFixed(1)}`).join(" ");
  const area = `${line} L ${x(days.length - 1).toFixed(1)} ${H - PADB} L ${x(0).toFixed(1)} ${H - PADB} Z`;

  const gridVals = [0, step, step * 2, step * 3].filter((v) => v <= max);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Daily spending trend against a ${target} target`}>
        <defs>
          <linearGradient id="fxArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--ink)" stopOpacity="0.16" />
            <stop offset="100%" stopColor="var(--ink)" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {/* horizontal gridlines + axis labels (forex-style) */}
        {gridVals.map((v) => (
          <g key={v}>
            <line x1={PADL} y1={y(v)} x2={W - PADR} y2={y(v)} stroke="rgba(140,136,150,0.22)" strokeWidth="1" strokeDasharray={v === 0 ? "" : "2 4"} />
            <text x={PADL - 8} y={y(v) + 3.5} textAnchor="end" fontSize="9.5" fill="var(--ink-faint)" fontWeight="600">
              {Math.round(v) >= 1000 ? `${(Math.round(v) / 1000).toFixed(1).replace(/\.0$/, "")}k` : Math.round(v)}
            </text>
          </g>
        ))}

        {/* daily-target reference line */}
        <line x1={PADL} y1={y(target)} x2={W - PADR} y2={y(target)} stroke="var(--ink)" strokeWidth="1.2" strokeDasharray="5 4" opacity="0.55" />
        <text x={W - PADR} y={y(target) - 5} textAnchor="end" fontSize="9" fill="var(--ink-faint)" fontWeight="700">TARGET</text>

        {/* area + trend line */}
        <path d={area} fill="url(#fxArea)" />
        <path d={line} fill="none" stroke="var(--ink)" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />

        {/* session dots */}
        {pts.map(([px, py], i) => (
          <circle key={i} cx={px} cy={py} r={i === pts.length - 1 ? 4 : 2.6}
            fill={days[i].amount > target ? "var(--ink)" : "var(--page)"}
            stroke="var(--ink)" strokeWidth="1.6" >
            <title>{`${days[i].day}: ${days[i].amount}`}</title>
          </circle>
        ))}

        {/* day labels along the bottom */}
        {days.map((d, i) => (
          <text key={d.ds} x={x(i)} y={H - 8} textAnchor="middle" fontSize="9.5"
            fill={i === days.length - 1 ? "var(--ink)" : "var(--ink-faint)"} fontWeight={i === days.length - 1 ? "700" : "500"}>
            {d.day}
          </text>
        ))}
      </svg>
    </div>
  );
}

/** Round to a tidy axis step (forex-chart gridline feel). */
function niceStep(raw: number): number {
  const pow = Math.pow(10, Math.floor(Math.log10(Math.max(1, raw))));
  const norm = raw / pow;
  const mult = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return mult * pow;
}
