"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Send, Loader2 } from "lucide-react";
import { db } from "@/lib/db";
import { NeoButton } from "./ui";
import { useToday } from "./AppShell";

/** Course-scoped advice chat — grounded in this course's topics, exam and schedule. */
export function CoachChat({ courseId }: { courseId: number }) {
  const today = useToday();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const course = useLiveQuery(() => db.courses.get(courseId), [courseId]);
  const topics = useLiveQuery(() => db.course_topics.where("course_id").equals(courseId).toArray(), [courseId]);
  const exam = useLiveQuery(async () => (await db.exams.where("course_id").equals(courseId).toArray())[0], [courseId]);
  const slots = useLiveQuery(() => db.timetable_slots.where("course_id").equals(courseId).toArray(), [courseId]);
  const messages = useLiveQuery(
    () => db.course_chats.where("course_id").equals(courseId).sortBy("ts"),
    [courseId]
  );

  const context = useMemo(() => {
    const topicList = (topics ?? [])
      .map((t) => `${t.name} (${t.status.replace("_", " ")})`)
      .join(", ") || "no topics added";
    const examLine = exam
      ? `${exam.exam_date}${exam.start_time ? ` at ${exam.start_time}` : ""}${exam.venue ? `, ${exam.venue}` : ""}`
      : "not set";
    const sched = (slots ?? [])
      .slice()
      .sort((a, b) => a.day_of_week - b.day_of_week)
      .map((s) => `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][s.day_of_week]} ${s.start_time}-${s.end_time}`)
      .join(", ") || "no fixed class times";
    return `Course: ${course?.code ?? ""} ${course?.title ?? ""} (${course?.credit_units ?? "?"} units). Today: ${today}. Topics: ${topicList}. Exam: ${examLine}. Weekly classes: ${sched}.`;
  }, [course, topics, exam, slots, today]);

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight, behavior: "smooth" });
  }, [messages?.length, busy]);

  async function ask() {
    const q = draft.trim();
    if (!q || busy) return;
    setDraft("");
    setError(null);
    setBusy(true);
    await db.course_chats.add({ course_id: courseId, sender: "user", text: q, ts: Date.now() });
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "coach", question: q, context }),
      });
      if (!res.ok) throw new Error("failed");
      const j = await res.json();
      await db.course_chats.add({ course_id: courseId, sender: "reso", text: j.reply ?? "I'm here — try asking again in a moment.", ts: Date.now() });
    } catch {
      setError("Reso couldn't reach the coach just now — your question is saved, try again in a moment.");
      await db.course_chats.add({ course_id: courseId, sender: "reso", text: "I couldn't reach the coach just now. Your question is saved — try again in a moment.", ts: Date.now() });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div ref={boxRef} className="max-h-64 overflow-y-auto space-y-2.5 mb-3 pr-1" aria-live="polite">
        {(messages ?? []).length === 0 && (
          <p className="text-sm text-[var(--ink-soft)]">
            Ask anything about this course — "what should I revise first?", "how do I split the days before the exam?"
          </p>
        )}
        {(messages ?? []).map((m) => (
          <div key={m.id} className={`flex ${m.sender === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                m.sender === "user"
                  ? "bg-[var(--ink)] text-[var(--page)] rounded-br-md"
                  : "neo rounded-bl-md text-[var(--ink)]"
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="neo rounded-2xl px-4 py-2.5 flex items-center gap-2 animate-pulse-soft">
              <Loader2 size={14} className="animate-spin text-[var(--accent)]" aria-hidden />
              <span className="text-sm text-[var(--ink-soft)]">Thinking about your course…</span>
            </div>
          </div>
        )}
      </div>

      {error && <p className="text-xs text-amber-600 dark:text-amber-300 mb-2">{error}</p>}

      <form onSubmit={(e) => { e.preventDefault(); ask(); }} className="flex gap-2 items-center">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask about your tests or revision…"
          aria-label="Ask about this course"
          className="focus-ring flex-1 rounded-xl px-4 py-2.5 text-sm bg-[var(--neo-base)] text-[var(--ink)] border border-white/30 dark:border-white/5 shadow-[inset_3px_3px_7px_rgba(10,10,15,0.08),inset_-3px_-3px_7px_rgba(255,255,255,0.7)] dark:shadow-[inset_3px_3px_8px_rgba(0,0,0,0.5),inset_-3px_-3px_7px_rgba(255,255,255,0.04)]"
        />
        <NeoButton type="submit" variant="accent" disabled={busy || !draft.trim()} ariaLabel="Send question" className="!px-3.5">
          <Send size={16} aria-hidden />
        </NeoButton>
      </form>
    </div>
  );
}
