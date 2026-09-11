"use client";
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db, getMeta, setMeta, migrateTopicStatuses, DailyPlanItem, Exam, TimetableSlot, FinanceSettings, FinanceWeek } from "@/lib/db";
import { todayStr, yesterdayStr, addDays, daysBetween, weekStartOnOrBefore, fmtMoney } from "@/lib/dates";
import { Modal, NeoCheck, NeoButton, Field } from "./ui";
import { fetchRankedEmails } from "@/lib/ai";
import { pullYesterdayScreenTime, screenTimeAvailable, screenTimePermission } from "@/lib/screentime";
import { getScreenTimeEnabled, setScreenTimeEnabled } from "@/lib/db";
import { BellRing } from "lucide-react";
import Nav from "./Nav";
import { primeAudio, startAlarm, stopAlarm, onAlarmChange, RingState, syncNativeAlarms, scheduleNativeIfRunning, nativeSnoozeAlarm, ensureAlarmNotificationPermission } from "@/lib/alarm";

/* ---------------- Live "today" — re-renders the whole app at midnight ---------------- */
const TodayCtx = createContext<string>(todayStr());
export const useToday = () => useContext(TodayCtx);

/* ---------------- Theme ---------------- */
function applyTheme(pref: "light" | "dark" | "system") {
  const dark = pref === "dark" || (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  try { localStorage.setItem("reso-theme", pref); } catch { /* noop */ }
}

/* ---------------- Notifications (browser now, Capacitor-ready shapes) ---------------- */
function notify(title: string, body: string) {
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    try { new Notification(title, { body }); } catch { /* noop */ }
  }
}

async function scheduleToday(notified: Set<string>) {
  const now = new Date();
  const today = todayStr();
  const minsNow = now.getHours() * 60 + now.getMinutes();
  const key = (k: string) => `reso-notified:${k}`;

  // Preference lookup: enabled defaults to true, time override optional.
  const prefs = new Map<string, { enabled: boolean; time: string | null }>();
  for (const row of await db.reminder_prefs.toArray()) {
    prefs.set(row.key, { enabled: row.enabled === 1, time: row.time });
  }
  const pref = (k: string) => prefs.get(k) ?? { enabled: true, time: null };

  const scheduleAt = (keyName: string, atMin: number, title: string, body: string) => {
    if (atMin <= minsNow || notified.has(key(keyName))) return;
    const stored = typeof localStorage !== "undefined" ? localStorage.getItem(key(keyName)) : null;
    if (stored) { notified.add(key(keyName)); return; }
    setTimeout(() => {
      notified.add(key(keyName));
      try { localStorage.setItem(key(keyName), "1"); } catch { /* noop */ }
      notify(title, body);
    }, (atMin - minsNow) * 60000);
  };

  // Class reminders, 30 minutes before each class today.
  if (pref("class").enabled) {
    const slots = await db.timetable_slots.toArray();
    const dow = now.getDay();
    for (const s of slots.filter((s) => s.day_of_week === dow)) {
      const [h, m] = s.start_time.split(":").map(Number);
      db.courses.get(s.course_id).then((c) => {
        scheduleAt(
          `class:${today}:${s.id}`,
          h * 60 + m - 30,
          `${c?.code ?? "Class"} starts by ${s.start_time}`,
          `${c?.title ?? "Your class"}${s.venue ? ` — ${s.venue}` : ""}`
        );
      });
    }
  }

  // Exam countdowns: 3 days, 1 day, morning of.
  if (pref("exam").enabled) {
    const examTime = prefTime(pref("exam").time, 9 * 60);
    const exams = await db.exams.toArray();
    for (const ex of exams) {
      const d = daysBetween(today, ex.exam_date);
      db.courses.get(ex.course_id).then((c) => {
        const when = [ex.exam_date, ex.start_time ? ` at ${ex.start_time}` : "", ex.venue ? `, ${ex.venue}` : ""].join("");
        if (d === 3) scheduleAt(`exam3:${ex.id}`, examTime, `${c?.code ?? "Exam"} exam in 3 days`, when);
        if (d === 1) scheduleAt(`exam1:${ex.id}`, examTime, `${c?.code ?? "Exam"} exam is tomorrow`, when);
        if (d === 0) scheduleAt(`exam0:${ex.id}`, examTime, `${c?.code ?? "Exam"} exam is today`, when);
      });
    }
  }

  // Routine reminders at each routine's configured time (scheduled days only).
  const routines = await db.routines.toArray();
  const dow = now.getDay();
  for (const r of routines) {
    if (!r.schedule_days.includes(dow) || !r.reminder_time) continue;
    const rp = pref(`routine:${r.id}`);
    if (!rp.enabled) continue;
    const [hh, mm] = (rp.time ?? r.reminder_time).split(":").map(Number);
    if (isNaN(hh) || isNaN(mm)) continue;
    scheduleAt(
      `routine:${today}:${r.id}`,
      hh * 60 + mm,
      r.name,
      `Time for ${r.name.toLowerCase()} — it's on today's schedule.`
    );
  }

  // Daily 9pm (or overridden): how much did you spend today?
  if (pref("spend9pm").enabled) {
    scheduleAt(
      `spend:${today}`,
      prefTime(pref("spend9pm").time, 21 * 60),
      "How much did you spend today?",
      "Tell Reso the day's total — your balance and spending record update right away."
    );
  }

  // Day before allowance collection: come check the week.
  const fsArr = await db.finance_settings.toArray();
  const fsRow = fsArr[0];
  if (fsRow && pref("cycle9pm").enabled) {
    const next = addDays(today, (fsRow.allowance_collection_day - now.getDay() + 7) % 7 || 7);
    if (daysBetween(today, next) === 1) {
      scheduleAt(
        `cycle:${today}`,
        prefTime(pref("cycle9pm").time, 21 * 60),
        "Allowance week closes tomorrow",
        "Come and look at your spending for the week — the full analysis is ready in Finance."
      );
    }
  }

  // Custom reminders — every day at their time.
  for (const cr of await db.custom_reminders.toArray()) {
    if (cr.enabled !== 1) continue;
    const [hh, mm] = cr.time.split(":").map(Number);
    if (isNaN(hh) || isNaN(mm)) continue;
    scheduleAt(`custom:${today}:${cr.id}`, hh * 60 + mm, cr.label, "A reminder you set for yourself.");
  }
}

/** "HH:mm" -> minutes; falls back to default when absent or malformed. */
function prefTime(time: string | null, fallbackMin: number): number {
  if (!time) return fallbackMin;
  const [h, m] = time.split(":").map(Number);
  return isNaN(h) || isNaN(m) ? fallbackMin : h * 60 + m;
}

/* ---------------- Carryover prompt data ---------------- */
interface CarryState {
  items: DailyPlanItem[];
  resolved: boolean;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [today, setToday] = useState(todayStr());
  const [carry, setCarry] = useState<CarryState>({ items: [], resolved: false });
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const notifiedRef = useRef<Set<string>>(new Set());
  const [ringing, setRinging] = useState<RingState | null>(null);

  // Audio needs one user gesture before it can sound — prime on first touch.
  useEffect(() => {
    primeAudio();
    const off = onAlarmChange(setRinging);
    return () => { off(); };
  }, []);

  // Sync native alarms on app startup when running on Android native build
  useEffect(() => {
    const initNativeAlarms = async () => {
      const alarms = await db.alarms.toArray();
      const nativeAlarms = alarms.map((a) => ({
        id: a.id!,
        label: a.label,
        time: a.time,
        enabled: a.enabled === 1 ? 1 : 0,
      }));
      await scheduleNativeIfRunning(nativeAlarms);
      void ensureAlarmNotificationPermission(); // Android 13+ notifications, asked once
    };
    initNativeAlarms();
  }, []);

  // Alarm clock: every 15s, check for due named alarms. Rings with snooze/stop.
  useEffect(() => {
    const tick = async () => {
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const today = todayStr();
      const snoozeKey = (id: number) => `reso-alarm-snooze:${id}`;
      const firedKey = (id: number) => `reso-alarm-fired:${id}`;
      for (const a of await db.alarms.toArray()) {
        if (a.enabled !== 1) continue;
        const [h, m] = a.time.split(":").map(Number);
        if (isNaN(h) || isNaN(m)) continue;
        // Snoozed instance due again?
        const snoozed = parseInt(localStorage.getItem(snoozeKey(a.id!)) ?? "", 10);
        if (!isNaN(snoozed) && Date.now() >= snoozed) {
          localStorage.removeItem(snoozeKey(a.id!));
          startAlarm(a.id!, a.label);
          return;
        }
        // Regular daily fire — exactly at the minute, once per day.
        if (localStorage.getItem(firedKey(a.id!)) === today) continue;
        if (h * 60 + m === nowMin) {
          localStorage.setItem(firedKey(a.id!), today);
          startAlarm(a.id!, a.label);
          return;
        }
      }
      // Sync native alarms when running on Android native build
      const alarms = await db.alarms.toArray();
      const nativeAlarms = alarms.map((a) => ({
        id: a.id!,
        label: a.label,
        time: a.time,
        enabled: a.enabled === 1 ? 1 : 0,
      }));
      await scheduleNativeIfRunning(nativeAlarms);
    };
    const iv = setInterval(tick, 15000);
    void tick();
    return () => clearInterval(iv);
  }, []);

  const snoozeRinging = () => {
    if (!ringing) return;
    try { localStorage.setItem(`reso-alarm-snooze:${ringing.alarmId}`, String(Date.now() + 5 * 60000)); } catch { /* noop */ }
    void nativeSnoozeAlarm(ringing.alarmId); // native re-rings in 5 min even if app is closed
    stopAlarm();
  };
  const stopRinging = () => {
    if (ringing) {
      try { localStorage.setItem(`reso-alarm-fired:${ringing.alarmId}`, todayStr()); } catch { /* noop */ }
    }
    stopAlarm();
  };

  const profile = useLiveQuery(() => db.profile.toArray(), []);
  const fsRow = useLiveQuery(() => db.finance_settings.toArray(), []);
  const fs = fsRow?.[0];

  const theme = profile?.[0]?.theme_preference ?? "system";

  useEffect(() => {
    (async () => {
      const done = await getMeta("topic_migration_v2");
      if (!done) {
        await migrateTopicStatuses();
        await setMeta("topic_migration_v2", "1");
      }
    })();
  }, []);

  // One-time cleanup: rows written by the old buggy build recorded impossible
  // values (bucket spans, not real usage). A day can't exceed 1440 minutes.
  // Runs once ever; nulls the bad numbers but keeps each row (journal text survives).
  useEffect(() => {
    (async () => {
      if (await getMeta("screentime_corrupt_cleanup")) return;
      const bad = await db.daily_logs.filter(
        (r) => typeof r.screen_time_minutes === "number" && (r.screen_time_minutes as number) > 1440
      ).toArray();
      for (const row of bad) {
        await db.daily_logs.update(row.id!, {
          screen_time_minutes: null,
          screen_time_top_app: null,
          screen_time_apps: null,
        });
      }
      await setMeta("screentime_corrupt_cleanup", "1");
    })();
  }, []);

  useEffect(() => { applyTheme(theme); }, [theme]);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const fn = () => applyTheme(theme);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, [theme]);

  // Midnight rollover so every screen knows what day it is.
  useEffect(() => {
    const check = () => {
      const t = todayStr();
      setToday((prev) => (prev !== t ? (setCarry({ items: [], resolved: false }), t) : prev));
    };
    const iv = setInterval(check, 30000);
    return () => clearInterval(iv);
  }, []);

  // Carryover check: once per new day, look for unchecked items from yesterday.
  useEffect(() => {
    if (carry.resolved) return;
    (async () => {
      const lastPrompt = await getMeta("carryover_prompt_date");
      const yesterday = yesterdayStr();
      if (lastPrompt === today) { setCarry({ items: [], resolved: true }); return; }
      const unchecked = await db.daily_plan_items.where("date").equals(yesterday).toArray();
      const leftovers = unchecked.filter((i) => !i.checked);
      if (leftovers.length) {
        setCarry({ items: leftovers, resolved: false });
        setPicked(new Set(leftovers.map((i) => i.id!)));
      } else {
        await setMeta("carryover_prompt_date", today);
        setCarry({ items: [], resolved: true });
      }
    })();
  }, [carry.resolved, today]);

  const confirmCarry = async () => {
    for (const id of Array.from(picked)) {
      const item = carry.items.find((i) => i.id === id);
      if (item) {
        await db.daily_plan_items.add({
          date: today, text: item.text, checked: 0, carried_from_date: item.date,
        });
      }
    }
    await setMeta("carryover_prompt_date", today);
    setCarry({ items: [], resolved: true });
  };

  // Allowance credit at 7am on collection day; then ask if the amount matched.
  useEffect(() => {
    if (!fs) return;
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      scheduleToday(notifiedRef.current);
    }
    (async () => {
      const now = new Date();
      const isCollectionDay = now.getDay() === fs.allowance_collection_day;
      const ws = weekStartOnOrBefore(today, fs.allowance_collection_day);
      const weeks = await db.finance_weeks.toArray();
      const existing = weeks.find((w) => w.week_start_date === ws);

      // The current allowance week must always exist so spending can be
      // logged on any day — not just collection day.
      if (!existing) {
        const last = weeks.filter((w) => w.week_start_date < ws).sort((a, b) => b.week_start_date.localeCompare(a.week_start_date))[0];
        const lastExp = last ? await db.expenses.where("finance_week_id").equals(last.id!).toArray() : [];
        const rollover = last ? Math.max(0, last.opening_balance - lastExp.reduce((a, e) => a + e.amount, 0)) : 0;
        // Allowance credit lands at 7am on collection day; before that (or on
        // any other day mid-cycle) the week opens with rollover only.
        const creditNow = isCollectionDay && now.getHours() >= 7;
        await db.finance_weeks.add({
          week_start_date: ws,
          allowance_collected: creditNow ? fs.current_allowance_amount : 0,
          rollover_from_previous: rollover,
          opening_balance: (creditNow ? fs.current_allowance_amount : 0) + rollover,
          closed: 0,
        });
        if (creditNow) await setMeta("allowance_credited_week", ws);
      }

      // At 7am on collection day, top up the week with the default allowance
      // (handles a week opened earlier the same morning, before the credit).
      if (isCollectionDay && now.getHours() >= 7) {
        const credited = await getMeta("allowance_credited_week");
        if (credited !== ws) {
          const current = (await db.finance_weeks.toArray()).find((w) => w.week_start_date === ws);
          if (current && current.allowance_collected < fs.current_allowance_amount) {
            const diff = fs.current_allowance_amount - current.allowance_collected;
            await db.finance_weeks.update(current.id!, {
              allowance_collected: fs.current_allowance_amount,
              opening_balance: current.opening_balance + diff,
            });
          }
          await setMeta("allowance_credited_week", ws);
        }
      }
    })();
  }, [fs, today]);

  // Daily email refresh on open.
  useEffect(() => {
    (async () => {
      const lastFetch = await getMeta("email_last_fetch_date");
      if (lastFetch === today) return;
      const accounts = await db.email_accounts.toArray();
      if (!accounts.length) return;
      await setMeta("email_last_fetch_date", today);
      for (const acc of accounts) {
        try {
          const { items, accessToken, expiresAt } = await fetchRankedEmails(acc);
          if (accessToken && expiresAt) await db.email_accounts.update(acc.id!, { access_token: accessToken, token_expires_at: expiresAt });
          if (items.length) {
            await db.email_items.bulkAdd(items.map((it) => ({
              email_account_id: acc.id!, subject: it.subject, sender: it.sender,
              snippet: it.snippet, summary: it.summary, rank: it.rank, fetched_date: today,
            })));
            await db.email_accounts.update(acc.id!, { last_fetched_at: Date.now() });
          }
        } catch { /* quiet — inbox shows the calm reconnect note */ }
      }
    })();
  }, [today]);

  // Screen time sync on app open — conditional on enabled state.
  useEffect(() => {
    (async () => {
      const enabled = await getScreenTimeEnabled();
      if (enabled !== 1) return;
      if (!screenTimeAvailable()) return;
      const perm = await screenTimePermission();
      if (perm !== "granted") return;
      await pullYesterdayScreenTime().catch(() => null);
    })();
  }, []);

  // Semester end: surface the recap once the semester has closed.
  const semesterOver = useMemo(() => {
    const p = profile?.[0];
    if (!p?.semester_end_date) return false;
    return daysBetween(p.semester_end_date, today) >= 0 && p.onboarding_complete === 1;
  }, [profile, today]);

  return (
    <TodayCtx.Provider value={today}>
      <div className="min-h-screen">
        {/* Alarm ringing — full-width banner with snooze/stop */}
        {ringing && (
          <div className="fixed top-0 inset-x-0 z-[60] px-3 pt-3 animate-fade-down">
            <div className="mx-auto max-w-5xl glass glass-strong rounded-3xl p-4 sm:p-5 flex items-center gap-4 shadow-2xl" role="alert">
              <span className="neo-sm w-12 h-12 rounded-2xl flex items-center justify-center animate-pulse-soft shrink-0" aria-hidden>
                <BellRing size={22} />
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-serif text-lg text-[var(--ink)] truncate">{ringing.label}</p>
                <p className="text-xs text-[var(--ink-faint)]">
                  {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} — your alarm is ringing
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <NeoButton onClick={snoozeRinging}>Snooze 5 min</NeoButton>
                <NeoButton variant="accent" className="font-semibold" onClick={stopRinging}>Stop</NeoButton>
              </div>
            </div>
          </div>
        )}
        <Nav />
        <main className="pt-6 pb-36"><div className="mx-auto w-full max-w-5xl px-4 sm:px-6">{children}</div></main>

        {semesterOver && (
          <button
            onClick={() => router.push("/digest?recap=1")}
            className="focus-ring fixed bottom-24 right-4 z-40 glass rounded-2xl px-5 py-3.5 text-sm font-medium text-[var(--ink)] hover:-translate-y-0.5 transition-transform animate-fade-up"
          >
            Your semester has ended — view your recap
          </button>
        )}

        {/* Carryover prompt — per-item choice */}
        <Modal open={carry.items.length > 0} title="You didn't finish these yesterday — carry them into today?" onClose={confirmCarry}>
          <p className="text-sm text-[var(--ink-soft)] mb-4">Pick the ones you want to bring along. The rest stay in yesterday.</p>
          <ul className="space-y-2.5 mb-5">
            {carry.items.map((item) => (
              <li key={item.id} className="flex items-center gap-3">
                <NeoCheck
                  checked={picked.has(item.id!)}
                  label={`Carry over ${item.text}`}
                  onToggle={() => setPicked((prev) => {
                    const next = new Set(prev);
                    if (next.has(item.id!)) next.delete(item.id!); else next.add(item.id!);
                    return next;
                  })}
                />
                <span className="text-[15px] text-[var(--ink)]">{item.text}</span>
              </li>
            ))}
          </ul>
          <div className="flex justify-end gap-2">
            <NeoButton onClick={confirmCarry}>Leave them in yesterday</NeoButton>
            <NeoButton variant="accent" onClick={confirmCarry} className="font-semibold">
              Carry {picked.size > 0 ? picked.size : ""} into today
            </NeoButton>
          </div>
        </Modal>

</div>
    </TodayCtx.Provider>
  );
}
