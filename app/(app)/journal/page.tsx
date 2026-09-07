"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Mic, Send, History, Loader2, X } from "lucide-react";
import { db } from "@/lib/db";
import type { DailyLog } from "@/lib/db";
import { GlassCard, EmptyState, Modal, NeoButton, Tag } from "@/components/ui";
import { useToday } from "@/components/AppShell";
import { aiChat } from "@/lib/ai";
import { todayStr, addDays, fmtMins } from "@/lib/dates";

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
}

export default function JournalPage() {
  const today = useToday();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  const messages = useLiveQuery(
    () => db.chat_messages.where("date").equals(today).toArray(),
    [today]
  );
  const allMessages = useLiveQuery(() => db.chat_messages.orderBy("timestamp").reverse().limit(200).toArray(), []);
  const dailyLog = useLiveQuery(() => db.daily_logs.where("date").equals(today).toArray(), [today]);
  const yesterdayLog = useLiveQuery(
    () => db.daily_logs.where("date").equals(addDays(today, -1)).toArray(),
    [today]
  );

  const courses = useLiveQuery(() => db.courses.toArray(), []);
  const pendingScores = useLiveQuery(
    () => db.course_scores.where("status").equals("pending").toArray(),
    []
  );

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages?.length, busy]);

  const context = useMemo(() => {
    const courseList = (courses ?? []).map((c) => c.code).join(", ") || "none";
    const pend = (pendingScores ?? []).map((p) => `${p.label} (course_id ${p.course_id})`).join("; ") || "none";
    const existing = (dailyLog ?? [])[0]?.evening_reflection_text ?? "";
    return `Courses: ${courseList}. Pending unscored assessments: ${pend}. Already reflected today: ${existing ? "yes" : "no"}. Today: ${today}.`;
  }, [courses, pendingScores, dailyLog, today]);

  async function send(text?: string) {
    const content = (text ?? draft).trim();
    if (!content || busy) return;
    setDraft("");
    setError(null);
    setBusy(true);
    await db.chat_messages.add({ date: today, sender: "user", text: content, timestamp: Date.now() });
    try {
      const parsed = await aiChat(content, context);

      // Apply structured understanding locally.
      await db.chat_messages.add({ date: today, sender: "reso", text: parsed.reply, timestamp: Date.now() });

      const logRow = (await db.daily_logs.where("date").equals(today).toArray())[0];
      const prevText = logRow?.evening_reflection_text ?? "";
      const patch: Record<string, unknown> = {
        date: today,
        evening_reflection_text: prevText ? `${prevText}\n${content}` : content,
        parsed_summary: parsed.reply,
      };
      if (parsed.study_hours != null) patch.parsed_study_hours = parsed.study_hours;
      if (parsed.mood) patch.mood_state = parsed.mood;
      if (logRow) await db.daily_logs.update(logRow.id!, patch);
      else
        await db.daily_logs.add({
          date: today,
          evening_reflection_text: patch.evening_reflection_text as string,
          mood_state: (patch.mood_state as string) ?? "",
          parsed_study_hours: (patch.parsed_study_hours as number) ?? null,
          parsed_summary: parsed.reply,
        });

      // Pending-assessment memory: mention a test with no score -> pending entry.
      for (const m of parsed.mentioned_pending ?? []) {
        const course = matchCourse(m.course_hint);
        if (!course?.id) continue; // Reso's reply asks for clarification when ambiguous
        const dupe = (pendingScores ?? []).some((p) => p.course_id === course.id && p.label.toLowerCase() === m.label.toLowerCase());
        if (dupe) continue;
        const comp = (await db.course_ca_components.where("course_id").equals(course.id).toArray())
          .find((c) => m.label.toLowerCase().includes(c.label.toLowerCase().replace("test", "test")) || c.label === "CA");
        await db.course_scores.add({
          course_id: course.id!,
          ca_component_id: comp?.id ?? null,
          label: m.label,
          score_obtained: null,
          score_max: 100,
          component: "CA",
          date_recorded: todayStr(),
          was_impromptu: 1,
          status: "pending",
        });
      }

      // A score mentioned later resolves the right pending entry.
      for (const s of parsed.mentioned_score ?? []) {
        const course = matchCourse(s.course_hint);
        if (!course?.id) continue;
        const comps = await db.course_ca_components.where("course_id").equals(course.id).toArray();
        const matchPend = (pendingScores ?? []).find(
          (p) => p.course_id === course.id && p.label.toLowerCase() === s.label.toLowerCase()
        ) ?? (pendingScores ?? []).find((p) => p.course_id === course.id);
        if (matchPend) {
          await db.course_scores.update(matchPend.id!, {
            score_obtained: (s.percent / 100) * matchPend.score_max,
            status: "confirmed",
            label: s.label || matchPend.label,
            ca_component_id: matchPend.ca_component_id ?? comps[0]?.id ?? null,
          });
        } else {
          const comp = comps.find((c) => s.label.toLowerCase().includes(c.label.toLowerCase())) ?? comps[0];
          await db.course_scores.add({
            course_id: course.id!,
            ca_component_id: comp?.id ?? null,
            label: s.label || comp?.label || "Assessment",
            score_obtained: (s.percent / 100) * 100,
            score_max: 100,
            component: "CA",
            date_recorded: todayStr(),
            was_impromptu: 0,
            status: "confirmed",
          });
        }
      }
    } catch {
      setError("Reso couldn't reach the listener just now. Your words are saved — try sending again in a moment.");
      await db.chat_messages.add({
        date: today, sender: "reso",
        text: "I couldn't reach the listener just now, but your words are saved on this device. Try again in a moment.",
        timestamp: Date.now(),
      });
    } finally {
      setBusy(false);
    }
  }

  function matchCourse(hint: string) {
    const h = hint.trim().toUpperCase();
    if (!h) return undefined;
    return (courses ?? []).find((c) => c.code.toUpperCase() === h)
      ?? (courses ?? []).find((c) => c.code.toUpperCase().includes(h) || h.includes(c.code.toUpperCase()))
      ?? (courses ?? []).find((c) => c.title.toUpperCase().includes(h));
  }

  function toggleVoice() {
    if (listening) { recRef.current?.stop(); return; }
    const W = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
    const SR = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!SR) { setError("Voice isn't available in this browser — typing works just as well."); return; }
    const rec = new SR();
    rec.lang = "en-US";
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (e) => {
      const text = Array.from({ length: e.results.length }).map((_, i) => e.results[i][0].transcript).join(" ");
      setDraft((prev) => (prev ? `${prev} ${text}`.trim() : text));
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  }

  const grouped = useMemo(() => {
    const byDate = new Map<string, typeof allMessages>();
    for (const m of allMessages ?? []) {
      const arr = byDate.get(m.date) ?? [];
      arr.push(m);
      byDate.set(m.date, arr);
    }
    return Array.from(byDate.entries()).filter(([d]) => d !== today).slice(0, 14);
  }, [allMessages, today]);

  return (
    <div className="max-w-2xl mx-auto flex flex-col h-[calc(100vh-11.5rem)] lg:h-[calc(100vh-10rem)]">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4 animate-fade-up">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl tracking-tight text-[var(--ink)]">Journal</h1>
          <p className="text-sm text-[var(--ink-soft)] mt-0.5">Evening reflection, or anything at all. Type or speak.</p>
        </div>
        <NeoButton onClick={() => setShowHistory(true)} ariaLabel="Earlier days">
          <span className="inline-flex items-center gap-2"><History size={16} aria-hidden /> Earlier days</span>
        </NeoButton>
      </div>

      <GlassCard className="flex-1 min-h-0 flex flex-col p-4 animate-fade-up [animation-delay:100ms]">
        <div ref={listRef} className="flex-1 overflow-y-auto space-y-3 pr-1" aria-live="polite">
          {messages?.length === 0 && (
            <EmptyState
              icon={<Mic size={24} aria-hidden />}
              title="How did today go?"
              sub="Mention a test you wrote, hours you studied, how you're feeling. Reso remembers the open threads and closes them when the scores come."
            />
          )}
          {messages?.map((m) => (
            <div key={m.id} className={`flex ${m.sender === "user" ? "justify-end" : "justify-start"} animate-fade-up`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap
                  ${m.sender === "user"
                    ? "bg-accent-600 text-white dark:bg-accent-400 dark:text-[#14132a] rounded-br-md"
                    : "neo rounded-bl-md text-[var(--ink)]"}`}
              >
                {m.text}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex justify-start">
              <div className="neo rounded-2xl rounded-bl-md px-5 py-3.5 flex items-center gap-2 animate-pulse-soft">
                <Loader2 size={15} className="animate-spin text-[var(--accent)]" aria-hidden />
                <span className="text-sm text-[var(--ink-soft)]">Reso is listening…</span>
              </div>
            </div>
          )}
        </div>

        {error && <p className="text-sm text-amber-600 dark:text-amber-300 mt-2">{error}</p>}

        <form
          onSubmit={(e) => { e.preventDefault(); send(); }}
          className="pt-3 mt-2 sticky bottom-0"
        >
          <div className="flex gap-2 items-center">
            <button
              type="button"
              onClick={toggleVoice}
              aria-label={listening ? "Stop voice input" : "Start voice input"}
              aria-pressed={listening}
              className={`focus-ring shrink-0 w-[52px] h-[52px] rounded-xl flex items-center justify-center transition-all ${listening ? "neo-pressed text-rose-500" : "neo text-[var(--accent)]"}`}
            >
              {listening ? <X size={19} aria-hidden /> : <Mic size={19} aria-hidden />}
            </button>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={listening ? "Listening…" : "Today I…"}
              aria-label="Journal entry"
              className="focus-ring flex-1 rounded-xl px-4 py-3.5 text-[15px] bg-[var(--neo-base)] text-[var(--ink)]
                shadow-[inset_3px_3px_7px_rgba(58,56,82,0.1),inset_-3px_-3px_7px_rgba(255,255,255,0.75)]
                dark:shadow-[inset_3px_3px_8px_rgba(0,0,0,0.45),inset_-3px_-3px_7px_rgba(255,255,255,0.04)]
                border border-white/30 dark:border-white/5"
            />
            <NeoButton type="submit" disabled={busy || !draft.trim()} variant="accent" ariaLabel="Send" className="!px-4 !min-h-[52px]">
              <Send size={18} aria-hidden />
            </NeoButton>
          </div>
        </form>
      </GlassCard>

      {dailyLog && dailyLog[0]?.mood_state === "sick" && (
        <div className="mt-3 flex justify-center">
          <Tag>rest day — nothing today counts against you</Tag>
        </div>
      )}
      {typeof yesterdayLog?.[0]?.screen_time_minutes === "number" && (
        <p className="mt-3 text-center text-xs text-[var(--ink-faint)]">
          Yesterday's screen time: {fmtMins(yesterdayLog[0].screen_time_minutes!)}
          {yesterdayLog[0].screen_time_top_app ? `, most of it in ${yesterdayLog[0].screen_time_top_app}` : ""}
          {" "}— just context, never a verdict.
        </p>
      )}

      <Modal open={showHistory} onClose={() => setShowHistory(false)} title="Earlier days" wide>
        {grouped.length === 0 && <p className="text-sm text-[var(--ink-soft)]">Nothing from before yet — this is where your past reflections will gather.</p>}
        <div className="space-y-5">
          {grouped.map(([date, msgs]) => (
            <div key={date}>
              <p className="text-xs uppercase tracking-[0.14em] text-[var(--ink-faint)] mb-2">{date}</p>
              <div className="space-y-2">
                {(msgs ?? []).sort((a, b) => a.timestamp - b.timestamp).map((m) => (
                  <div key={m.id} className={`flex ${m.sender === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] rounded-xl px-3.5 py-2 text-sm ${m.sender === "user" ? "bg-accent-600/90 text-white dark:bg-accent-400/90 dark:text-[#14132a]" : "neo text-[var(--ink)]"}`}>
                      {m.text}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
