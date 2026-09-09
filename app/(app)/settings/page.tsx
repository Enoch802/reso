"use client";
import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  UserRound, CalendarRange, BookOpenCheck, CalendarClock, CalendarDays, CalendarCheck2, AlarmClock, NotebookPen,
  Wallet2, Repeat2, Mail, Palette, Database, ChevronRight, ChevronDown, Bell, Download, Award, Trash2,
} from "lucide-react";
import { db, exportAllData, getScreenTimeEnabled, setScreenTimeEnabled, getMeta, setMeta } from "@/lib/db";
import { loadSampleData, clearSampleData } from "@/lib/seed";
import { GlassCard, SectionHeader, Field, NeoButton, Modal, Tag, EmptyState } from "@/components/ui";
import TimetableUpload, { ReviewRow, dayToNum } from "@/components/TimetableUpload";
import Recap from "@/components/Recap";
import { ExamEditor } from "@/components/academics-exam";
import { fmtMoney } from "@/lib/dates";
import { googleConfigured, requestGmailAccess } from "@/lib/google";
import { syncNativeAlarms, scheduleNativeIfRunning } from "@/lib/alarm";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { fetchRankedEmails } from "@/lib/ai";
import { screenTimeAvailable, screenTimePermission, openScreenTimeSettings, pullYesterdayScreenTime } from "@/lib/screentime";
import { Hourglass } from "lucide-react";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function SettingsPage() {
  const [openCard, setOpenCard] = useState<string | null>(null);

  const profile = useLiveQuery(() => db.profile.toArray(), []);
  const courses = useLiveQuery(() => db.courses.toArray(), []);
  const exams = useLiveQuery(() => db.exams.toArray(), []);
  const routines = useLiveQuery(() => db.routines.toArray(), []);
  const fs = useLiveQuery(() => db.finance_settings.toArray(), []);
  const emailAccounts = useLiveQuery(() => db.email_accounts.toArray(), []);
  const archived = useLiveQuery(() => db.archived_semesters.toArray(), []);
  const studySlots = useLiveQuery(() => db.personal_study_slots.toArray(), []);
  const slots = useLiveQuery(() => db.timetable_slots.toArray(), []);

  const p = profile?.[0];

  const cards = [
    { id: "profile", icon: <UserRound size={17} />, label: "Profile", detail: p ? `${p.name} — ${p.university}` : "" },
    { id: "semester", icon: <CalendarRange size={17} />, label: "Semester", detail: p ? `${p.semester_start_date} to ${p.semester_end_date} · GPA target ${p.gpa_target}` : "" },
    { id: "courses", icon: <BookOpenCheck size={17} />, label: "Courses", detail: `${courses?.length ?? 0} courses` },
    { id: "timetable", icon: <CalendarClock size={17} />, label: "Class timetable", detail: `${slots?.length ?? 0} slots` },
    { id: "examdates", icon: <CalendarDays size={17} />, label: "Exam dates", detail: `${exams?.length ?? 0} set` },
    { id: "examtt", icon: <CalendarCheck2 size={17} />, label: "Exam timetable upload", detail: "official document, when it arrives" },
    { id: "studytt", icon: <NotebookPen size={17} />, label: "Personal study timetable", detail: `${studySlots?.length ?? 0} blocks` },
    { id: "finance", icon: <Wallet2 size={17} />, label: "Finance", detail: fs?.[0] ? `${fmtMoney(fs[0].current_allowance_amount)} weekly` : "" },
    { id: "routines", icon: <Repeat2 size={17} />, label: "Routines", detail: `${routines?.length ?? 0} active` },
    { id: "email", icon: <Mail size={17} />, label: "Email", detail: emailAccounts?.length ? `${emailAccounts.length} connected` : "not connected" },
    { id: "screentime", icon: <Hourglass size={17} />, label: "Screen time tracking", detail: "Android, optional" },
    { id: "reminders", icon: <Bell size={17} />, label: "Reminders", detail: "on or off, and when" },
    { id: "alarms", icon: <AlarmClock size={17} />, label: "Alarms", detail: "named alarms that ring" },
    { id: "appearance", icon: <Palette size={17} />, label: "Appearance", detail: p?.theme_preference ?? "system" },
    { id: "data", icon: <Database size={17} />, label: "Data & recap", detail: "export, archive, recap" },
  ];

  return (
    <div className="space-y-6 pb-8 max-w-3xl mx-auto">
      <div className="animate-fade-up">
        <h1 className="font-serif text-3xl sm:text-4xl tracking-tight text-[var(--ink)]">Settings</h1>
        <p className="text-sm text-[var(--ink-soft)] mt-1">Everything here lives on this device only.</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {cards.map((c, i) => (
          <button
            key={c.id}
            onClick={() => setOpenCard(c.id)}
            className="focus-ring text-left glass rounded-2xl p-4 flex items-center gap-3.5 overflow-hidden hover:-translate-y-0.5 transition-transform animate-fade-up"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <span className="neo-sm w-10 h-10 rounded-xl flex items-center justify-center text-[var(--accent)] shrink-0" aria-hidden>{c.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-[var(--ink)] text-[15px]">{c.label}</p>
              <p className="text-xs text-[var(--ink-faint)] truncate">{c.detail}</p>
            </div>
            <ChevronRight size={16} className="text-[var(--ink-faint)] shrink-0" aria-hidden />
          </button>
        ))}
      </div>

      {/* Notifications opt-in */}
      <GlassCard className="p-5 animate-fade-up">
        <SectionHeader icon={<Bell size={18} aria-hidden />} title="Notification access" sub="Reso needs your okay once to show any reminder on this device." />
        <NotifButton />
      </GlassCard>

      <ProfileModal open={openCard === "profile"} onClose={() => setOpenCard(null)} />
      <SemesterModal open={openCard === "semester"} onClose={() => setOpenCard(null)} />
      <CoursesModal open={openCard === "courses"} onClose={() => setOpenCard(null)} />
      <TimetableModal open={openCard === "timetable"} onClose={() => setOpenCard(null)} />
      <ExamDatesModal open={openCard === "examdates"} onClose={() => setOpenCard(null)} />
      <ExamTTModal open={openCard === "examtt"} onClose={() => setOpenCard(null)} />
      <StudyTTModal open={openCard === "studytt"} onClose={() => setOpenCard(null)} />
      <FinanceModal open={openCard === "finance"} onClose={() => setOpenCard(null)} />
      <RoutinesModal open={openCard === "routines"} onClose={() => setOpenCard(null)} />
      <EmailModal open={openCard === "email"} onClose={() => setOpenCard(null)} />
      <ScreenTimeModal open={openCard === "screentime"} onClose={() => setOpenCard(null)} />
      <RemindersModal open={openCard === "reminders"} onClose={() => setOpenCard(null)} />
      <AlarmsModal open={openCard === "alarms"} onClose={() => setOpenCard(null)} />
      <AppearanceModal open={openCard === "appearance"} onClose={() => setOpenCard(null)} />
      <DataModal open={openCard === "data"} onClose={() => setOpenCard(null)} />
    </div>
  );
}

function NotifButton() {
  const [state, setState] = useState<string>("default");
  useEffect(() => {
    if (typeof Notification !== "undefined") setState(Notification.permission);
  }, []);
  if (state === "granted") return <Tag tone="good">Reminders are on</Tag>;
  return (
    <NeoButton onClick={async () => setState(await Notification.requestPermission())}>
      Turn on reminders
    </NeoButton>
  );
}

function ProfileModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const profile = useLiveQuery(() => db.profile.toArray(), [], undefined);
  const [name, setName] = useState(""); const [age, setAge] = useState(""); const [uni, setUni] = useState("");
  useEffect(() => {
    const p = profile?.[0];
    if (p && open) { setName(p.name); setAge(String(p.age)); setUni(p.university); }
  }, [profile, open]);
  return (
    <Modal open={open} onClose={onClose} title="Profile">
      <form onSubmit={async (e) => {
        e.preventDefault();
        const p = profile?.[0];
        if (p) await db.profile.update(p.id!, { name, age: parseInt(age) || 0, university: uni });
        onClose();
      }} className="space-y-4">
        <Field label="Name" value={name} onChange={setName} />
        <Field label="Age" value={age} onChange={setAge} type="number" />
        <Field label="University" value={uni} onChange={setUni} />
        <div className="flex justify-end"><NeoButton type="submit" variant="accent" className="font-semibold">Save</NeoButton></div>
      </form>
    </Modal>
  );
}

function SemesterModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const profile = useLiveQuery(() => db.profile.toArray(), [], undefined);
  const [start, setStart] = useState(""); const [end, setEnd] = useState(""); const [target, setTarget] = useState("");
  useEffect(() => {
    const p = profile?.[0];
    if (p && open) { setStart(p.semester_start_date); setEnd(p.semester_end_date); setTarget(String(p.gpa_target)); }
  }, [profile, open]);
  return (
    <Modal open={open} onClose={onClose} title="Semester">
      <form onSubmit={async (e) => {
        e.preventDefault();
        const p = profile?.[0];
        if (p) await db.profile.update(p.id!, { semester_start_date: start, semester_end_date: end, gpa_target: parseFloat(target) || 4.5 });
        onClose();
      }} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start date" value={start} onChange={setStart} type="date" />
          <Field label="End date" value={end} onChange={setEnd} type="date" />
        </div>
        <Field label="GPA target" value={target} onChange={setTarget} type="number" step="0.1" min={"0"} max={"5"} />
        <div className="flex justify-end"><NeoButton type="submit" variant="accent" className="font-semibold">Save</NeoButton></div>
      </form>
    </Modal>
  );
}

function CoursesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const courses = useLiveQuery(() => db.courses.toArray(), [open]);
  const comps = useLiveQuery(() => db.course_ca_components.toArray(), [open]);
  return (
    <Modal open={open} onClose={onClose} title="Courses" wide>
      <div className="space-y-3">
        {(courses ?? []).map((c) => (
          <div key={c.id} className="rounded-2xl neo p-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium text-[var(--ink)]">{c.code} <span className="text-[var(--ink-faint)] font-normal text-sm">— {c.title}</span></p>
              <p className="text-xs text-[var(--ink-faint)] mt-1">
                {c.course_type === "general" ? "General" : "Departmental"} · CA {c.ca_weight_percent}% · exam {c.exam_weight_percent}% · {c.credit_units} units
                {" · comps: " + (comps ?? []).filter((x) => x.course_id === c.id).map((x) => `${x.label} ${x.weight_percent}%`).join(", ")}
              </p>
            </div>
            <RemoveCourse code={c.code} courseId={c.id!} />
          </div>
        ))}
        {!courses?.length && <p className="text-sm text-[var(--ink-soft)]">No courses yet — add them during setup or here.</p>}
        <p className="text-xs text-[var(--ink-faint)]">Course scores, topics and exam dates are managed on each course's page in Academics.</p>
      </div>
    </Modal>
  );
}

function TimetableModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const courses = useLiveQuery(() => db.courses.toArray(), [open]);
  const slots = useLiveQuery(() => db.timetable_slots.toArray(), [open]);
  return (
    <Modal open={open} onClose={onClose} title="Class timetable" wide>
      <p className="text-sm text-[var(--ink-soft)] mb-4">Re-upload the official timetable (read by AI, reviewed by you) or clear slots to start over.</p>
      <TimetableUpload
        kind="class"
        courseCodes={(courses ?? []).map((c) => c.code)}
        onSave={async (rows: ReviewRow[]) => {
          const affectedCourseIds = new Set<number>();
          for (const r of rows) {
            const code = r.course_code.trim().toUpperCase();
            const course = (courses ?? []).find((c) => c.code.trim().toUpperCase() === code);
            if (course?.id) affectedCourseIds.add(course.id);
          }
          await Promise.all(Array.from(affectedCourseIds, (courseId) => db.timetable_slots.where("course_id").equals(courseId).delete()));
          for (const r of rows) {
            const code = r.course_code.trim().toUpperCase();
            let course = (courses ?? []).find((c) => c.code.trim().toUpperCase() === code);
            if (!course) {
              const id = await db.courses.add({
                code, title: code, credit_units: 3, course_type: "general",
                ca_weight_percent: 30, exam_weight_percent: 70, target_grade_point: 4,
              });
              await db.course_ca_components.add({ course_id: id, label: "CA", weight_percent: 30 });
              course = { id, code, title: code, credit_units: 3, course_type: "general", ca_weight_percent: 30, exam_weight_percent: 70, target_grade_point: 4 };
            }
            const day = dayToNum(r.day);
            if (day == null) continue;
            await db.timetable_slots.add({ course_id: course.id!, day_of_week: day, start_time: r.start_time, end_time: r.end_time, venue: r.venue?.trim() ?? "" });
          }
        }}
      />
      {slots?.length ? (
        <div className="mt-4">
          <p className="text-xs text-[var(--ink-faint)] mb-2">{slots.length} slots saved</p>
          <NeoButton onClick={() => db.timetable_slots.clear()}>Clear all slots</NeoButton>
        </div>
      ) : null}
    </Modal>
  );
}

function ExamDatesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const courses = useLiveQuery(() => db.courses.toArray(), [open]);
  const exams = useLiveQuery(() => db.exams.toArray(), [open]);
  return (
    <Modal open={open} onClose={onClose} title="Exam dates" wide>
      <p className="text-sm text-[var(--ink-soft)] mb-5">Set a date the moment it's announced — countdowns and possibility analysis start working immediately, no document needed.</p>
      <div className="space-y-5">
        {(courses ?? []).map((c) => {
          const ex = (exams ?? []).filter((e) => e.course_id === c.id)[0];
          return (
            <div key={c.id}>
              <p className="font-medium text-[var(--ink)] mb-2">{c.code}</p>
              <ExamEditor courseId={c.id!} exam={ex} />
            </div>
          );
        })}
        {!courses?.length && <p className="text-sm text-[var(--ink-soft)]">Add courses first — then their exam dates live here.</p>}
      </div>
    </Modal>
  );
}

function ExamTTModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const courses = useLiveQuery(() => db.courses.toArray(), [open]);
  return (
    <Modal open={open} onClose={onClose} title="Exam timetable upload" wide>
      <p className="text-sm text-[var(--ink-soft)] mb-4">When the official exam timetable drops, upload it here. Dates, times and venues fill in bulk — matched against your courses, reviewed by you before saving.</p>
      <TimetableUpload
        kind="exam"
        courseCodes={(courses ?? []).map((c) => c.code)}
        onSave={async (rows: ReviewRow[]) => {
          for (const r of rows) {
            const course = (courses ?? []).find((c) => c.code === r.course_code.toUpperCase());
            if (!course) continue;
            const existing = (await db.exams.where("course_id").equals(course.id!).toArray())[0];
            const payload = {
              course_id: course.id!, exam_date: r.day,
              start_time: r.start_time || null, venue: r.venue || null,
            };
            if (existing) await db.exams.update(existing.id!, payload);
            else await db.exams.add(payload);
          }
        }}
      />
    </Modal>
  );
}

function StudyTTModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const slots = useLiveQuery(() => db.personal_study_slots.toArray(), [open]);
  return (
    <Modal open={open} onClose={onClose} title="Personal study timetable" wide>
      <p className="text-sm text-[var(--ink-soft)] mb-4">Your own study schedule — kept strictly separate from class times, never mixed in.</p>
      <TimetableUpload
        kind="study"
        courseCodes={[]}
        onSave={async (rows: ReviewRow[]) => {
          for (const r of rows) {
            const specific = /^\d{4}-\d{2}-\d{2}$/.test(r.day);
            const day = dayToNum(r.day);
            await db.personal_study_slots.add({
              day_of_week: specific ? null : day,
              specific_date: specific ? r.day : null,
              start_time: r.start_time, end_time: r.end_time,
              note: r.venue || r.course_code || "Study block",
            });
          }
        }}
      />
      {slots?.length ? (
        <div className="mt-4">
          <p className="text-xs text-[var(--ink-faint)] mb-2">{slots.length} personal study blocks saved</p>
          <NeoButton onClick={() => db.personal_study_slots.clear()}>Clear study timetable</NeoButton>
        </div>
      ) : null}
    </Modal>
  );
}

function FinanceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const fs = useLiveQuery(() => db.finance_settings.toArray(), [open]);
  const [allowance, setAllowance] = useState(""); const [day, setDay] = useState("0");
  const [daily, setDaily] = useState(""); const [savings, setSavings] = useState("");
  useEffect(() => {
    const f = fs?.[0];
    if (f && open) {
      setAllowance(String(f.current_allowance_amount)); setDay(String(f.allowance_collection_day));
      setDaily(String(f.daily_spending_target)); setSavings(String(f.weekly_savings_target));
    }
  }, [fs, open]);
  return (
    <Modal open={open} onClose={onClose} title="Finance">
      <form onSubmit={async (e) => {
        e.preventDefault();
        const f = fs?.[0];
        const payload = {
          current_allowance_amount: parseFloat(allowance) || 0,
          allowance_collection_day: parseInt(day) || 0,
          daily_spending_target: parseFloat(daily) || 0,
          weekly_savings_target: parseFloat(savings) || 0,
        };
        if (f) await db.finance_settings.update(f.id!, payload);
        else await db.finance_settings.add(payload);
        onClose();
      }} className="space-y-4">
        <div className="grid grid-cols-2 gap-3 items-end">
          <Field label="Weekly allowance" value={allowance} onChange={setAllowance} type="number" />
          <SelectField label="Collection day" value={day} onChange={setDay} options={DAYS} />
        </div>
        <div className="grid grid-cols-2 gap-3 items-end">
          <Field label="Daily spend target" value={daily} onChange={setDaily} type="number" />
          <Field label="Weekly savings target" value={savings} onChange={setSavings} type="number" />
        </div>
        <div className="flex justify-end"><NeoButton type="submit" variant="accent" className="font-semibold">Save</NeoButton></div>
      </form>
    </Modal>
  );
}

function RoutinesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const routines = useLiveQuery(() => db.routines.toArray(), [open]);
  return (
    <Modal open={open} onClose={onClose} title="Routines" wide>
      <div className="space-y-3">
        {(routines ?? []).map((r) => (
          <div key={r.id} className="rounded-2xl neo p-4 flex items-center justify-between">
            <div>
              <p className="font-medium text-[var(--ink)]">{r.name}</p>
              <p className="text-xs text-[var(--ink-faint)]">{r.schedule_days.map((d) => DAYS[d].slice(0, 3)).join(" ")} · remind {r.reminder_time}</p>
            </div>
            <button
              aria-label={`Delete ${r.name}`}
              onClick={async () => {
                await db.routines.delete(r.id!);
                await db.routine_logs.where("routine_id").equals(r.id!).delete();
              }}
              className="focus-ring text-[var(--ink-faint)] hover:text-rose-500 p-2"
            >
              <Trash2 size={15} aria-hidden />
            </button>
          </div>
        ))}
        <p className="text-xs text-[var(--ink-faint)]">Tap a routine's check or skip from the Routines page each day. New routines are added there too.</p>
      </div>
    </Modal>
  );
}

function EmailModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const accounts = useLiveQuery(() => db.email_accounts.toArray(), [open]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const connect = async () => {
    setBusy(true); setErr(null);
    try {
      const { accessToken, refreshToken, expiresAt } = await requestGmailAccess();
      // Fetch who we are, then store the token locally.
      const me = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
        headers: { Authorization: `Bearer ${accessToken}` },
      }).then((r) => (r.ok ? r.json() : null));
      const email = me?.emailAddress ?? "gmail account";
      if (accounts?.some((a) => a.email === email) || accounts?.length) {
        // Replace existing (single account per email), cap at 4.
        if (!accounts?.some((a) => a.email === email)) {
          if ((accounts?.length ?? 0) >= 4) { setErr("Four accounts is the limit — remove one first."); return; }
        }
        const existing = accounts?.find((a) => a.email === email);
        if (existing) await db.email_accounts.update(existing.id!, { access_token: accessToken, refresh_token: refreshToken, token_expires_at: expiresAt });
        else await db.email_accounts.add({ provider: "gmail", email, access_token: accessToken, refresh_token: refreshToken, token_expires_at: expiresAt, last_fetched_at: null });
      } else {
        await db.email_accounts.add({ provider: "gmail", email, access_token: accessToken, refresh_token: refreshToken, token_expires_at: expiresAt, last_fetched_at: null });
      }
    } catch {
      setErr("Google couldn't complete the connection. Nothing was stored.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Email" wide>
      <p className="text-sm text-[var(--ink-soft)] mb-4">
        Connect up to 4 Gmail accounts, read-only. Tokens are stored locally in this app's database on your device —
        this connection's data stays on-device. Each morning Reso fetches new mail, ranks it, and tells you what actually needs you.
      </p>
      {!googleConfigured() && (
        <p className="text-xs text-amber-600 dark:text-amber-300 mb-4">
          Gmail connection isn't configured on this install yet (needs NEXT_PUBLIC_GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET). Everything else in Reso works fully.
        </p>
      )}
      <div className="space-y-2.5 mb-4">
        {(accounts ?? []).map((a) => (
          <div key={a.id} className="rounded-2xl neo p-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--ink)] truncate">{a.email}</p>
              <p className="text-xs text-[var(--ink-faint)]">read-only · stored on this device</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <NeoButton onClick={async () => {
                try {
                  const { items, accessToken, expiresAt } = await fetchRankedEmails(a);
                  if (accessToken && expiresAt) await db.email_accounts.update(a.id!, { access_token: accessToken, token_expires_at: expiresAt });
                  const today = new Date().toISOString().slice(0, 10);
                  if (items.length) {
                    await db.email_items.bulkAdd(items.map((it) => ({
                      email_account_id: a.id!, subject: it.subject, sender: it.sender,
                      snippet: it.snippet, summary: it.summary, rank: it.rank, fetched_date: today,
                    })));
                    await db.email_accounts.update(a.id!, { last_fetched_at: Date.now() });
                  }
                } catch { setErr("That account needs reconnecting because access was revoked or the connection failed."); }
              }}>Refresh</NeoButton>
              <button
                aria-label={`Remove ${a.email}`}
                onClick={async () => { await db.email_accounts.delete(a.id!); await db.email_items.where("email_account_id").equals(a.id!).delete(); }}
                className="focus-ring text-[var(--ink-faint)] hover:text-rose-500 p-2"
              >
                <Trash2 size={15} aria-hidden />
              </button>
            </div>
          </div>
        ))}
      </div>
      {err && <p className="text-sm text-amber-600 dark:text-amber-300 mb-3">{err}</p>}
      {(accounts?.length ?? 0) < 4 && (
        <NeoButton variant="accent" onClick={connect} disabled={busy || !googleConfigured()} className="font-semibold">
          {busy ? "Opening Google…" : "Connect a Gmail account (stays connected)"}
        </NeoButton>
      )}
    </Modal>
  );
}

function AppearanceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const profile = useLiveQuery(() => db.profile.toArray(), [open]);
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");
  useEffect(() => { if (open) setTheme(profile?.[0]?.theme_preference ?? "system"); }, [profile, open]);
  return (
    <Modal open={open} onClose={onClose} title="Appearance">
      <div className="grid grid-cols-3 gap-3">
        {(["light", "dark", "system"] as const).map((t) => (
          <button
            key={t}
            onClick={async () => {
              setTheme(t);
              const p = profile?.[0];
              if (p) await db.profile.update(p.id!, { theme_preference: t });
            }}
            aria-pressed={theme === t}
            className={`focus-ring rounded-xl px-3 py-4 text-sm font-medium min-h-[44px] capitalize transition-all ${theme === t ? "neo-pressed text-[var(--accent)]" : "neo text-[var(--ink-soft)]"}`}
          >
            {t}
          </button>
        ))}
      </div>
      <p className="text-xs text-[var(--ink-faint)] mt-4">Dark mode is a warm charcoal ink — never pure black.</p>
    </Modal>
  );
}

function DataModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [recapOpen, setRecapOpen] = useState(false);
  const [seedMsg, setSeedMsg] = useState<string | null>(null);
  const [hasSample, setHasSample] = useState(false);
  const archived = useLiveQuery(() => db.archived_semesters.toArray(), [open]);
  useEffect(() => {
    if (open) getMeta("sample_data").then((v) => setHasSample(v === "1"));
  }, [open]);
  return (
    <>
      <Modal open={open} onClose={onClose} title="Data & recap" wide>
        <div className="space-y-4">
                  <p className="text-xs text-[var(--ink-faint)] -mt-1 mb-1">
                    Reso has no server-side storage — this export is the only backup mechanism. Keep a copy somewhere safe.
                    {Capacitor.isNativePlatform?.() && <span className="block mt-1">On Android, the file will be saved to the app's Documents folder and can be shared via the share sheet.</span>}
                  </p>
          <div className="flex items-center justify-between gap-3 rounded-2xl neo p-4">
            <div>
              <p className="font-medium text-[var(--ink)] text-sm flex items-center gap-2"><Download size={15} aria-hidden /> Export my data</p>
              <p className="text-xs text-[var(--ink-faint)] mt-0.5">One JSON file, everything Reso knows — the only backup there is.</p>
            </div>
            <NeoButton
              onClick={async () => {
                try {
                  const json = await exportAllData();
                  const isNative = Capacitor.isNativePlatform?.();
                  if (isNative && typeof Filesystem !== "undefined" && typeof Share !== "undefined") {
                    // Native Android: write to Documents, then share
                    const fileName = "reso-data.json";
                    await Filesystem.writeFile({
                      path: fileName,
                      data: json,
                      directory: Directory.Documents,
                      recursive: false,
                    });
                    // Get the absolute file URI for the share sheet
                    const fileUri = await Filesystem.getUri({
                      directory: Directory.Documents,
                      path: fileName,
                    });
                    await Share.share({
                      title: "Reso data export",
                      text: "Your Reso data backup (JSON)",
                      url: fileUri.uri,
                      dialogTitle: "Save or share your Reso data",
                    });
                    alert("Export complete! Share sheet opened. You can save the file to your device, send it to yourself via email/Google Drive, or share it to another app.");
                  } else {
                    // Web / PWA: standard blob download
                    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
                    const a = document.createElement("a");
                    a.href = url; a.download = "reso-data.json"; a.click();
                    URL.revokeObjectURL(url);
                    alert("Export complete! reso-data.json has been downloaded to your device.");
                  }
                } catch (e: unknown) {
                  const msg = e instanceof Error ? e.message : "Unknown error";
                  // Provide more helpful error messages for common issues
                  let userMsg = msg;
                  if (msg.includes("PERMISSION_DENIED") || msg.includes("storage")) {
                    userMsg = "Storage permission denied. Please grant storage permission in Settings > Apps > Reso > Permissions.";
                  } else if (msg.includes("MANAGE_EXTERNAL_STORAGE")) {
                    userMsg = "Full storage access is needed. Please grant permission in Settings > Apps > Reso > Permissions > All Files Access.";
                  } else if (msg.includes("not available")) {
                    userMsg = "Share plugin not available on this platform.";
                  }
                  alert("Export failed: " + userMsg);
                }
              }}
            >Export</NeoButton>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-2xl neo p-4">
            <div>
              <p className="font-medium text-[var(--ink)] text-sm flex items-center gap-2"><Award size={15} aria-hidden /> Semester recap</p>
              <p className="text-xs text-[var(--ink-faint)] mt-0.5">The keepsake summary of where the semester landed.</p>
            </div>
            <NeoButton variant="accent" onClick={() => setRecapOpen(true)}>View recap</NeoButton>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-2xl neo p-4">
            <div>
              <p className="font-medium text-[var(--ink)] text-sm">Sample data</p>
              <p className="text-xs text-[var(--ink-faint)] mt-0.5">
                {hasSample ? "Sample history is loaded — clear it any time." : "Load a few realistic weeks of history to see everything working."}
              </p>
              {seedMsg && <p className="text-xs mt-1 text-[var(--ink-soft)]">{seedMsg}</p>}
            </div>
            {hasSample ? (
              <NeoButton
                onClick={async () => {
                  await clearSampleData();
                  const current = (await db.profile.toArray())[0];
                  if (current) await db.profile.update(current.id!, { onboarding_complete: 0, new_semester_mode: 0 });
                  setHasSample(false);
                  setSeedMsg("Sample data cleared — starting your own semester now.");
                }}
              >Start my own semester</NeoButton>
            ) : (
              <NeoButton
                variant="accent"
                onClick={async () => {
                  const ok = await loadSampleData();
                  setHasSample(ok);
                  setSeedMsg(ok ? "Sample data loaded — look around, then clear it when ready." : "Live data already exists — clear it first.");
                }}
              >Load sample data</NeoButton>
            )}
          </div>
          {archived?.length ? (
            <div className="rounded-2xl neo-pressed p-4">
              <p className="text-xs uppercase tracking-wide text-[var(--ink-faint)] mb-2">Archived semesters</p>
              {archived.map((a) => (
                <p key={a.id} className="text-sm text-[var(--ink-soft)]">{a.label} — kept for comparison</p>
              ))}
            </div>
          ) : null}
        </div>
      </Modal>
      <Recap open={recapOpen} onClose={() => setRecapOpen(false)} />
    </>
  );
}

/** Quiet two-tap course removal — no bin icon sitting in the list. */
function RemoveCourse({ code, courseId }: { code: string; courseId: number }) {
  const [armed, setArmed] = useState(false);
  return armed ? (
    <button
      onClick={async () => {
        await db.courses.delete(courseId);
        await db.course_ca_components.where("course_id").equals(courseId).delete();
        await db.course_scores.where("course_id").equals(courseId).delete();
        await db.timetable_slots.where("course_id").equals(courseId).delete();
        await db.course_topics.where("course_id").equals(courseId).delete();
        await db.exams.where("course_id").equals(courseId).delete();
      }}
      className="focus-ring text-xs font-semibold text-rose-500 px-3 py-2 rounded-lg hover:bg-rose-500/10 transition-colors"
    >
      Tap again to remove
    </button>
  ) : (
    <button
      onClick={() => setArmed(true)}
      className="focus-ring text-xs text-[var(--ink-faint)] hover:text-[var(--ink)] px-3 py-2 rounded-lg transition-colors"
    >
      Remove
    </button>
  );
}

/**
 * Screen time tracking — Android usage access, one-time setup, fully local.
 * On the web/PWA build there is no native bridge: this explains calmly and enables nothing.
 */
function ScreenTimeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [enabled, setEnabled] = useState<0 | 1>(0);
  const [loading, setLoading] = useState(true);
  const [permissionState, setPermissionState] = useState<"loading" | "granted" | "denied" | "web">("loading");
  const [justGranted, setJustGranted] = useState(false);

  useEffect(() => {
    if (!open) {
      setLoading(true);
      return;
    }
    (async () => {
      setLoading(true);
      const perm = await screenTimePermission();
      setPermissionState(perm === "granted" ? "granted" : perm === "denied" ? "denied" : "web");
      setEnabled(await getScreenTimeEnabled());
      setLoading(false);
    })();
  }, [open]);

  const handleToggle = async (checked: boolean) => {
    const newState = checked ? 1 : 0;
    setEnabled(newState);
    await setScreenTimeEnabled(newState);
    if (checked && permissionState === "granted") {
      await pullYesterdayScreenTime().catch(() => null);
    } else if (!checked) {
      // Clear the last pull date so it will pull again next time
      await setMeta("screentime_last_pull", "");
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Screen time tracking">
      {loading ? (
        <p className="text-sm text-[var(--ink-soft)]">Loading…</p>
      ) : (
        <div className="text-sm text-[var(--ink-soft)] space-y-4">
          <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--neo-base)] dark:bg-[var(--neo-base-dark)]">
            <div className="flex-1">
              <p className="font-medium text-[var(--ink)]">Screen time tracking</p>
              <p className="text-xs text-[var(--ink-faint)] mt-0.5">Read-only, stays on this device</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={enabled === 1}
                onChange={(e) => handleToggle(e.target.checked)}
              />
              <div className="w-11 h-6 bg-[var(--ink-faint)] peer-focus:outline-none rounded-full peer dark:bg-[var(--ink-faint)] peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--accent)]"></div>
            </label>
          </div>

          {permissionState === "web" && (
            <div className="p-3 rounded-xl bg-[var(--neo-base)] dark:bg-[var(--neo-base-dark)]">
              <p className="font-medium text-[var(--ink)] mb-1">Android-only feature</p>
              <p className="text-xs text-[var(--ink-faint)]">Screen time comes from Android's UsageStatsManager. Works only in the Reso Android app — not in a browser or PWA.</p>
            </div>
          )}

          {permissionState === "granted" && enabled === 1 && (
            <div className="p-3 rounded-xl bg-[var(--neo-base)] dark:bg-[var(--neo-base-dark)] border border-emerald-200 dark:border-emerald-900/30">
              <p className="text-emerald-600 dark:text-emerald-300 font-medium mb-1">Active</p>
              <p>Each day, Reso quietly reads yesterday's usage from Android — how long you were on your phone, and which app took most of that time. It lands beside your evening reflection as supporting context, never a headline.</p>
            </div>
          )}

          {permissionState === "denied" && enabled === 1 && (
            <div className="p-3 rounded-xl bg-[var(--neo-base)] dark:bg-[var(--neo-base-dark)]">
              <p className="text-amber-600 dark:text-amber-300 font-medium mb-1">Permission required</p>
              <p>Reso reads your phone usage straight from Android — total screen time and the app you spent it on most. It stays beside your evening reflection, so on a heavy-phone day the picture of your week stays honest rather than mysterious.</p>
              <p className="text-xs text-[var(--ink-faint)] mt-1">It's read-only, stays on this device, and entirely optional.</p>
              {justGranted && <p className="text-xs text-[var(--ink-soft)] mt-2">If you've just allowed it, Reso will pick it up next time you open the app.</p>}
              <NeoButton
                variant="accent"
                className="font-semibold mt-3"
                onClick={async () => {
                  setJustGranted(true);
                  await openScreenTimeSettings();
                }}
              >
                Open Android settings to allow
              </NeoButton>
              <p className="text-xs text-[var(--ink-faint)] mt-1">Look for "Usage access" and allow it for Reso — a one-time step.</p>
            </div>
          )}

          <p className="text-xs text-[var(--ink-faint)]">To turn it off later, simply toggle the switch here, or revoke usage access for Reso in Android settings.</p>
        </div>
      )}
    </Modal>
  );
}

/** Select styled to match Field exactly, so mixed rows align. */
function SelectField({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: string[];
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-[var(--ink-faint)] mb-1.5 tracking-wide uppercase">{label}</span>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="focus-ring w-full appearance-none rounded-xl px-4 py-3 pr-9 text-[15px] bg-[var(--neo-base)] text-[var(--ink)]
            shadow-[inset_3px_3px_7px_rgba(10,10,15,0.08),inset_-3px_-3px_7px_rgba(255,255,255,0.7)]
            dark:shadow-[inset_3px_3px_8px_rgba(0,0,0,0.45),inset_-3px_-3px_7px_rgba(255,255,255,0.04)]
            border border-white/30 dark:border-white/5"
        >
          {options.map((o, i) => <option key={o} value={i}>{o}</option>)}
        </select>
        <ChevronDown size={15} aria-hidden className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--ink-faint)] pointer-events-none" />
      </div>
    </label>
  );
}

/* ---------------- Reminders manager ---------------- */

function RemindersModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const prefs = useLiveQuery(() => db.reminder_prefs.toArray(), [open]) ?? [];
  const routines = useLiveQuery(() => db.routines.toArray(), [open]) ?? [];
  const custom = useLiveQuery(() => db.custom_reminders.toArray(), [open]) ?? [];
  const slots = useLiveQuery(() => db.timetable_slots.toArray(), [open]) ?? [];

  const pref = (key: string) => prefs.find((p) => p.key === key);
  // Missing preference = enabled by default; only an explicit 0 turns it off.
  const isEnabled = (key: string) => pref(key)?.enabled !== 0;
  const timeOf = (key: string, fallback: string) => pref(key)?.time ?? fallback;

  const setPref = async (key: string, enabled: boolean, time?: string | null) => {
    const existing = pref(key);
    await db.reminder_prefs.put({
      key,
      enabled: enabled ? 1 : 0,
      time: time !== undefined ? (time || null) : existing?.time ?? null,
    });
  };

  const [label, setLabel] = useState("");
  const [ctime, setCtime] = useState("08:00");

  return (
    <Modal open={open} onClose={onClose} title="Reminders" wide>
      <p className="text-sm text-[var(--ink-soft)] mb-5">
        Everything Reso reminds you about, in one place — turn any of them off, change when they arrive, or add your own.
      </p>

      <div className="space-y-2.5">
        <ToggleRow
          title="Daily spend check-in"
          sub="Asks how much you spent; updates your balance"
          checked={isEnabled("spend9pm")}
          time={timeOf("spend9pm", "21:00")}
          onToggle={(v) => setPref("spend9pm", v)}
          onTime={(t) => setPref("spend9pm", true, t)}
        />
        <ToggleRow
          title="Allowance week closes"
          sub="The evening before your next allowance, come see the week"
          checked={isEnabled("cycle9pm")}
          time={timeOf("cycle9pm", "21:00")}
          onToggle={(v) => setPref("cycle9pm", v)}
          onTime={(t) => setPref("cycle9pm", true, t)}
        />
        <ToggleRow
          title="Exam countdowns"
          sub="3 days before, 1 day before, and the morning of every exam"
          checked={isEnabled("exam")}
          time={timeOf("exam", "09:00")}
          onToggle={(v) => setPref("exam", v)}
          onTime={(t) => setPref("exam", true, t)}
        />
        <ToggleRow
          title="Class reminders"
          sub={slots.length ? `${slots.length} class${slots.length === 1 ? "" : "es"} on your timetable — reminded 30 minutes before each` : "Add your timetable and each class reminds 30 minutes before it starts"}
          checked={isEnabled("class")}
          onToggle={(v) => setPref("class", v)}
        />

        {routines.length > 0 && (
          <div className="pt-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--ink-faint)] mb-2">Routine reminders</p>
            <div className="space-y-2">
              {routines.map((r) => (
                <ToggleRow
                  key={r.id}
                  title={r.name}
                  sub={`On ${r.schedule_days.length === 7 ? "every day" : r.schedule_days.map((d) => DAYS[d].slice(0, 3)).join(", ")}`}
                  checked={pref(`routine:${r.id}`)?.enabled !== 0}
                  time={r.reminder_time}
                  onToggle={(v) => setPref(`routine:${r.id}`, v)}
                  onTime={async (t) => {
                    await db.routines.update(r.id!, { reminder_time: t });
                  }}
                />
              ))}
            </div>
          </div>
        )}

        <div className="pt-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--ink-faint)] mb-2">Your own reminders</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!label.trim()) return;
              await db.custom_reminders.add({ label: label.trim(), time: ctime, enabled: 1 });
              setLabel("");
            }}
            className="flex flex-wrap gap-2 items-end mb-3"
          >
            <Field label="Remind me to" value={label} onChange={setLabel} placeholder="Call mum, laundry..." className="flex-1 min-w-[160px]" />
            <Field label="At" value={ctime} onChange={setCtime} type="time" className="w-[120px]" />
            <NeoButton type="submit" variant="accent" className="font-semibold">Add</NeoButton>
          </form>
          {custom.length === 0 ? (
            <p className="text-xs text-[var(--ink-faint)]">None yet — add one above and it fires every day at its time.</p>
          ) : (
            <div className="space-y-2">
              {custom.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-xl neo-sm px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--ink)] truncate">{c.label}</p>
                    <p className="text-xs text-[var(--ink-faint)]">every day at {c.time}</p>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <NeoSwitch checked={c.enabled === 1} label={`Toggle ${c.label}`} onChange={(v) => db.custom_reminders.update(c.id!, { enabled: v ? 1 : 0 })} />
                    <button
                      onClick={async () => { await db.custom_reminders.delete(c.id!); }}
                      aria-label={`Remove ${c.label}`}
                      className="focus-ring text-xs text-[var(--ink-faint)] hover:text-rose-500 px-2 py-1"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function ToggleRow({ title, sub, checked, time, onToggle, onTime }: {
  title: string; sub: string; checked: boolean; time?: string;
  onToggle: (v: boolean) => void; onTime?: (t: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl neo px-4 py-3.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-[var(--ink)]">{title}</p>
        <p className="text-xs text-[var(--ink-faint)] mt-0.5">{sub}</p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {time !== undefined && (
          <input
            type="time"
            value={time}
            onChange={(e) => onTime?.(e.target.value)}
            aria-label={`${title} time`}
            className="focus-ring rounded-lg bg-[var(--neo-base)] border border-white/30 dark:border-white/5 px-2 py-1.5 text-xs tabular-nums"
          />
        )}
        <NeoSwitch checked={checked} label={`Toggle ${title}`} onChange={onToggle} />
      </div>
    </div>
  );
}

function NeoSwitch({ checked, label, onChange }: { checked: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="focus-ring relative w-[46px] h-[26px] rounded-full transition-all duration-200 shrink-0"
      style={{
        background: checked ? "var(--ink)" : "rgba(120,116,130,0.25)",
        boxShadow: checked
          ? "inset 2px 2px 4px rgba(0,0,0,0.25)"
          : "inset 2px 2px 5px rgba(10,10,15,0.15), inset -2px -2px 5px rgba(255,255,255,0.6)",
      }}
    >
      <span
        className="absolute top-[3px] w-[20px] h-[20px] rounded-full transition-all duration-200"
        style={{
          left: checked ? 23 : 3,
          background: "var(--page)",
          boxShadow: "0 1px 3px rgba(10,10,15,0.35)",
        }}
      />
    </button>
  );
}

/* ---------------- Alarms — named, they ring with snooze/stop ---------------- */

function AlarmsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const alarms = useLiveQuery(() => db.alarms.toArray(), [open]) ?? [];
  const [label, setLabel] = useState("");
  const [time, setTime] = useState("06:30");
  const [editing, setEditing] = useState<{ id: number; label: string; time: string } | null>(null);

  // Helper to sync native alarms after any CRUD operation
  const syncNative = async () => {
    const currentAlarms = await db.alarms.toArray();
    const nativeAlarms = currentAlarms.map((a) => ({
      id: a.id!,
      label: a.label,
      time: a.time,
      enabled: a.enabled === 1 ? 1 : 0,
    }));
    await scheduleNativeIfRunning(nativeAlarms);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;
    await db.alarms.add({ label: label.trim(), time, enabled: 1 });
    setLabel("");
    setEditing(null);
    await syncNative();
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    await db.alarms.update(editing.id, { label: label.trim(), time, enabled: 1 });
    setEditing(null);
    await syncNative();
  };

  const handleDelete = async (id: number) => {
    await db.alarms.delete(id);
    await syncNative();
  };

  const handleToggle = async (id: number, enabled: boolean) => {
    await db.alarms.update(id, { enabled: enabled ? 1 : 0 });
    await syncNative();
  };

  const openEdit = (alarm: { id: number; label: string; time: string }) => {
    setEditing(alarm);
    setLabel(alarm.label);
    setTime(alarm.time);
  };

  const closeEdit = () => {
    setEditing(null);
    setLabel("");
    setTime("06:30");
  };

  return (
    <Modal open={open} onClose={onClose} title="Alarms" wide>
      <p className="text-sm text-[var(--ink-soft)] mb-5">
        Name an alarm, set the time, and it rings like a real alarm — sound and vibration, with snooze and stop.
        On the Android app it rings even with Reso fully closed. In the browser it rings while Reso is open on this device.
      </p>

      {/* Add alarm form */}
      <form
        onSubmit={handleAdd}
        className="flex flex-wrap gap-2 items-end mb-4"
      >
        <Field label="Alarm name" value={label} onChange={setLabel} placeholder="Morning prayer, Gym, Study block..." className="flex-1 min-w-[170px]" />
        <Field label="Time" value={time} onChange={setTime} type="time" className="w-[120px]" />
        <NeoButton type="submit" variant="accent" className="font-semibold">{editing ? 'Save' : 'Add alarm'}</NeoButton>
      </form>

      {/* Edit alarm form (shown when editing) */}
      {editing && (
        <form
          onSubmit={handleUpdate}
          className="flex flex-wrap gap-2 items-end mb-4"
        >
          <Field label="Alarm name" value={label} onChange={setLabel} placeholder="Morning prayer, Gym, Study block..." className="flex-1 min-w-[170px]" />
          <Field label="Time" value={time} onChange={setTime} type="time" className="w-[120px]" />
          <NeoButton type="submit" variant="accent" className="font-semibold">Save</NeoButton>
          <NeoButton type="button" onClick={closeEdit} className="font-semibold">Cancel</NeoButton>
        </form>
      )}

      {alarms.length === 0 ? (
        <p className="text-xs text-[var(--ink-faint)]">No alarms yet — add one above. It rings every day at its time until you turn it off.</p>
      ) : (
        <div className="space-y-2">
          {alarms.slice().sort((a, b) => a.time.localeCompare(b.time)).map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-3 rounded-2xl neo px-4 py-3.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--ink)] truncate">{a.label}</p>
                <p className="text-xs text-[var(--ink-faint)]">every day at {a.time}</p>
              </div>
              <div className="flex items-center gap-2.5 shrink-0">
                <NeoSwitch checked={a.enabled === 1} label={`Toggle alarm ${a.label}`} onChange={(v) => handleToggle(a.id!, v)} />
                <button
                  onClick={() => {
                    const { id, label, time } = a;
                    if (id !== undefined) openEdit({ id, label, time });
                  }}
                  aria-label={`Edit alarm ${a.label}`}
                  className="focus-ring text-xs text-[var(--ink-faint)] hover:text-[var(--ink)] px-2 py-1"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(a.id!)}
                  aria-label={`Remove alarm ${a.label}`}
                  className="focus-ring text-xs text-[var(--ink-faint)] hover:text-rose-500 px-2 py-1"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 rounded-2xl neo-pressed p-4 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-[var(--ink-soft)]">Want to hear it first?</p>
        <NeoButton
          onClick={() => {
            import("@/lib/alarm").then((m) => {
              m.startAlarm(0, "Alarm preview");
              setTimeout(() => m.stopAlarm(), 5000);
            });
          }}
        >
          Preview the ring
        </NeoButton>
      </div>
      <p className="text-[11px] text-[var(--ink-faint)] mt-3">
        Every part of Reso also works offline — your data lives on this device, and the app opens without a network.
      </p>
    </Modal>
  );
}
