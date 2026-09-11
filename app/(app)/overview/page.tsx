"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import {
  TrendingUp, Wallet2, Repeat2, BookOpenCheck, AlarmClock, ListChecks, ArrowRight,
  ReceiptText, ScrollText, Clock3, Hourglass,
} from "lucide-react";
import { db } from "@/lib/db";
import { GlassCard, SectionHeader, Tag, ProportionBar, NeoButton, Field, Modal } from "@/components/ui";
import Ring from "@/components/Ring";
import Checklist from "@/components/Checklist";
import { useToday } from "@/components/AppShell";
import {
  academicScore, financeScore, routineScore, isSickDay, daysUntilExam, examCountdownText, routineStreak,
  screenTimeScore, screenTimeStreak,
} from "@/lib/calc";
import { screenTimeAvailable } from "@/lib/screentime";
import { fmtMoney, longDate, prettyDate, weekStartOnOrBefore, addDays, daysBetween, DAY_NAMES, DAY_SHORT } from "@/lib/dates";

function fmtDur(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/**
 * Overview — the one deliberately rich screen: ring, daily measures, checklist,
 * money, reminders, digest highlight, and topic coverage, all live.
 */
export default function OverviewPage() {
  const today = useToday();
  const hour = new Date().getHours();
  const dow = new Date(today + "T00:00:00").getDay();

  const profile = useLiveQuery(() => db.profile.toArray(), []);
  const topics = useLiveQuery(() => db.course_topics.toArray(), []);
  const courses = useLiveQuery(() => db.courses.toArray(), []);
  const exams = useLiveQuery(() => db.exams.toArray(), []);
  const slots = useLiveQuery(() => db.timetable_slots.toArray(), []);
  const planItems = useLiveQuery(() => db.daily_plan_items.where("date").equals(today).toArray(), [today]);
  const expenses = useLiveQuery(() => db.expenses.where("date").equals(today).toArray(), [today]);
  const allExpenses = useLiveQuery(() => db.expenses.toArray(), []);
  const fs = useLiveQuery(() => db.finance_settings.toArray(), []);
  const weeks = useLiveQuery(() => db.finance_weeks.toArray(), []);
  const routines = useLiveQuery(() => db.routines.toArray(), []);
  const routineLogs = useLiveQuery(() => db.routine_logs.where("date").equals(today).toArray(), [today]);
  const logs = useLiveQuery(() => db.routine_logs.toArray(), []);
  const dailyLog = useLiveQuery(() => db.daily_logs.where("date").equals(today).toArray(), [today]);
  const weekScores = useLiveQuery(() => db.discipline_scores.toArray(), []);
  const digests = useLiveQuery(async () => {
    const all = await db.weekly_digests.toArray();
    return all.sort((a, b) => b.created_at - a.created_at).slice(0, 1);
  }, []);
  const dailyLogs = useLiveQuery(() => db.daily_logs.toArray(), []);
  const tracking = useLiveQuery(() => db.screentime_tracking.get(0), []);

  const p = profile?.[0];
  const settings = fs?.[0];
  const sick = isSickDay(dailyLog ?? [], today);
  const name = p?.name?.split(" ")[0] ?? "friend";
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const acad = academicScore(planItems ?? []);
  const fin = sick ? null : financeScore(expenses ?? [], settings?.daily_spending_target ?? 0);
  const rout = routineScore(routines ?? [], routineLogs ?? [], today);

  const goalMinutes = tracking?.daily_goal_minutes ?? 300;
  const stActive = screenTimeAvailable() && tracking?.enabled === 1;
  const yesterdayLog = useMemo(
    () => (dailyLogs ?? []).find((l) => l.date === addDays(today, -1)) ?? null,
    [dailyLogs, today]
  );
  const yesterdayMinutes = typeof yesterdayLog?.screen_time_minutes === "number"
    ? (yesterdayLog.screen_time_minutes as number)
    : null;
  const scr = stActive && !sick ? screenTimeScore(yesterdayMinutes, goalMinutes) : null;

  const pillars = [acad, fin, rout, scr].filter((v): v is number => v != null);
  const overall = pillars.length ? pillars.reduce((a, b) => a + b, 0) / pillars.length : null;

  const week = useMemo(() => {
    if (!weeks?.length || !settings) return undefined;
    const ws = weekStartOnOrBefore(today, settings.allowance_collection_day);
    return weeks.find((w) => w.week_start_date === ws);
  }, [weeks, settings, today]);

  const weekSpend = useMemo(() => {
    if (!week || !allExpenses) return 0;
    return allExpenses.filter((e) => e.finance_week_id === week.id).reduce((a, e) => a + e.amount, 0);
  }, [week, allExpenses]);

  const balance = useMemo(() => {
    if (!week) return null;
    return week.opening_balance - weekSpend;
  }, [week, weekSpend]);

  const balanceTrend = useMemo(() => {
    if (!weeks?.length || !allExpenses) return [];
    return weeks
      .slice()
      .sort((a, b) => a.week_start_date.localeCompare(b.week_start_date))
      .slice(-4)
      .map((w) => {
        const spent = allExpenses.filter((e) => e.finance_week_id === w.id).reduce((a, e) => a + e.amount, 0);
        return { week: w, balance: w.opening_balance - spent, saved: Math.max(0, w.opening_balance - spent) };
      });
  }, [weeks, allExpenses]);

  const nextExam = useMemo(() => {
    if (!exams?.length || !courses) return null;
    const up = exams
      .map((ex) => ({ ex, course: courses.find((c) => c.id === ex.course_id), days: daysUntilExam(ex.exam_date) }))
      .filter((x) => x.course && x.days >= 0)
      .sort((a, b) => a.days - b.days);
    return up[0] ?? null;
  }, [exams, courses]);

  const nextClass = useMemo(() => {
    const todays = (slots ?? []).filter((s) => s.day_of_week === dow).sort((a, b) => a.start_time.localeCompare(b.start_time));
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    return todays.find((s) => {
      const [h, m] = s.start_time.split(":").map(Number);
      return h * 60 + m >= nowMin;
    });
  }, [slots, dow]);

  const topicsSummary = useMemo(() => ({
    read: (topics ?? []).filter((t) => t.status === "read").length,
    revising: (topics ?? []).filter((t) => t.status === "revising").length,
    reading: (topics ?? []).filter((t) => t.status === "reading").length,
    untouched: (topics ?? []).filter((t) => t.status === "untouched").length,
    total: (topics ?? []).length,
  }), [topics]);

  const topStreak = useMemo(() => {
    const rows = (routines ?? []).map((r) => ({ name: r.name, s: routineStreak(r, logs ?? []) })).sort((a, b) => b.s - a.s);
    return rows[0] && rows[0].s > 0 ? rows[0] : null;
  }, [routines, logs]);

  const weekStrip = useMemo(() => {
    if (!weekScores) return [];
    return Array.from({ length: 7 }).map((_, i) => {
      const d = addDays(today, i - 6);
      const row = weekScores.find((s) => s.date === d);
      return { date: d, day: DAY_SHORT[new Date(d + "T00:00:00").getDay()], score: row?.overall_score };
    });
  }, [weekScores, today]);

  const semesterDay = p ? Math.max(0, daysBetween(p.semester_start_date, today) + 1) : 0;
  const semesterLen = p ? Math.max(1, daysBetween(p.semester_start_date, p.semester_end_date) + 1) : 1;
  const semesterPct = Math.min(100, Math.round((semesterDay / semesterLen) * 100));

  const latestDigest = digests?.[0];
  const digestPreview = latestDigest?.digest_text.split("\n").filter(Boolean).slice(0, 2).join(" ") ?? "";

  const routinesToday = useMemo(() => {
    return (routines ?? []).filter((r) => r.schedule_days.includes(dow));
  }, [routines, dow]);

  const doneCount = useMemo(() => {
    return routinesToday.filter((r) => (logs ?? []).some((l) => l.routine_id === r.id && l.status === "done")).length;
  }, [routinesToday, logs]);

  const planDone = useMemo(() => {
    return (planItems ?? []).filter((i) => i.checked).length;
  }, [planItems]);

  const planTotal = planItems?.length ?? 0;

  return (
    <div className="space-y-6">
      {/* Greeting + semester position */}
      <div className="animate-fade-up">
        <p className="text-sm text-[var(--ink-faint)]">{longDate(new Date())}</p>
        <h1 className="font-serif text-3xl sm:text-4xl tracking-tight mt-1">{greeting}, {name}.</h1>
        <p className="text-[var(--ink-soft)] mt-1.5 text-[15px]">
          {sick
            ? "You're under the weather today — nothing counts against you."
            : overall != null
              ? `Day ${semesterDay} of ${semesterLen} — running at ${Math.round(overall)}% today.`
              : `Day ${semesterDay} of ${semesterLen}.`}
        </p>
        <div className="mt-3 h-1.5 rounded-full bg-black/[0.06] dark:bg-white/[0.07] overflow-hidden" aria-label={`Semester ${semesterPct}% complete`}>
          <div className="h-full bg-[var(--ink)] transition-all duration-1000" style={{ width: `${semesterPct}%` }} />
        </div>
      </div>

      {/* Hero ring + daily measures */}
      <GlassCard strong className="p-6 sm:p-8 animate-fade-up [animation-delay:100ms]">
        <div className="flex flex-col sm:flex-row items-center gap-8 sm:gap-12">
          <div>
            {sick ? <Ring percent={0} label="Rest day" sublabel="not scored" /> : <Ring percent={overall ?? 0} label="Discipline" sublabel="today" />}
          </div>
          <div className="flex-1 w-full space-y-4">
            <PillarRow icon={<BookOpenCheck size={17} aria-hidden />} name="Today's Plan" value={acad} />
            <PillarRow icon={<Wallet2 size={17} aria-hidden />} name="Finance" value={fin} />
            <PillarRow icon={<Repeat2 size={17} aria-hidden />} name="Routines" value={rout} />
            {stActive && (
              <PillarRow icon={<Hourglass size={17} aria-hidden />} name="Screen time" value={scr} />
            )}
          </div>
        </div>
      </GlassCard>

      {/* Reminders row: exam, next class, routines */}
      {(nextExam || nextClass || routinesToday.length > 0) && (
        <div className="grid sm:grid-cols-3 gap-4 animate-fade-up [animation-delay:160ms]">
          {nextExam && nextExam.days <= 30 && (
            <Link href="/academics" className="focus-ring block">
              <GlassCard className="p-5 h-full hover:-translate-y-0.5 transition-transform">
                <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--ink-faint)] flex items-center gap-1.5"><AlarmClock size={12} aria-hidden /> Next exam</p>
                <p className="font-semibold mt-2">{nextExam.course!.code} {examCountdownText(nextExam.days)}</p>
                <p className="text-xs text-[var(--ink-soft)] mt-1">
                  {prettyDate(nextExam.ex.exam_date)}{nextExam.ex.start_time ? ` · ${nextExam.ex.start_time}` : ""}{nextExam.ex.venue ? ` · ${nextExam.ex.venue}` : ""}
                </p>
              </GlassCard>
            </Link>
          )}
          {nextClass && (
            <Link href="/dashboard" className="focus-ring block">
              <GlassCard className="p-5 h-full hover:-translate-y-0.5 transition-transform">
                <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--ink-faint)] flex items-center gap-1.5"><Clock3 size={12} aria-hidden /> Next class today</p>
                <p className="font-semibold mt-2">{(courses ?? []).find((c) => c.id === nextClass.course_id)?.code ?? "Class"} · {nextClass.start_time}</p>
                <p className="text-xs text-[var(--ink-soft)] mt-1 truncate">{nextClass.venue || "venue as scheduled"}</p>
              </GlassCard>
            </Link>
          )}
          {routinesToday.length > 0 && (
            <Link href="/routines" className="focus-ring block">
              <GlassCard className="p-5 h-full hover:-translate-y-0.5 transition-transform">
                <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--ink-faint)] flex items-center gap-1.5"><Repeat2 size={12} aria-hidden /> Routines</p>
                <p className="font-semibold mt-2">{doneCount} of {routinesToday.length} done</p>
                {topStreak && <p className="text-xs text-[var(--ink-soft)] mt-1">Best streak: {topStreak.name} · {topStreak.s}d</p>}
              </GlassCard>
            </Link>
          )}
        </div>
      )}

      {/* Checklist + money side by side */}
      <div className="grid md:grid-cols-2 gap-5 animate-fade-up [animation-delay:220ms]">
        <GlassCard className="p-5">
          <SectionHeader icon={<ListChecks size={19} aria-hidden />} title="Today's Plan" />
          <Checklist compact />
          {planTotal > planDone && planTotal > 0 && (
            <Link href="/dashboard" className="focus-ring mt-3 inline-flex items-center gap-1 text-sm font-medium text-[var(--ink-soft)]">
              Open the full day <ArrowRight size={14} aria-hidden />
            </Link>
          )}
        </GlassCard>

        <div className="space-y-5">
          {/* Money */}
          <Link href="/finance" className="focus-ring block">
            <GlassCard className="p-5 hover:-translate-y-0.5 transition-transform wallet-edge">
              <SectionHeader icon={<Wallet2 size={19} aria-hidden />} title="This week's money" />
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="font-serif text-3xl">{balance != null ? fmtMoney(balance) : "—"}</p>
                  <p className="text-xs text-[var(--ink-soft)] mt-1">
                    {week ? `${fmtMoney(weekSpend)} spent of ${fmtMoney(week.opening_balance)}` : "opens on collection day"}
                  </p>
                  {settings && settings.weekly_savings_target > 0 && balance != null && (
                    <p className="text-xs mt-1" style={{ color: "var(--ink-soft)" }}>
                      {balance >= settings.weekly_savings_target
                        ? `Savings target made — ${fmtMoney(balance)} kept.`
                        : `${fmtMoney(settings.weekly_savings_target - Math.max(0, balance))} to go for the week's target.`}
                    </p>
                  )}
                </div>
                {balanceTrend.length > 1 && (
                  <div className="flex items-end gap-1.5 h-14" aria-label="Balance over recent weeks">
                    {balanceTrend.map((b, i) => {
                      const max = Math.max(...balanceTrend.map((x) => Math.abs(x.balance)), 1);
                      return (
                        <div key={b.week.id} className="w-5 rounded-t-md" style={{
                          height: `${Math.max(8, (Math.abs(b.balance) / max) * 100)}%`,
                          background: "var(--ink)",
                          opacity: i === balanceTrend.length - 1 ? 1 : 0.35,
                        }} title={`Week of ${prettyDate(b.week.week_start_date)}: ${fmtMoney(b.balance)}`} />
                      );
                    })}
                  </div>
                )}
              </div>
            </GlassCard>
          </Link>

          {hour >= 21 && (expenses ?? []).length === 0 && <SpendCheckIn today={today} weekId={week?.id} />}
        </div>
      </div>

      {/* Digest highlight */}
      {latestDigest && (
        <Link href="/digest" className="focus-ring block animate-fade-up [animation-delay:280ms]">
          <div className="letter-card rounded-3xl p-6 hover:-translate-y-0.5 transition-transform">
            <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--ink-faint)] flex items-center gap-2 mb-2">
              <ScrollText size={13} aria-hidden /> From your latest weekly letter
            </p>
            <p className="font-serif text-[16px] leading-relaxed line-clamp-2" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              {digestPreview}
            </p>
            <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-[var(--ink-soft)]">
              Read the full letter <ArrowRight size={14} aria-hidden />
            </span>
          </div>
        </Link>
      )}

      {/* Topic coverage + week strip */}
      <div className="grid md:grid-cols-2 gap-5 animate-fade-up [animation-delay:340ms]">
        <GlassCard className="p-5">
          <SectionHeader icon={<BookOpenCheck size={19} aria-hidden />} title="Topic coverage" sub={`${topicsSummary.total} topics across ${(courses ?? []).length} courses`} />
          {topicsSummary.total > 0 && (
            <>
              <ProportionBar
                segments={[
                  { value: topicsSummary.read, className: "bg-[var(--ink)]", label: "read" },
                  { value: topicsSummary.revising, className: "bg-[#57575f]", label: "revising" },
                  { value: topicsSummary.reading, className: "bg-[#8a8a94]", label: "reading" },
                  { value: topicsSummary.untouched, className: "bg-black/10 dark:bg-white/10", label: "untouched" },
                ]}
                height={12}
              />
              <div className="mt-3 grid grid-cols-2 gap-1.5 text-xs text-[var(--ink-soft)]">
                <span>{topicsSummary.read} read</span>
                <span>{topicsSummary.revising} revising</span>
                <span>{topicsSummary.reading} reading</span>
                <span>{topicsSummary.untouched} untouched</span>
              </div>
            </>
          )}
        </GlassCard>

        <GlassCard className="p-5">
          <SectionHeader icon={<TrendingUp size={19} aria-hidden />} title="This week, at a glance" />
          <div className="flex justify-between gap-2">
            {weekStrip.map((d) => (
              <div key={d.date} className="flex flex-col items-center gap-2 flex-1">
                <span className={`text-[10px] uppercase tracking-wide ${d.date === today ? "font-semibold" : "text-[var(--ink-faint)]"}`}>{d.day}</span>
                <div
                  title={d.score != null ? `${Math.round(d.score)}%` : "no data"}
                  className={`w-full rounded-full ${d.date === today ? "ring-2 ring-[var(--ink)] ring-offset-2 ring-offset-transparent" : ""}`}
                  style={{
                    height: 52,
                    background:
                      d.score == null
                        ? "rgba(120,116,130,0.12)"
                        : `linear-gradient(to top, var(--ink) ${d.score}%, rgba(120,116,130,0.12) ${d.score}%)`,
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

function PillarRow({ icon, name, value }: { icon: React.ReactNode; name: string; value: number | null }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[var(--ink-faint)] shrink-0" aria-hidden>{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-medium">{name}</span>
          <span className="text-sm tabular-nums text-[var(--ink-soft)]">{value == null ? "—" : `${Math.round(value)}%`}</span>
        </div>
        <div className="h-2 rounded-full bg-black/[0.06] dark:bg-white/[0.07] mt-1 overflow-hidden neo-inset !rounded-full" style={{ borderRadius: 999 }}>
          <div className="h-full rounded-full bg-[var(--ink)] transition-all duration-1000" style={{ width: `${value ?? 0}%`, opacity: value == null ? 0 : 1 }} />
        </div>
      </div>
    </div>
  );
}

function SpendCheckIn({ today, weekId }: { today: string; weekId?: number }) {
  const [amount, setAmount] = useState("");
  const [done, setDone] = useState(false);

  const log = async () => {
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0 || !weekId) return;
    await db.expenses.add({ finance_week_id: weekId, date: today, amount: amt, tag: "need", note: "day total" });
    setAmount("");
    setDone(true);
  };

  if (done) {
    return (
      <GlassCard className="p-5 animate-fade-up">
        <p className="text-sm text-[var(--ink-soft)]">Logged.</p>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-5 animate-fade-up">
      <div className="flex items-center gap-4 mb-3">
        <span className="neo-sm w-11 h-11 rounded-xl flex items-center justify-center shrink-0" aria-hidden><ReceiptText size={19} /></span>
        <div>
          <p className="font-semibold">How much did you spend today?</p>
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
