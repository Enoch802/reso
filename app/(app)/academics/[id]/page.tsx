"use client";
import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowLeft, Plus, ListChecks, CalendarDays, Clock3, MessageCircleHeart, Trash2,
} from "lucide-react";
import { db } from "@/lib/db";
import { GlassCard, SectionHeader, Field, NeoButton, ProportionBar, Tag, EmptyState } from "@/components/ui";
import { useToday } from "@/components/AppShell";
import { ExamEditor } from "@/components/academics-exam";
import { CoachChat } from "@/components/CourseCoach";
import { todayStr, prettyDate, DAY_NAMES } from "@/lib/dates";

const TOPIC_STATES = ["untouched", "reading", "read", "revising"] as const;
const TOPIC_LABEL: Record<string, string> = { untouched: "Untouched", reading: "Reading", read: "Read", revising: "Revising" };
const TOPIC_DOT: Record<string, string> = {
  untouched: "bg-black/15 dark:bg-white/15",
  reading: "bg-[#8a8a94]",
  read: "bg-[var(--ink)]",
  revising: "bg-[#57575f] ring-2 ring-[var(--ink)]/20",
};

export default function CourseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const courseId = parseInt(id);
  const today = useToday();

  const course = useLiveQuery(() => db.courses.get(courseId), [courseId]);
  const topics = useLiveQuery(() => db.course_topics.where("course_id").equals(courseId).toArray(), [courseId]);
  const exam = useLiveQuery(async () => (await db.exams.where("course_id").equals(courseId).toArray())[0], [courseId]);
  const slots = useLiveQuery(
    () => db.timetable_slots.where("course_id").equals(courseId).toArray(),
    [courseId]
  );

  const [newTopic, setNewTopic] = useState("");
  const [openTopicId, setOpenTopicId] = useState<number | null>(null);

  const addTopic = async () => {
    const name = newTopic.trim();
    if (!name) return;
    await db.course_topics.add({ course_id: courseId, name, status: "untouched" });
    setNewTopic("");
  };

  const setTopicStatus = async (id: number, status: typeof TOPIC_STATES[number]) => {
    await db.course_topics.update(id, { status });
    setOpenTopicId(null);
  };

  if (!course) {
    return <div className="py-20 text-center text-[var(--ink-faint)]" aria-busy="true">Loading course…</div>;
  }

  const topicCounts = {
    read: (topics ?? []).filter((t) => t.status === "read").length,
    revising: (topics ?? []).filter((t) => t.status === "revising").length,
    reading: (topics ?? []).filter((t) => t.status === "reading").length,
    untouched: (topics ?? []).filter((t) => t.status === "untouched").length,
  };

  return (
    <div className="space-y-6 pb-8 max-w-3xl mx-auto">
      <Link href="/academics" className="focus-ring inline-flex items-center gap-2 text-sm text-[var(--ink-soft)] hover:text-[var(--ink)] transition-colors animate-fade-up">
        <ArrowLeft size={16} aria-hidden /> Academics
      </Link>

      <div className="animate-fade-up [animation-delay:60ms]">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="font-serif text-3xl sm:text-4xl tracking-tight text-[var(--ink)]">{course.code}</h1>
        </div>
        <p className="text-[var(--ink-soft)] mt-1">{course.title} — {course.credit_units} credit units</p>
      </div>

      {/* Topics tracker */}
      <GlassCard className="p-5 animate-fade-up [animation-delay:210ms]">
        <SectionHeader icon={<ListChecks size={19} aria-hidden />} title="Topic coverage"  />
        <form onSubmit={(e) => { e.preventDefault(); addTopic(); }} className="flex gap-2">
          <input
            value={newTopic}
            onChange={(e) => setNewTopic(e.target.value)}
            placeholder="e.g. Kirchhoff's Laws"
            aria-label="New topic"
            className="focus-ring flex-1 rounded-xl px-4 py-3 text-[15px] bg-[var(--neo-base)] text-[var(--ink)] shadow-[inset_3px_3px_7px_rgba(58,56,82,0.1),inset_-3px_-3px_7px_rgba(255,255,255,0.75)] dark:shadow-[inset_3px_3px_8px_rgba(0,0,0,0.45),inset_-3px_-3px_7px_rgba(255,255,255,0.04)] border border-white/30 dark:border-white/5"
          />
          <NeoButton type="submit" variant="accent" ariaLabel="Add topic"><Plus size={18} aria-hidden /></NeoButton>
        </form>

        {(topics ?? []).length > 0 && (
          <div className="mt-4">
            <ProportionBar
              segments={[
                { value: topicCounts.read, className: "bg-[var(--ink)]", label: "read" },
                { value: topicCounts.revising, className: "bg-[#57575f]", label: "revising" },
                { value: topicCounts.reading, className: "bg-[#8a8a94]", label: "reading" },
                { value: topicCounts.untouched, className: "bg-black/10 dark:bg-white/10", label: "untouched" },
              ]}
            />
            <p className="text-xs text-[var(--ink-faint)] mt-1.5">
              {topicCounts.read} read, {topicCounts.revising} revising, {topicCounts.reading} reading, {topicCounts.untouched} untouched
            </p>
            <ul className="mt-4 space-y-2">
              {(topics ?? []).map((t) => (
                <li key={t.id} className="flex items-center gap-2.5">
                  <div className="flex-1">
                    <button
                      onClick={() => setOpenTopicId(openTopicId === t.id ? null : t.id!)}
                      className="focus-ring w-full text-left rounded-xl neo px-4 py-3 min-h-[48px] flex items-center justify-between hover:-translate-y-px transition-transform"
                      aria-label={`${t.name}: ${TOPIC_LABEL[t.status]}. Choose a state.`}
                      aria-expanded={openTopicId === t.id}
                    >
                      <span className={`text-[15px] ${t.status === "read" ? "text-[var(--ink-faint)]" : "text-[var(--ink)]"}`}>{t.name}</span>
                      <Tag><span aria-hidden className={`inline-block w-2 h-2 rounded-full ${TOPIC_DOT[t.status]}`} />{TOPIC_LABEL[t.status]}</Tag>
                    </button>
                    {openTopicId === t.id && (
                      <div className="flex flex-wrap gap-1.5 mt-1.5 pl-2" role="group" aria-label={`Set ${t.name} state`}>
                        {TOPIC_STATES.map((state) => (
                          <button key={state} onClick={() => setTopicStatus(t.id!, state)} className="focus-ring inline-flex items-center gap-1.5 rounded-lg neo-sm px-2.5 py-2 text-xs text-[var(--ink-soft)] hover:text-[var(--ink)]">
                            <span aria-hidden className={`inline-block w-2 h-2 rounded-full ${TOPIC_DOT[state]}`} />{TOPIC_LABEL[state]}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button onClick={() => db.course_topics.delete(t.id!)} aria-label={`Remove ${t.name}`} className="focus-ring text-[var(--ink-faint)] hover:text-rose-500 p-2">
                    <Trash2 size={14} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {(topics ?? []).length === 0 && (
          <EmptyState icon={<ListChecks size={22} aria-hidden />} title="No topics yet"  />
        )}
      </GlassCard>

      {/* Ask Reso about this course */}
      <GlassCard className="p-5 animate-fade-up [animation-delay:230ms]">
        <SectionHeader icon={<MessageCircleHeart size={19} aria-hidden />} title="Ask about this course" sub="Tests, revision, what to do next — it knows this course's details." />
        <CoachChat courseId={courseId} />
      </GlassCard>

      {/* Weekly schedule — pushed in automatically by the class timetable upload */}
      <GlassCard className="p-5 animate-fade-up [animation-delay:235ms]">
        <SectionHeader icon={<Clock3 size={19} aria-hidden />} title="Weekly schedule" sub="Filled in automatically when you upload your class timetable." />
        {(slots ?? []).length === 0 ? (
          <p className="text-sm text-[var(--ink-soft)]">
            No class times yet — upload the timetable in Settings and this course's weekly times appear here on their own. Reminders follow them automatically.
          </p>
        ) : (
          <ul className="space-y-2">
            {(slots ?? []).slice().sort((a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time)).map((sl) => (
              <li key={sl.id} className="flex items-center justify-between rounded-xl neo-sm px-4 py-3 text-sm">
                <span className="font-medium text-[var(--ink)]">{DAY_NAMES[sl.day_of_week]}</span>
                <span className="tabular-nums text-[var(--ink-soft)]">{sl.start_time} – {sl.end_time}{sl.venue ? ` · ${sl.venue}` : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>

      {/* Exam date */}
      <GlassCard className="p-5 animate-fade-up [animation-delay:260ms]">
        <SectionHeader icon={<CalendarDays size={19} aria-hidden />} title="Exam" />
        <ExamEditor courseId={courseId} exam={exam} />
        {exam && <p className="text-sm text-[var(--ink-soft)] mt-3">Set for {prettyDate(exam.exam_date)}{exam.start_time ? ` at ${exam.start_time}` : ""}{exam.venue ? `, ${exam.venue}` : ""}.</p>}
      </GlassCard>
    </div>
  );
}

function ScoreEntryForm({ courseId, componentId, label }: { courseId: number; componentId: number; label: string }) {
  const [obtained, setObtained] = useState("");
  const [max, setMax] = useState("100");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const ob = parseFloat(obtained);
        const mx = parseFloat(max);
        if (isNaN(ob) || isNaN(mx) || mx <= 0) return;
        await db.course_scores.add({
          course_id: courseId, ca_component_id: componentId, label,
          score_obtained: ob, score_max: mx, component: "CA",
          date_recorded: todayStr(), was_impromptu: 0, status: "confirmed",
        });
        setObtained("");
      }}
      className="flex flex-wrap items-end gap-3"
    >
      <Field label="Score obtained" value={obtained} onChange={setObtained} type="number" placeholder="e.g. 34" className="flex-1 min-w-[110px]" />
      <Field label="Out of" value={max} onChange={setMax} type="number" placeholder="40" className="flex-1 min-w-[110px]" />
      <NeoButton type="submit" variant="accent">Save score</NeoButton>
    </form>
  );
}
