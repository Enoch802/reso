"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { BookOpenCheck, ChevronRight, CalendarDays, ListChecks, AlarmClock } from "lucide-react";
import { db } from "@/lib/db";
import type { Exam } from "@/lib/db";
import { GlassCard, SectionHeader, EmptyState, Tag, ProportionBar } from "@/components/ui";
import { useToday } from "@/components/AppShell";
import { daysUntilExam, examCountdownText } from "@/lib/calc";
import { prettyDate } from "@/lib/dates";

/** Academics — conceptual coverage and exam logistics, no numeric grade tracking. */
export default function AcademicsPage() {
  const today = useToday();
  const courses = useLiveQuery(() => db.courses.toArray(), []);
  const topics = useLiveQuery(() => db.course_topics.toArray(), []);
  const exams = useLiveQuery(() => db.exams.toArray(), []);
  const slots = useLiveQuery(() => db.timetable_slots.toArray(), []);

  const examByCourse = useMemo(() => {
    const m = new Map<number, Exam>();
    for (const ex of exams ?? []) if (!m.has(ex.course_id) || ex.exam_date < m.get(ex.course_id)!.exam_date) m.set(ex.course_id, ex);
    return m;
  }, [exams]);

  const courseRows = useMemo(() => (courses ?? []).map((c) => {
    const t = (topics ?? []).filter((x) => x.course_id === c.id);
    return {
      course: c,
      total: t.length,
      read: t.filter((x) => x.status === "read").length,
      revising: t.filter((x) => x.status === "revising").length,
      reading: t.filter((x) => x.status === "reading").length,
      untouched: t.filter((x) => x.status === "untouched").length,
      classes: (slots ?? []).filter((s) => s.course_id === c.id).length,
      exam: examByCourse.get(c.id!),
    };
  }), [courses, topics, slots, examByCourse]);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "exams" | "coverage">("all");

  const filtered = useMemo(() => {
    return courseRows
      .filter((r) => (query.trim() ? (r.course.code + " " + r.course.title).toLowerCase().includes(query.trim().toLowerCase()) : true))
      .filter((r) => {
        if (filter === "exams") return r.exam && daysUntilExam(r.exam.exam_date) >= 0;
        if (filter === "coverage") return r.total === 0 || r.read + r.revising < r.total;
        return true;
      });
  }, [courseRows, query, filter]);

  const upcomingExams = (exams ?? [])
    .map((ex) => ({ ex, course: courses?.find((c) => c.id === ex.course_id), days: daysUntilExam(ex.exam_date) }))
    .filter((x) => x.course && x.days >= 0)
    .sort((a, b) => a.days - b.days)
    .slice(0, 3);

  return (
    <div className="space-y-6 pb-8">
      <div className="animate-fade-up">
        <h1 className="font-serif text-3xl sm:text-4xl tracking-tight">Academics</h1>
        <p className="text-sm text-[var(--ink-soft)] mt-1">
          Conceptual coverage per course, and what's coming. Coverage, not grades.
        </p>
      </div>

      {/* Upcoming exams — logistics only, no speculation */}
      {upcomingExams.length > 0 && (
        <div className="animate-fade-up [animation-delay:80ms]">
          <SectionHeader icon={<AlarmClock size={19} aria-hidden />} title="Coming up" />
          <div className="space-y-3">
            {upcomingExams.map(({ ex, course, days }) => (
              <GlassCard key={ex.id} className="p-4 sm:p-5 flex items-center gap-4">
                <span className="neo-sm w-11 h-11 rounded-xl flex items-center justify-center shrink-0" aria-hidden>
                  <CalendarDays size={19} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold">{course!.code} exam {examCountdownText(days)}</p>
                  <p className="text-sm text-[var(--ink-soft)] truncate">
                    {prettyDate(ex.exam_date)}{ex.start_time ? ` at ${ex.start_time}` : ""}{ex.venue ? ` — ${ex.venue}` : ""}
                  </p>
                </div>
              </GlassCard>
            ))}
          </div>
        </div>
      )}

      {/* Courses */}
      <div className="animate-fade-up [animation-delay:140ms]">
        <SectionHeader icon={<BookOpenCheck size={19} aria-hidden />} title="Your courses" sub={courseRows.length > 8 ? `${courseRows.length} courses — search or filter to find one fast.` : "Tap a course for its topics and exam details."} />
        {courseRows.length > 4 && (
          <div className="flex flex-col sm:flex-row gap-2.5 mb-4">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by code or title..."
              aria-label="Search courses"
              className="focus-ring flex-1 rounded-xl px-4 py-2.5 text-sm bg-[var(--neo-base)] border border-white/30 dark:border-white/5 shadow-[inset_3px_3px_7px_rgba(10,10,15,0.08),inset_-3px_-3px_7px_rgba(255,255,255,0.7)] dark:shadow-[inset_3px_3px_8px_rgba(0,0,0,0.5),inset_-3px_-3px_7px_rgba(255,255,255,0.04)]"
            />
            <div className="flex gap-1.5">
              {([["all", "All"], ["exams", "With exams"], ["coverage", "Topics open"]] as const).map(([k, lbl]) => (
                <button
                  key={k}
                  onClick={() => setFilter(k)}
                  aria-pressed={filter === k}
                  className={`focus-ring rounded-xl px-3 py-2 text-xs font-semibold min-h-[40px] transition-all ${filter === k ? "neo-pressed text-[var(--ink)]" : "neo text-[var(--ink-faint)]"}`}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>
        )}
        {courseRows.length === 0 && (
          <GlassCard>
            <EmptyState
              icon={<BookOpenCheck size={26} aria-hidden />}
              title="No courses yet"
              sub="Add them in Settings — Courses, and topic tracking comes alive here."
            />
          </GlassCard>
        )}
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((row, i) => (
            <Link key={row.course.id} href={`/academics/${row.course.id}`} className="focus-ring block animate-fade-up" style={{ animationDelay: `${i * 70}ms` }}>
              <GlassCard className="p-5 h-full hover:-translate-y-1 transition-transform">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-serif text-xl">{row.course.code}</span>
                      <Tag>{row.course.course_type === "general" ? "General" : "Departmental"}</Tag>
                    </div>
                    <p className="text-sm text-[var(--ink-soft)] truncate mt-0.5">{row.course.title}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-serif text-2xl">{row.total ? `${Math.round(((row.read + row.revising) / row.total) * 100)}%` : "—"}</p>
                    <p className="text-xs text-[var(--ink-faint)]">covered</p>
                  </div>
                </div>
                {row.total > 0 && (
                  <div className="mt-3">
                    <ProportionBar
                      segments={[
                        { value: row.read, className: "bg-[var(--ink)]", label: "read" },
                        { value: row.revising, className: "bg-[#57575f]", label: "revising" },
                        { value: row.reading, className: "bg-[#8a8a94]", label: "reading" },
                        { value: row.untouched, className: "bg-black/10 dark:bg-white/10", label: "untouched" },
                      ]}
                    />
                    <p className="text-xs text-[var(--ink-faint)] mt-1.5">{row.read} read, {row.revising} revising, {row.reading} reading</p>
                  </div>
                )}
                {row.total === 0 && (
                  <p className="text-xs text-[var(--ink-faint)] mt-3 flex items-center gap-1.5"><ListChecks size={12} aria-hidden /> No topics added yet</p>
                )}
                <div className="flex items-center justify-between mt-3 text-xs">
                  <span className="text-[var(--ink-faint)]">{row.classes} class{row.classes === 1 ? "" : "es"} weekly</span>
                  {row.exam && daysUntilExam(row.exam.exam_date) >= 0 && (
                    <span className={daysUntilExam(row.exam.exam_date) <= 7 ? "text-rose-500 font-medium" : "text-[var(--ink-faint)]"}>
                      exam {daysUntilExam(row.exam.exam_date) === 0 ? "today" : daysUntilExam(row.exam.exam_date) === 1 ? "tomorrow" : `in ${daysUntilExam(row.exam.exam_date)}d`}
                    </span>
                  )}
                </div>
                <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[var(--ink-soft)]">
                  Open course <ChevronRight size={13} aria-hidden />
                </span>
              </GlassCard>
            </Link>
          ))}
          {filtered.length === 0 && courseRows.length > 0 && (
            <div className="sm:col-span-2 xl:col-span-3">
              <GlassCard>
                <EmptyState icon={<BookOpenCheck size={22} aria-hidden />} title="No match" sub={`Nothing matches "${query}" with that filter — try clearing it.`} />
              </GlassCard>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
