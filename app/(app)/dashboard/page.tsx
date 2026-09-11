"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import {
  BookOpenCheck, Wallet2, Repeat2, ArrowRight, Mail, MoonStar, AlarmClock, TrendingUp, ReceiptText, Hourglass,
} from "lucide-react";
import { db } from "@/lib/db";
import { GlassCard, SectionHeader, NeoButton } from "@/components/ui";
import Ring from "@/components/Ring";
import Checklist from "@/components/Checklist";
import { useToday } from "@/components/AppShell";
import {
  academicScore, financeScore, routineScore, isSickDay,
  daysUntilExam, examCountdownText, screenTimeScore, screenTimeStreak, // ← NEW
} from "@/lib/calc";
import { screenTimeAvailable } from "@/lib/screentime"; // ← NEW
import { fmtMoney, longDate, prettyDate, addDays, DAY_SHORT } from "@/lib/dates";

function fmtDur(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function DashboardPage() {
  const today = useToday();

  const profile = useLiveQuery(() => db.profile.toArray(), []);
  const planItems = useLiveQuery(() => db.daily_plan_items.where("date").equals(today).toArray(), [today]);
  const expenses = useLiveQuery(() => db.expenses.where("date").equals(today).toArray(), [today]);
  const routines = useLiveQuery(() => db.routines.toArray(), []);
  const routineLogs = useLiveQuery(() => db.routine_logs.where("date").equals(today).toArray(), [today]);
  const dailyLog = useLiveQuery(() => db.daily_logs.where("date").equals(today).toArray(), [today]);
  const fs = useLiveQuery(() => db.finance_settings.toArray(), []);
  const courses = useLiveQuery(() => db.courses.toArray(), []);
  const exams = useLiveQuery(() => db.exams.toArray(), []);
  const financeWeeks = useLiveQuery(() => db.finance_weeks.toArray(), []);
  const emailItems = useLiveQuery(
    () => db.email_items.where("fetched_date").equals(today).toArray(),
    [today]
  );
  const weekScores = useLiveQuery(() => db.discipline_scores.toArray(), []);
  const expensesAll = useLiveQuery(() => db.expenses.toArray(), []);
  const dailyLogs = useLiveQuery(() => db.daily_logs.toArray(), []); // ← NEW: yesterday's minutes
  const tracking = useLiveQuery(() => db.screentime_tracking.get(0), []); // ← NEW: goal + enabled

  const name = profile?.[0]?.name?.split(" ")[0] ?? "friend";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const sick = isSickDay(dailyLog ?? [], today);

  // ← NEW: screen-time pillar inputs (same logic as Overview — keep both in sync)
  const stActive = screenTimeAvailable() && tracking?.enabled === 1;
  const goalMinutes = tracking?.daily_goal_minutes ?? 300;
  const yesterdayLog = useMemo(
    () => (dailyLogs ?? []).find((l) => l.date === addDays(today, -1)) ?? null,
    [dailyLogs, today]
  );
  const yesterdayMinutes = typeof yesterdayLog?.screen_time_minutes === "number"
    ? (yesterdayLog.screen_time_minutes as number)
    : null;

  const pillars = useMemo(() => {
    const a = academicScore(planItems ?? []);
    const f = sick ? null : financeScore(expenses ?? [], fs?.[0]?.daily_spending_target ?? 0);
    const r = routineScore(routines ?? [], routineLogs ?? [], today);
    const s = stActive && !sick ? screenTimeScore(yesterdayMinutes, goalMinutes) : null; // ← NEW
    const vals = [a, f, r, s].filter((v): v is number => v != null);
    const overall = vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : 0;
    return { a, f, r, s, overall }; // ← NEW: s added
  }, [planItems, expenses, routines, routineLogs, fs, sick, today, stActive, yesterdayMinutes, goalMinutes]); // ← NEW deps

  // Persist today's discipline snapshot (patterns, not single days).
  useEffect(() => {
    if (!planItems || !planItems.length) return;
    (async () => {
      const existing = await db.discipline_scores.where("date").equals(today).toArray();
      const payload = {
        academic_score: pillars.a,
        finance_score: pillars.f,
        routine_score: pillars.r,
        screen_time_score: pillars.s, // ← NEW: stored so the weekly digest can use it
        overall_score: pillars.overall,
      };
      if (existing[0]) await db.discipline_scores.update(existing[0].id!, payload);
      else await db.discipline_scores.add({ date: today, ...payload });
    })();
  }, [planItems, pillars.a, pillars.f, pillars.r, pillars.s, pillars.overall, today]);

  const balance = useMemo(() => {
    if (!financeWeeks?.length || !expensesAll) return null;
    const week = financeWeeks[financeWeeks.length - 1];
    const spent = expensesAll.filter((e) => e.finance_week_id === week.id).reduce((a, e) => a + e.amount, 0);
    return { balance: week.opening_balance - spent, week };
  }, [financeWeeks, expensesAll]);

  const nextExam = useMemo(() => {
    if (!exams?.length || !courses) return null;
    const upcoming = exams
      .map((ex) => ({ ex, course: courses.find((c) => c.id === ex.course_id), days: daysUntilExam(ex.exam_date) })
      .filter((x) => x.course && x.days >= 0)
      .sort((a, b) => a.days - b.days);
    return upcoming[0] ?? null;
  }, [exams, courses]);

  const weekStrip = useMemo(() => {
    if (!weekScores) return [];
    const todayDay = new Date(today + "T00:00:00").getDay();
    const dayOfWeekMap: { [key: string]: string } = { 0: "S", 1: "M", 2: "T", 3: "W", 4: "T", 5: "F", 6: "S" };
    return Array.from({ length: 7 }).map((_, i) => {
      const d = addDays(today, i - 6);
      const row = weekScores.find((s) => s.date === d);
      return { date: d, day: dayOfWeekMap[new Date(d + "T00:00:00").getDay()], score: row?.overall_score };
    });
  }, [weekScores, today]);

  const routinesToday = useMemo(() => {
    const todayDay = new Date(today + "T00:00:00").getDay();
    return (routines ?? []).filter((r) => r.schedule_days.includes(todayDay));
  }, [routines, today]);

  const routinesDone = useMemo(() => {
    return routinesToday.filter((r) =>
      (routineLogs ?? []).some((l) => l.routine_id === r.id && l.status === "done")
    );
  }, [routinesToday, routineLogs]);

  const important = useMemo(() => {
    return (emailItems ?? []).filter((e) => e.rank === "important");
  }, [emailItems]);

  const reflected = useMemo(() => {
    return (dailyLog ?? []).some((l) => l.evening_reflection_text?.trim());
  }, [dailyLog]);

  const planDone = useMemo(() => {
    return (planItems ?? []).filter((i) => i.checked).length;
  }, [planItems]);

  const planTotal = planItems?.length ?? 0;

  // ← NEW: detail line for the 4th pillar row.
  const stStreak = useMemo(
    () => (stActive ? screenTimeStreak(dailyLogs ?? [], goalMinutes) : 0),
    [dailyLogs, goalMinutes, stActive]
  );
  const scrDetail = (() => {
    if (sick) return "rest day — not scored";
    if (!stActive) return "";
    if (yesterdayMinutes == null) return "yesterday: no data yet — builds as days are logged";
    const base = `yesterday: ${fmtDur(yesterdayMinutes)} of ${fmtDur(goalMinutes)} goal`;
    return stStreak > 0 ? `${base} · ${stStreak}d under-goal streak` : base;
  })();

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div className="animate-fade-up">
        <p className="text-sm text-[var(--ink-faint)]">{longDate(new Date())}</p>
        <h1 className="font-serif text-3xl sm:text-4xl tracking-tight text-[var(--ink)] mt-1">
          {greeting}, {name}.
        </h1>
        <p className="text-[var(--ink-soft)] mt-1.5 text-[15px]">
          {sick
            ? "You're under the weather today — nothing counts against you. Rest well."
            : planTotal === 0
              ? "The day is unwritten. A short plan goes a long way."
              : planDone === planTotal
                ? "Everything on today's plan is done. That's the whole game."
                : `${planDone} of ${planTotal} done so far. Steady.`}
        </p>
      </div>

      {/* Exam countdown banner */}
      {nextExam && nextExam.days <= 21 && (
        <Link href="/academics" className="focus-ring block animate-fade-up [animation-delay:100ms]">
          <GlassCard className="p-4 sm:p-5 flex items-center gap-4 hover:-translate-y-0.5 transition-transform">
            <span className="neo-sm w-11 h-11 rounded-xl flex items-center justify-center text-[var(--accent)] shrink-0" aria-hidden>
              <AlarmClock size={20} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-[var(--ink)]">
                {nextExam.course!.code} exam {examCountdownText(nextExam.days)}
              </p>
              <p className="text-sm text-[var(--ink-soft)] truncate">
                {prettyDate(nextExam.ex.exam_date)}
                {nextExam.ex.start_time ? ` at ${nextExam.ex.start_time}` : ""}
                {nextExam.ex.venue ? ` — ${nextExam.ex.venue}` : ""}
              </p>
            </div>
            <ArrowRight size={18} className="text-[var(--ink-faint)]" aria-hidden />
          </GlassCard>
        </Link>
      )}

      {/* Hero: ring + daily measures */}
      <GlassCard strong className="p-6 sm:p-8 animate-fade-up [animation-delay:150ms]">
        <div className="flex flex-col sm:flex-row items-center gap-8 sm:gap-12">
          <div>
            {sick
              ? <Ring percent={0} label="Rest day" sublabel="not scored" />
              : <Ring percent={pillars.overall} label="Discipline" sublabel="today" />}
          </div>
          <div className="flex-1 w-full space-y-3">
            <PillarRow
              icon={<BookOpenCheck size={17} aria-hidden />} name="Today's Plan"
              value={pillars.a} detail={planTotal ? `${planDone}/${planTotal} done` : "no plan yet"}
            />
            <PillarRow
              icon={<Wallet2 size={17} aria-hidden />} name="Finance"
              value={pillars.f} detail={sick ? "rest day — not scored" : expenses?.length ? `${expenses.length} expense${expenses.length > 1 ? "s" : ""} logged` : "nothing spent yet"}
            />
            <PillarRow
              icon={<Repeat2 size={17} aria-hidden />} name="Routines"
              value={pillars.r} detail={routinesToday.length ? `${routinesDone.length}/${routinesToday.length} done today` : "nothing scheduled today"}
            />
            {/* ← NEW: 4th pillar — only when tracking is on */}
            {stActive && (
              <PillarRow
                icon={<Hourglass size={17} aria-hidden />} name="Screen time"
                value={pillars.s} detail={scrDetail}
              />
            )}
          </div>
        </div>
      </GlassCard>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 animate-fade-up [animation-delay:220ms]">
        <TopicsStatCard />
        <GlassCard className="p-5">
          <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--ink-faint)] flex items-center gap-1.5"><Wallet2 size={12} aria-hidden /> Balance</p>
          <p className="font-serif text-3xl mt-2 text-[var(--ink)]">{balance ? fmtMoney(balance.balance) : "—"}</p>
          <p className="text-xs text-[var(--ink-soft)] mt-1">{balance ? `week of ${prettyDate(balance.week.week_start_date)}` : "no week open"}</p>
        </GlassCard>
        <GlassCard className="p-5 col-span-2 lg:col-span-1">
          <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--ink-faint)] flex items-center gap-1.5"><Repeat2 size={12} aria-hidden /> Today's routines</p>
          <p className="font-serif text-3xl mt-2 text-[var(--ink)]">{routinesDone.length}<span className="text-lg text-[var(--ink-faint)]">/{routinesToday.length}</span></p>
          <p className="text-xs text-[var(--ink-soft)] mt-1">{routinesToday.length ? "keep the streaks alive" : "a restful day"}</p>
        </GlassCard>
      </div>

      {/* Checklist preview */}
      <div className="animate-fade-up [animation-delay:280ms]">
        <SectionHeader icon={<BookOpenCheck size={20} aria-hidden />} title="Today's Plan" sub="Tick them off as you go — each check counts." />
        <GlassCard className="p-5">
          <Checklist compact />
        </GlassCard>
      </div>

      {/* 9pm spending check-in */}
      {hour >= 21 && (expenses ?? []).length === 0 && (
        <SpendCheckIn today={today} />
      )}

      {/* Email strip */}
      <div className="animate-fade-up [animation-delay:340ms]">
        <Link href="/inbox" className="focus-ring block">
          <GlassCard className="p-5 hover:-translate-y-0.5 transition-transform">
            <div className="flex items-center gap-4">
              <span className="neo-sm w-11 h-11 rounded-xl flex items-center justify-center text-[var(--accent)]" aria-hidden><Mail size={19} /></span>
              <div className="flex-1 min-w-0">
                {emailItems == null ? (
                  <p className="text-sm text-[var(--ink-soft)]">Checking today's mail…</p>
                ) : emailItems.length === 0 ? (
                  <>
                    <p className="font-semibold text-[var(--ink)]">Your inbox, triaged</p>
                    <p className="text-sm text-[var(--ink-soft)]">Connect a Gmail account and Reso will boil each day's mail down to what matters. Optional, always.</p>
                  </>
                ) : (
                  <>
                    <p className="font-semibold text-[var(--ink)]">{important.length} need${important.length === 1 ? "s" : ""} your attention today</p>
                    <p className="text-sm text-[var(--ink-soft)] truncate">
                      {important[0] ? `${important[0].summary || important[0].subject}` : "nothing urgent — the rest can wait"}
                    </p>
                  </>
                )}
              </div>
              <ArrowRight size={18} className="text-[var(--ink-faint)]" aria-hidden />
            </div>
          </GlassCard>
        </Link>
      </div>

      {/* Evening reflection prompt */}
      {!reflected && hour >= 17 && (
        <Link href="/journal" className="focus-ring block animate-fade-up [animation-delay:400ms]">
          <GlassCard className="p-5 hover:-translate-y-0.5 transition-transform">
            <div className="flex items-center gap-4">
              <span className="neo-sm w-11 h-11 rounded-xl flex items-center justify-center text-[var(--accent)]" aria-hidden><MoonStar size={19} /></span>
              <div className="flex-1">
                <p className="font-semibold text-[var(--ink)]">How was today?</p>
                <p className="text-sm text-[var(--ink-soft)]">Two lines in the journal is plenty — type or speak, whichever is easier.</p>
              </div>
              <ArrowRight size={18} className="text-[var(--ink-faint)]" aria-hidden />
            </div>
          </GlassCard>
        </Link>
      )}

      {/* Week mini strip */}
      <div className="animate-fade-up [animation-delay:460ms]">
        <SectionHeader title="This week, at a glance" />
        <GlassCard className="p-5">
          <div className="flex justify-between gap-2">
            {weekStrip.map((d) => (
              <div key={d.date} className="flex flex-col items-center gap-2 flex-1">
                <span className={`text-[10px] uppercase tracking-wide ${d.date === today ? "text-[var(--accent)] font-semibold" : "text-[var(--ink-faint)]"}`}>{d.day}</span>
                <div
                  title={d.score != null ? `${Math.round(d.score)}%` : "no data"}
                  className={`w-full rounded-full ${d.date === today ? "ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-transparent" : ""}`}
                  style={{
                    height: 52,
                    background:
                      d.score == null
                        ? "rgba(120,116,150,0.12)"
                        : `linear-gradient(to top, var(--accent) ${d.score}%, rgba(120,116,150,0.12) ${d.score}%)`,
                    opacity: d.score == null ? 0.7 : Math.max(0.35, d.score / 100),
                  }}
                  role="img"
                  aria-label={`${d.day}: ${d.score != null ? Math.round(d.score) + " percent" : "no score"}`}
                />
              </div>
            ))}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

function PillarRow({ icon, name, value, detail }: { icon: React.ReactNode; name: string; value: number | null; detail: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[var(--ink-faint)] shrink-0" aria-hidden>{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-medium text-[var(--ink)]">{name}</span>
          <span className="text-sm tabular-nums text-[var(--ink-soft)]">{value == null ? "—" : `${Math.round(value)}%`}</span>
        </div>
        <div className="h-1.5 rounded-full bg-black/[0.06] dark:bg-white/[0.07] mt-1 overflow-hidden">
          <div
            className="h-full rounded-full bg-[var(--accent)] transition-all duration-1000"
            style={{ width: `${value ?? 0}%`, opacity: value == null ? 0 : 1 }}
          />
        </div>
        <p className="text-xs text-[var(--ink-faint)] mt-1">{detail}</p>
      </div>
    </div>
  );
}

/** Evening check-in: log the day's total spend; balance updates automatically. */
function SpendCheckIn({ today }: { today: string }) {
  const [amount, setAmount] = useState("");
  const [done, setDone] = useState(false);
  const weeks = useLiveQuery(() => db.finance_weeks.toArray(), []) ?? [];
  const week = weeks[weeks.length - 1];

  const log = async () => {
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0 || !week?.id) return;
    await db.expenses.add({ finance_week_id: week.id, date: today, amount: amt, tag: "need", note: "day total" });
    setAmount("");
    setDone(true);
  };

  if (done) {
    return (
      <GlassCard className="p-5 animate-fade-up">
        <p className="text-sm text-[var(--ink-soft)]">Logged. Your balance and the weekly picture are up to date — rest well.</p>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-5 animate-fade-up">
      <div className="flex items-center gap-4 mb-3">
        <span className="neo-sm w-11 h-11 rounded-xl flex items-center justify-center shrink-0" aria-hidden><ReceiptText size={19} /></span>
        <div>
          <p className="font-semibold">How much did you spend today?</p>
          <p className="text-sm text-[var(--ink-soft)]">One number is enough — your balance updates by itself.</p>
        </div>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); log(); }} className="flex gap-2 items-center">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          type="number"
          inputMode="decimal"
          aria-label="Total spent today"
          className="focus-ring flex-1 rounded-xl px-4 py-3 text-[15px] bg-[var(--neo-base)] border border-white/30 dark:border-white/5 shadow-[inset_3px_3px_7px_rgba(10,10,15,0.08),inset_-3px_-3px_7px_rgba(255,255,255,0.7)] dark:shadow-[inset_3px_3px_8px_rgba(0,0,0,0.5),inset_-3px_-3px_7px_rgba(255,255,255,0.04)]"
        />
        <NeoButton type="submit" variant="accent" className="font-semibold shrink-0">Log it</NeoButton>
      </form>
    </GlassCard>
  );
}

/** Topic coverage across all courses — engagement, not grades. */
function TopicsStatCard() {
  const topics = useLiveQuery(() => db.course_topics.toArray(), []) ?? [];
  const read = topics.filter((t) => t.status === "read" || t.status === "revising").length;
  return (
    <Link href="/academics" className="focus-ring block h-full">
      <GlassCard className="p-5 h-full hover:-translate-y-0.5 transition-transform">
        <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--ink-faint)] flex items-center gap-1.5"><TrendingUp size={12} aria-hidden /> Topic coverage</p>
        <p className="font-serif text-3xl mt-2 text-[var(--ink)]">{read}<span className="text-lg text-[var(--ink-faint)]">/{topics.length}</span></p>
        <p className="text-xs text-[var(--ink-soft)] mt-1">read or revising</p>
      </GlassCard>
    </Link>
  );
}
