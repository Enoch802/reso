"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  UserRound, CalendarRange, BookOpenCheck, CalendarClock, Wallet2, Plus, Trash2, Check, Loader2,
} from "lucide-react";
import { db, Course, CourseType } from "@/lib/db";
import { NeoButton, Field, GlassCard, NeoCheck } from "./ui";
import TimetableUpload, { ReviewRow, dayToNum } from "./TimetableUpload";
import { loadSampleData } from "@/lib/seed";
import { DAY_NAMES, todayStr } from "@/lib/dates";

type Draft = {
  code: string; title: string; credit_units: string; course_type: CourseType;
  ca_weight: string; exam_weight: string; t1_weight: string; t2_weight: string;
};

const newDraft = (): Draft => ({
  code: "", title: "", credit_units: "3", course_type: "general",
  ca_weight: "30", exam_weight: "70", t1_weight: "15", t2_weight: "15",
});

const STEPS = ["You", "Semester", "Courses", "Timetable", "Money & routines"];

export default function Onboarding({ newSemesterMode }: { newSemesterMode: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState(newSemesterMode ? 1 : 0);
  const [saving, setSaving] = useState(false);

  // Step 1 — profile
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [university, setUniversity] = useState("");

  // Step 2 — semester
  const [start, setStart] = useState(todayStr());
  const [end, setEnd] = useState("");
  const [gpaTarget, setGpaTarget] = useState("4.5");

  // Step 3 — courses
  const [drafts, setDrafts] = useState<Draft[]>([newDraft()]);
  const [savedCourses, setSavedCourses] = useState<Course[]>([]);

  // Step 5 — finance & routine
  const [allowance, setAllowance] = useState("");
  const [collectionDay, setCollectionDay] = useState("0");
  const [dailyTarget, setDailyTarget] = useState("");
  const [savingsTarget, setSavingsTarget] = useState("");
  const [routineName, setRoutineName] = useState("");
  const [routineDays, setRoutineDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [routineTime, setRoutineTime] = useState("06:30");

  const stepOk = useMemo(() => {
    switch (step) {
      case 0: return name.trim().length > 0 && university.trim().length > 0;
      case 1: return start && end && end > start;
      case 2: return drafts.every(validDraft);
      case 3: return true; // manual or upload — skippable
      case 4: return allowance.length > 0;
      default: return true;
    }
  }, [step, name, university, start, end, drafts, allowance]);

  const gpaNum = Math.max(0, Math.min(5, parseFloat(gpaTarget) || 0));

  async function finish() {
    setSaving(true);
    const existing = await db.profile.toArray();
    if (existing[0]) {
      await db.profile.update(existing[0].id!, {
        name: existing[0].name || name, age: existing[0].age || parseInt(age) || 0,
        university: existing[0].university || university,
        gpa_target: gpaNum, semester_start_date: start, semester_end_date: end,
        onboarding_complete: 1, new_semester_mode: 0,
      });
    } else {
      await db.profile.add({
        name, age: parseInt(age) || 0, university,
        gpa_target: gpaNum, semester_start_date: start, semester_end_date: end,
        onboarding_complete: 1, theme_preference: "system",
      });
    }
    await db.finance_settings.add({
      allowance_collection_day: parseInt(collectionDay),
      current_allowance_amount: parseFloat(allowance) || 0,
      daily_spending_target: parseFloat(dailyTarget) || 0,
      weekly_savings_target: parseFloat(savingsTarget) || 0,
    });
    if (routineName.trim()) {
      await db.routines.add({
        name: routineName.trim(),
        schedule_type: routineDays.length === 7 ? "daily" : "specific_days",
        schedule_days: routineDays.length ? routineDays : [1, 2, 3, 4, 5],
        reminder_time: routineTime,
      });
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-10 min-h-screen">
      {/* Step progress */}
      <div className="flex items-center gap-1.5 mb-8" aria-label={`Step ${step + 1} of 5: ${STEPS[step]}`}>
        {STEPS.map((s, i) => (
          <div
            key={s}
            className={`h-1.5 rounded-full flex-1 transition-colors duration-500 ${i <= step ? "bg-[var(--accent)]" : "bg-black/10 dark:bg-white/10"}`}
          />
        ))}
      </div>
      <p className="text-xs uppercase tracking-[0.16em] text-[var(--ink-faint)] mb-2">Step {step + 1} of 5</p>

      {step === 0 && (
        <StepShell icon={<UserRound size={22} />} title="First, who's this semester for?">
          <Field label="Your name" value={name} onChange={setName} />
          <Field label="Age" value={age} onChange={setAge} type="number" className="mt-4" />
          <Field label="University" value={university} onChange={setUniversity} className="mt-4" />
          <div className="mt-6 neo-inset p-4 text-sm text-[var(--ink-soft)]">
            <p className="font-medium text-[var(--ink)] mb-1">Just looking around first?</p>
            <p className="mb-3">Load a few weeks of sample history instead — courses, money cycles, routines, a digest. Clearable any time from Settings.</p>
            <NeoButton
              onClick={async () => {
                const p = (await import("@/lib/db")).db.profile;
                const existing = await p.toArray();
                if (existing[0]) {
                  await p.update(existing[0].id!, { name: name || existing[0].name || "Student", onboarding_complete: 1 });
                } else {
                  await p.add({
                    name: name || "Student", age: parseInt(age) || 19, university: university || "University",
                    gpa_target: 4.5, semester_start_date: start, semester_end_date: end,
                    onboarding_complete: 1, theme_preference: "system",
                  });
                }
                await loadSampleData();
                router.push("/overview");
                router.refresh();
              }}
            >Explore with sample data</NeoButton>
          </div>
        </StepShell>
      )}

      {step === 1 && (
        <StepShell icon={<CalendarRange size={22} />} title="When does this semester run?">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Starts" value={start} onChange={setStart} type="date" />
            <Field label="Ends" value={end} onChange={setEnd} type="date" />
          </div>
          <Field label="GPA target (out of 5.0)" value={gpaTarget} onChange={setGpaTarget} type="number" step="0.1" min={0} max={5} className="mt-4" />
          <p className="text-sm text-[var(--ink-soft)] mt-4">This is the number Reso holds your work against — kindly, never harshly.</p>
        </StepShell>
      )}

      {step === 2 && (
        <StepShell icon={<BookOpenCheck size={22} />} title="Your courses" sub="General or Departmental decides how the CA is structured.">
          {drafts.map((d, i) => {
            const set = (patch: Partial<Draft>) => setDrafts((ds) => ds.map((x, j) => (j === i ? { ...x, ...patch } : x)));
            const totalCa = d.course_type === "general"
              ? parseFloat(d.ca_weight) || 0
              : (parseFloat(d.t1_weight) || 0) + (parseFloat(d.t2_weight) || 0);
            const sumsTo100 = Math.round(totalCa + (parseFloat(d.exam_weight) || 0)) === 100;
            return (
              <GlassCard key={i} className="p-5 mb-4">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Course code" value={d.code} onChange={(v) => set({ code: v.toUpperCase() })} placeholder="CSC141" />
                  <Field label="Credit units" value={d.credit_units} onChange={(v) => set({ credit_units: v })} type="number" />
                </div>
                <Field label="Title" value={d.title} onChange={(v) => set({ title: v })} placeholder="Computer Programming I" className="mt-3" />
                <p className="text-xs font-medium text-[var(--ink-faint)] mt-4 mb-2 uppercase tracking-wide">Course type</p>
                <div className="grid grid-cols-2 gap-3">
                  {(["general", "departmental"] as CourseType[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => set({ course_type: t })}
                      aria-pressed={d.course_type === t}
                      className={`focus-ring rounded-xl px-4 py-3 text-sm font-medium min-h-[44px] transition-all ${d.course_type === t ? "neo-pressed text-[var(--accent)]" : "neo text-[var(--ink-soft)]"}`}
                    >
                      {t === "general" ? "General" : "Departmental"}
                      <span className="block text-[11px] font-normal mt-0.5 opacity-80">
                        {t === "general" ? "One combined CA" : "Test 1 + Test 2"}
                      </span>
                    </button>
                  ))}
                </div>
                {d.course_type === "general" ? (
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <Field label="CA weight %" value={d.ca_weight} onChange={(v) => set({ ca_weight: v })} type="number" />
                    <Field label="Exam weight %" value={d.exam_weight} onChange={(v) => set({ exam_weight: v })} type="number" />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                    <Field label="Test 1 %" value={d.t1_weight} onChange={(v) => set({ t1_weight: v })} type="number" />
                    <Field label="Test 2 %" value={d.t2_weight} onChange={(v) => set({ t2_weight: v })} type="number" />
                    <Field label="Exam %" value={d.exam_weight} onChange={(v) => set({ exam_weight: v })} type="number" />
                  </div>
                )}
                <div className={`mt-3 text-sm ${sumsTo100 ? "text-emerald-600 dark:text-emerald-300" : "text-amber-600 dark:text-amber-300"}`}>
                  {sumsTo100 ? "Weights sum to 100 — good to go." : `CA (${totalCa}%) + exam (${parseFloat(d.exam_weight) || 0}%) should equal 100.`}
                </div>
                {drafts.length > 1 && (
                  <button
                    onClick={() => setDrafts((ds) => ds.filter((_, j) => j !== i))}
                    aria-label={`Remove ${d.code || "course"}`}
                    className="focus-ring mt-3 text-[var(--ink-faint)] hover:text-rose-500 transition-colors"
                  >
                    <Trash2 size={16} aria-hidden />
                  </button>
                )}
              </GlassCard>
            );
          })}
          <NeoButton onClick={() => setDrafts((ds) => [...ds, newDraft()])}>
            <span className="inline-flex items-center gap-2"><Plus size={16} aria-hidden /> Add another course</span>
          </NeoButton>
        </StepShell>
      )}

      {step === 3 && (
        <StepShell icon={<CalendarClock size={22} />} title="Your class timetable" sub="Snap a photo of it and let the reader do the typing — or skip and add by hand later in Settings.">
          <TimetableUpload
            kind="class"
            courseCodes={drafts.filter(validDraft).map((d) => d.code.toUpperCase())}
            onCodesFound={async (codes) => {
              // Extracted codes directly populate/sync the course list.
              for (const code of codes) {
                const known = drafts.some((d) => d.code.toUpperCase() === code);
                if (!known) {
                  setDrafts((ds) => [...ds, { ...newDraft(), code }]);
                }
              }
            }}
            onSave={async (rows: ReviewRow[]) => {
              // Ensure codes exist as courses, then save slots.
              for (const r of rows) {
                const code = r.course_code.toUpperCase();
                if (!code) continue;
                let course = savedCourses.find((c) => c.code === code);
                if (!course) {
                  const all = await db.courses.where("code").equals(code).toArray();
                  course = all[0];
                }
                if (!course) {
                  const id = await db.courses.add({
                    code, title: code, credit_units: 3, course_type: "general",
                    ca_weight_percent: 30, exam_weight_percent: 70, target_grade_point: 4,
                  });
                  course = { id, code, title: code, credit_units: 3, course_type: "general", ca_weight_percent: 30, exam_weight_percent: 70, target_grade_point: 4 };
                }
                const day = dayToNum(r.day);
                if (day == null) continue;
                await db.timetable_slots.add({
                  course_id: course.id!, day_of_week: day,
                  start_time: r.start_time, end_time: r.end_time, venue: "",
                });
              }
            }}
          />
          <div className="mt-6 p-4 rounded-2xl neo-pressed text-sm text-[var(--ink-soft)]">
            Your timetable lives on this device. Nothing is uploaded anywhere except the photo you choose, and only to read it.
          </div>
        </StepShell>
      )}

      {step === 4 && (
        <StepShell icon={<Wallet2 size={22} />} title="Money and one routine to start">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Weekly allowance" value={allowance} onChange={setAllowance} type="number" placeholder="10000" />
            <Field label="Collection day" value={collectionDay} onChange={setCollectionDay} type="number" min={0} max={6} placeholder="0 = Sunday" />
          </div>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <Field label="Daily spend target" value={dailyTarget} onChange={setDailyTarget} type="number" placeholder="1200" />
            <Field label="Weekly savings target" value={savingsTarget} onChange={setSavingsTarget} type="number" placeholder="2000" />
          </div>
          <div className="h-px bg-black/5 dark:bg-white/5 my-6" />
          <p className="text-xs font-medium text-[var(--ink-faint)] mb-3 uppercase tracking-wide">First routine</p>
          <Field label="Name" value={routineName} onChange={setRoutineName} placeholder="Gym — optional, you can add later" />
          <div className="mt-3">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
              <p className="text-xs text-[var(--ink-faint)]">Days</p>
              <div className="flex gap-1.5">
                <button type="button" onClick={() => setRoutineDays([0, 1, 2, 3, 4, 5, 6])}
                  className="focus-ring rounded-lg px-2.5 py-1 text-[11px] font-semibold neo text-[var(--ink-soft)]">Every day</button>
                <button type="button" onClick={() => setRoutineDays([])}
                  className="focus-ring rounded-lg px-2.5 py-1 text-[11px] font-semibold neo text-[var(--ink-faint)]">Clear</button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {DAY_NAMES.map((d, i) => (
                <button
                  key={d}
                  aria-pressed={routineDays.includes(i)}
                  aria-label={d}
                  onClick={() => setRoutineDays((ds) => (ds.includes(i) ? ds.filter((x) => x !== i) : [...ds, i]))}
                  className={`focus-ring w-11 h-11 rounded-xl text-xs font-semibold transition-all ${routineDays.includes(i) ? "neo-pressed text-[var(--accent)]" : "neo text-[var(--ink-faint)]"}`}
                >
                  {d.slice(0, 2)}
                </button>
              ))}
            </div>
          </div>
          <Field label="Reminder time" value={routineTime} onChange={setRoutineTime} type="time" className="mt-4" />
        </StepShell>
      )}

      {/* Nav */}
      <div className="flex items-center justify-between mt-8">
        <NeoButton onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>Back</NeoButton>
        {step < 4 ? (
          <NeoButton variant="accent" disabled={!stepOk} onClick={() => advance()} className="font-semibold">
            {step === 3 ? "Skip for now" : "Continue"}
          </NeoButton>
        ) : (
          <NeoButton variant="accent" disabled={!stepOk || saving} onClick={finish} className="font-semibold">
            <span className="inline-flex items-center gap-2">
              {saving ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Check size={16} aria-hidden />}
              {saving ? "Setting things up…" : "Start my semester"}
            </span>
          </NeoButton>
        )}
      </div>
    </div>
  );

  async function advance() {
    if (step === 2) {
      // Persist the course drafts (and their CA components) before the timetable step.
      const saved: Course[] = [];
      for (const d of drafts.filter(validDraft)) {
        const ca = d.course_type === "general"
          ? parseFloat(d.ca_weight) || 0
          : (parseFloat(d.t1_weight) || 0) + (parseFloat(d.t2_weight) || 0);
        const id = await db.courses.add({
          code: d.code.trim().toUpperCase(), title: d.title.trim() || d.code.trim().toUpperCase(),
          credit_units: parseFloat(d.credit_units) || 3, course_type: d.course_type,
          ca_weight_percent: ca, exam_weight_percent: parseFloat(d.exam_weight) || 0,
          target_grade_point: 4,
        });
        if (d.course_type === "general") {
          await db.course_ca_components.add({ course_id: id, label: "CA", weight_percent: ca });
        } else {
          await db.course_ca_components.add({ course_id: id, label: "Test 1", weight_percent: parseFloat(d.t1_weight) || 0 });
          await db.course_ca_components.add({ course_id: id, label: "Test 2", weight_percent: parseFloat(d.t2_weight) || 0 });
        }
        const full = await db.courses.get(id);
        if (full) saved.push(full);
      }
      setSavedCourses(saved);
    }
    setStep((s) => s + 1);
  }
}

function validDraft(d: Draft): boolean {
  if (!d.code.trim()) return false;
  const totalCa = d.course_type === "general"
    ? parseFloat(d.ca_weight) || 0
    : (parseFloat(d.t1_weight) || 0) + (parseFloat(d.t2_weight) || 0);
  return Math.round(totalCa + (parseFloat(d.exam_weight) || 0)) === 100;
}

function StepShell({ icon, title, sub, children }: { icon: React.ReactNode; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="animate-fade-up">
      <div className="flex items-center gap-3 mb-6">
        <span className="neo-sm w-11 h-11 rounded-xl flex items-center justify-center text-[var(--accent)]" aria-hidden>{icon}</span>
        <h1 className="font-serif text-2xl sm:text-3xl tracking-tight text-[var(--ink)]">{title}</h1>
      </div>
      {sub && <p className="text-sm text-[var(--ink-soft)] -mt-3 mb-6">{sub}</p>}
      {children}
    </div>
  );
}
