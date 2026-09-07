"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useRouter } from "next/navigation";
import { Award, Download, Archive, RotateCcw, Loader2 } from "lucide-react";
import { db, exportAllData } from "@/lib/db";
import { NeoButton, Modal, SectionHeader } from "./ui";
import { routineStreak } from "@/lib/calc";
import { fmtMoney, MONTHS, weekStartOnOrBefore, todayStr } from "@/lib/dates";

/**
 * Semester recap — academic ENGAGEMENT (topics, journaling, routines), finance
 * saved vs goal, and the notable pattern. No numeric grade outcomes anywhere.
 */
export default function Recap({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const profile = useLiveQuery(() => db.profile.toArray(), []);
  const courses = useLiveQuery(() => db.courses.toArray(), []);
  const topics = useLiveQuery(() => db.course_topics.toArray(), []);
  const expenses = useLiveQuery(() => db.expenses.toArray(), []);
  const fs = useLiveQuery(() => db.finance_settings.toArray(), []);
  const weeks = useLiveQuery(() => db.finance_weeks.toArray(), []);
  const routines = useLiveQuery(() => db.routines.toArray(), []);
  const logs = useLiveQuery(() => db.routine_logs.toArray(), []);
  const discipline = useLiveQuery(() => db.discipline_scores.toArray(), []);
  const dailyLogs = useLiveQuery(() => db.daily_logs.toArray(), []);

  const stats = useMemo(() => {
    // Topic engagement
    const total = (topics ?? []).length;
    const read = (topics ?? []).filter((t) => t.status === "read").length;
    const revising = (topics ?? []).filter((t) => t.status === "revising").length;
    const engaged = read + revising;

    // Finance: total saved across the semester
    const totalSpent = (expenses ?? []).reduce((a, e) => a + e.amount, 0);
    const weeklyAllowance = (fs ?? [])[0]?.current_allowance_amount ?? 0;
    const nWeeks = (weeks ?? []).length || 1;
    const income = weeklyAllowance * nWeeks + (weeks ?? []).reduce((a, w) => a + w.rollover_from_previous, 0);
    const saved = Math.max(0, income - totalSpent);
    const savingsGoal = ((fs ?? [])[0]?.weekly_savings_target ?? 0) * nWeeks;

    // Routine consistency
    const consistency = (routines ?? []).map((r) => {
      const scheduled = r.schedule_days.length * Math.max(1, nWeeks);
      const done = (logs ?? []).filter((l) => l.routine_id === r.id && l.status === "done").length;
      return { name: r.name, pct: scheduled ? Math.round((done / scheduled) * 100) : 0 };
    }).sort((a, b) => b.pct - a.pct);
    const bestRoutine = (routines ?? []).map((r) => ({ r, s: routineStreak(r, logs ?? []) })).sort((a, b) => b.s - a.s)[0];

    // Journal engagement
    const journaledDays = new Set((dailyLogs ?? []).filter((l) => l.evening_reflection_text?.trim()).map((l) => l.date)).size;

    // Discipline average (patterns, not grades)
    const scored = (discipline ?? []).filter((d) => d.overall_score != null);
    const avgDiscipline = scored.length ? scored.reduce((a, d) => a + (d.overall_score ?? 0), 0) / scored.length : 0;

    // Notable pattern: biggest want-leak
    const wantLeak = Object.entries(
      (expenses ?? []).filter((e) => e.tag === "want").reduce<Record<string, number>>((acc, e) => {
        const k = (e.note || "unlabeled").split(" ").slice(0, 2).join(" ").toLowerCase();
        acc[k] = (acc[k] ?? 0) + e.amount;
        return acc;
      }, {})
    ).sort((a, b) => b[1] - a[1])[0];

    return { total, engaged, read, revising, saved, savingsGoal, consistency, bestRoutine, journaledDays, avgDiscipline, wantLeak, nWeeks };
  }, [profile, topics, expenses, fs, weeks, routines, logs, discipline, dailyLogs]);

  // Keepsake shareable card — engagement, never a grade
  useEffect(() => {
    if (!open || !stats || !canvasRef.current) return;
    const c = canvasRef.current;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const W = 800, H = 450;
    c.width = W * 2; c.height = H * 2;
    ctx.scale(2, 2);
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, "#fafafa");
    grad.addColorStop(1, "#e2e2e6");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(22,22,28,0.35)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(18, 18, W - 36, H - 36);
    ctx.strokeRect(24, 24, W - 48, H - 48);
    ctx.fillStyle = "#17171b";
    ctx.font = "600 15px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillText("SEMESTER KEEPSAKE", W / 2, 66);
    ctx.fillStyle = "#16161a";
    ctx.font = "500 34px Georgia, serif";
    const nm = profile?.[0]?.name ?? "Your semester";
    ctx.fillText(nm, W / 2, 108);
    const end = profile?.[0]?.semester_end_date;
    if (end) {
      ctx.fillStyle = "#57575f";
      ctx.font = "14px Georgia, serif";
      const d = new Date(end + "T00:00:00");
      ctx.fillText(`${MONTHS[d.getMonth()]} ${d.getFullYear()}`, W / 2, 134);
    }
    const figures: Array<[string, string]> = [
      ["TOPICS ENGAGED", stats.total ? `${Math.round((stats.engaged / stats.total) * 100)}%` : "—"],
      ["DISCIPLINE", `${Math.round(stats.avgDiscipline)}%`],
      ["SAVED", fmtMoney(stats.saved).replace(/\u20A6?/, "").trim() || "0"],
      ["TOP STREAK", stats.bestRoutine ? `${stats.bestRoutine.s} days` : "—"],
    ];
    figures.forEach(([label, value], i) => {
      const x = W / 8 + (i * W) / 4;
      ctx.fillStyle = "#8a8a94";
      ctx.font = "600 11px Inter, sans-serif";
      ctx.fillText(label, x, 205);
      ctx.fillStyle = "#17171b";
      ctx.font = "500 32px Georgia, serif";
      ctx.fillText(value, x, 250);
    });
    ctx.fillStyle = "#57575f";
    ctx.font = "italic 16px Georgia, serif";
    const best = stats.consistency[0];
    ctx.fillText(best ? `Strongest habit: ${best.name} (${best.pct}% kept)` : "", W / 2, 330);
    ctx.fillStyle = "#8a8a94";
    ctx.font = "13px Inter, sans-serif";
    ctx.fillText("kept honest by Reso", W / 2, 380);
  }, [open, stats, profile]);

  const download = () => {
    if (!canvasRef.current) return;
    setDownloading(true);
    const url = canvasRef.current.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = "reso-semester-recap.png";
    a.click();
    setDownloading(false);
  };

  const archive = async () => {
    setArchiving(true);
    const payload = await exportAllData();
    const end = profile?.[0]?.semester_end_date ?? todayStr();
    await db.archived_semesters.add({ label: `Semester ending ${end}`, archived_at: Date.now(), payload });
    await Promise.all([
      db.courses.clear(), db.course_ca_components.clear(), db.course_scores.clear(),
      db.course_topics.clear(), db.timetable_slots.clear(), db.exams.clear(),
      db.personal_study_slots.clear(), db.finance_weeks.clear(), db.expenses.clear(), db.finance_income.clear(),
      db.routines.clear(), db.routine_logs.clear(), db.daily_plan_items.clear(),
      db.daily_logs.clear(), db.chat_messages.clear(), db.discipline_scores.clear(),
      db.weekly_digests.clear(),
    ]);
    if (profile?.[0]) {
      await db.profile.update(profile[0].id!, { onboarding_complete: 0, new_semester_mode: 1 });
    }
    router.push("/dashboard");
    router.refresh();
  };

  return (
    <Modal open={open} onClose={onClose} title="Semester recap" wide>
      <div className="keepsake rounded-3xl p-6 sm:p-8 mb-6 animate-fade-up">
        <div className="flex items-center gap-3 mb-6">
          <span className="neo-sm w-11 h-11 rounded-xl flex items-center justify-center" aria-hidden><Award size={20} /></span>
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">The semester, closed</p>
            <h3 className="font-serif text-2xl">{profile?.[0]?.name ?? "Your semester"}</h3>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <Fig label="Topics engaged" value={stats.total ? `${Math.round((stats.engaged / stats.total) * 100)}%` : "—"} note={stats.total ? `${stats.read} read · ${stats.revising} revising` : ""} />
          <Fig label="Discipline" value={`${Math.round(stats.avgDiscipline)}%`} note="semester average" />
          <Fig label="Saved" value={fmtMoney(stats.saved)} note={stats.savingsGoal ? `goal ${fmtMoney(stats.savingsGoal)}` : ""} />
          <Fig label="Top streak" value={stats.bestRoutine ? `${stats.bestRoutine.s}d` : "—"} note={stats.bestRoutine?.r.name ?? ""} />
        </div>
        <div className="h-px bg-black/5 dark:bg-white/10 my-6" />
        <div className="space-y-2.5 text-sm text-[var(--ink-soft)]">
          <p><span className="font-medium text-[var(--ink)]">Strongest habit:</span> {stats.consistency[0] ? `${stats.consistency[0].name} — ${stats.consistency[0].pct}% kept` : "no routines tracked"}.</p>
          <p><span className="font-medium text-[var(--ink)]">Journal:</span> {stats.journaledDays} day{stats.journaledDays === 1 ? "" : "s"} reflected on.</p>
          {stats.wantLeak && <p><span className="font-medium text-[var(--ink)]">Notable pattern:</span> "{stats.wantLeak[0]}" quietly took the most among wants.</p>}
        </div>
      </div>

      <div className="flex flex-col items-center gap-3">
        <canvas ref={canvasRef} className="w-full max-w-md rounded-2xl shadow-lg" aria-label="Shareable semester recap card" />
        <NeoButton variant="accent" onClick={download} className="font-semibold">
          <span className="inline-flex items-center gap-2">{downloading ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Download size={16} aria-hidden />} Download shareable recap card</span>
        </NeoButton>
      </div>

      <div className="h-px bg-black/5 dark:bg-white/10 my-6" />
      <SectionHeader title="Archive this semester?" sub="Kept, never deleted — viewable any time for comparison." />
      <div className="neo-inset p-4 text-sm text-[var(--ink-soft)] mb-4">
        Archiving clears the live semester and walks you through setup for the next one.
      </div>
      <div className="flex justify-end gap-2">
        <NeoButton onClick={onClose}>Maybe later</NeoButton>
        <NeoButton variant="accent" onClick={archive} disabled={archiving} className="font-semibold">
          <span className="inline-flex items-center gap-2">{archiving ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Archive size={16} aria-hidden />} Archive and start new semester</span>
        </NeoButton>
      </div>
      <p className="flex items-center gap-1.5 text-[11px] text-[var(--ink-faint)] mt-3"><RotateCcw size={11} aria-hidden /> Archived semesters stay readable from Settings — Data.</p>
    </Modal>
  );
}

function Fig({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--ink-faint)]">{label}</p>
      <p className="font-serif text-3xl mt-1">{value}</p>
      {note && <p className="text-[11px] text-[var(--ink-faint)] mt-0.5">{note}</p>}
    </div>
  );
}
