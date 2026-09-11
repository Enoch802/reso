"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { ScrollText, Sparkles, Loader2, Award } from "lucide-react";
import { db, getScreenTimeEnabled } from "@/lib/db";
import { GlassCard, SectionHeader, NeoButton, EmptyState } from "@/components/ui";
import Recap from "@/components/Recap";
import { routineStreak } from "@/lib/calc";
import { aiDigest } from "@/lib/ai";
import { weekStartOnOrBefore, prettyDate, todayStr, daysBetween } from "@/lib/dates";

export default function DigestPage() {
  const params = useSearchParams();
  const [recapOpen, setRecapOpen] = useState(params?.get("recap") === "1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const digests = useLiveQuery(() => db.weekly_digests.orderBy("week_start_date").reverse().toArray(), []);
  const profile = useLiveQuery(() => db.profile.toArray(), []);
  const courses = useLiveQuery(() => db.courses.toArray(), []);
  const expenses = useLiveQuery(() => db.expenses.toArray(), []);
  const fs = useLiveQuery(() => db.finance_settings.toArray(), []);
  const routines = useLiveQuery(() => db.routines.toArray(), []);
  const logs = useLiveQuery(() => db.routine_logs.toArray(), []);
  const dailyLogs = useLiveQuery(() => db.daily_logs.toArray(), []);
  const planItems = useLiveQuery(() => db.daily_plan_items.toArray(), []);
  const topics = useLiveQuery(() => db.course_topics.toArray(), []);
  const courseChats = useLiveQuery(() => db.course_chats.toArray(), []);

  const semesterEnded = profile?.[0] ? daysBetween(profile[0].semester_end_date, todayStr()) >= 0 : false;

  const generate = async () => {
    setBusy(true); setError(null);
    try {
      const thisWeekStart = weekStartOnOrBefore(todayStr(), 1);
      const lastDigest = digests?.[0];

      const wantNotes = (expenses ?? []).filter((e) => e.tag === "want" && lastDigest ? e.date >= thisWeekStart : true);
      const leakMap = wantNotes.reduce<Record<string, number>>((acc, e) => {
        const k = (e.note || "unlabeled").split(" ").slice(0, 2).join(" ").toLowerCase();
        acc[k] = (acc[k] ?? 0) + e.amount;
        return acc;
      }, {});
      const wantLeak = Object.entries(leakMap).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([note, total]) => ({ note, total }));

      const best = (routines ?? []).map((r) => ({ name: r.name, streak: routineStreak(r, logs ?? []) })).sort((a, b) => b.streak - a.streak)[0];
      const academicNote = (courses ?? []).map((course) => ({
        code: course.code,
        untouched: (topics ?? []).filter((topic) => topic.course_id === course.id && topic.status === "untouched").length,
        recentChat: (courseChats ?? []).some((chat) => chat.course_id === course.id && chat.ts >= Date.now() - 14 * 86400000),
      })).sort((a, b) => b.untouched - a.untouched).map(({ code, untouched, recentChat }) =>
        untouched >= 2 ? { code, reason: `${untouched} topics are still untouched` } : (!recentChat ? { code, reason: "it has not come up in CourseCoach recently" } : null)
      ).find((note): note is { code: string; reason: string } => note !== null) ?? null;

      const weekPlans = (planItems ?? []).filter((p) => p.date >= thisWeekStart);
      const planCompletion = weekPlans.length ? Math.round((weekPlans.filter((p) => p.checked).length / weekPlans.length) * 100) : null;
      const sickDays = (dailyLogs ?? []).filter((l) => l.mood_state === "sick" && l.date >= thisWeekStart).length;
      const saved = Math.max(0, ((fs ?? [])[0]?.current_allowance_amount ?? 0) - (expenses ?? []).filter((e) => e.date >= thisWeekStart).reduce((a, e) => a + e.amount, 0));

      const screenTimeEnabled = await getScreenTimeEnabled();

      const weekLogs = (dailyLogs ?? []).filter((l) => l.date >= thisWeekStart);
      const sh = weekLogs.filter((l) => l.parsed_study_hours != null);
      const avgStudyHours = sh.length ? sh.reduce((a, l) => a + (l.parsed_study_hours ?? 0), 0) / sh.length : null;

      const aiInput: any = {
        wantLeak, bestStreak: best && best.streak > 0 ? best : null,
        academicNote, sickDays, planCompletion,
        savings: saved, savingsTarget: (fs ?? [])[0]?.weekly_savings_target ?? 0,
        avgStudyHours,
      };

      if (screenTimeEnabled === 1) {
        const st = weekLogs.filter((l) => typeof l.screen_time_minutes === "number");
        aiInput.avgScreenTimeMinutes = st.length ? st.reduce((a, l) => a + (l.screen_time_minutes ?? 0), 0) / st.length : null;
      }

      const { digest } = await aiDigest(aiInput);
      await db.weekly_digests.add({ week_start_date: thisWeekStart, digest_text: digest, created_at: Date.now() });
    } catch {
      setError("Couldn't reach the writer — try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 pb-8 max-w-2xl mx-auto">
      <div className="flex items-end justify-between gap-4 animate-fade-up">
        <div>
          <h1 className="font-serif text-3xl sm:text-4xl tracking-tight text-[var(--ink)]">Weekly letters</h1>
        </div>
        <NeoButton variant="accent" onClick={generate} disabled={busy} className="font-semibold shrink-0">
          <span className="inline-flex items-center gap-2">{busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Sparkles size={16} aria-hidden />} Write this week's</span>
        </NeoButton>
      </div>

      {semesterEnded && (
        <GlassCard className="p-5 animate-fade-up flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="neo-sm w-11 h-11 rounded-xl flex items-center justify-center text-[var(--accent)]" aria-hidden><Award size={20} /></span>
            <p className="text-sm text-[var(--ink-soft)]">Your semester has ended.</p>
          </div>
          <NeoButton onClick={() => setRecapOpen(true)} className="shrink-0 font-semibold">View recap</NeoButton>
        </GlassCard>
      )}

      {error && <p className="text-sm text-amber-600 dark:text-amber-300 animate-fade-in">{error}</p>}

      {digests?.length === 0 && !busy && (
        <GlassCard>
          <EmptyState
            icon={<ScrollText size={26} aria-hidden />}
            title="No letters yet"
          />
        </GlassCard>
      )}

      <div className="space-y-5">
        {digests?.map((d, i) => (
          <article key={d.id} className="letter-card rounded-3xl p-6 sm:p-8 animate-fade-up" style={{ animationDelay: `${i * 90}ms` }}>
            <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--ink-faint)] mb-4 flex items-center justify-between">
              <span>Week of {prettyDate(d.week_start_date)}</span>
              <span aria-hidden>A note from Reso</span>
            </p>
            <div className="ruled font-serif text-[16.5px] leading-[28px] text-[var(--ink)] whitespace-pre-wrap">{d.digest_text}</div>
          </article>
        ))}
      </div>

      <Recap open={recapOpen} onClose={() => setRecapOpen(false)} />
    </div>
  );
}
