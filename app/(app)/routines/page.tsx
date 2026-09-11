"use client";
import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Repeat2, Plus, Flame, Check, X, Pencil } from "lucide-react";
import { db } from "@/lib/db";
import type { Routine } from "@/lib/db";
import { GlassCard, SectionHeader, Field, NeoButton, Tag, EmptyState, Modal } from "@/components/ui";
import { useToday } from "@/components/AppShell";
import { routineStreak } from "@/lib/calc";
import { DAY_SHORT } from "@/lib/dates";

export default function RoutinesPage() {
  const today = useToday();
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Routine | null>(null);

  const routines = useLiveQuery(() => db.routines.toArray(), []);
  const logs = useLiveQuery(() => db.routine_logs.toArray(), []);

  const dow = new Date(today + "T00:00:00").getDay();

  const todayLog = (id: number) => logs?.find((l) => l.routine_id === id && l.date === today);

  const setLog = async (routineId: number, status: "done" | "skipped") => {
    const existing = todayLog(routineId);
    if (existing) {
      if (existing.status === status) await db.routine_logs.delete(existing.id!);
      else await db.routine_logs.update(existing.id!, { status });
    } else {
      await db.routine_logs.add({ routine_id: routineId, date: today, status });
    }
  };

  const scheduled = (routines ?? []).filter((r) => r.schedule_days.includes(dow));
  const doneCount = scheduled.filter((r) => todayLog(r.id!)?.status === "done").length;

  return (
    <div className="space-y-6 pb-8 max-w-3xl mx-auto">
      <div className="flex items-end justify-between animate-fade-up">
        <div>
          <h1 className="font-serif text-3xl sm:text-4xl tracking-tight text-[var(--ink)]">Routines</h1>
          <p className="text-sm text-[var(--ink-soft)] mt-1">
            {scheduled.length ? `${doneCount} of ${scheduled.length} done today` : "Nothing scheduled today."}
          </p>
        </div>
        <NeoButton variant="accent" onClick={() => setShowAdd(true)} className="font-semibold">
          <span className="inline-flex items-center gap-2"><Plus size={16} aria-hidden /> New routine</span>
        </NeoButton>
      </div>

      {(routines ?? []).length === 0 && (
        <GlassCard>
          <EmptyState
            icon={<Repeat2 size={26} aria-hidden />}
            title="No routines yet"
          />
        </GlassCard>
      )}

      <div className="ledger rounded-3xl neo-card p-4 sm:p-6 space-y-3">
        {(routines ?? []).map((r) => {
          const log = todayLog(r.id!);
          const streak = routineStreak(r, logs ?? []);
          const isToday = r.schedule_days.includes(dow);
          return (
            <GlassCard key={r.id} className={`p-4 sm:p-5 animate-fade-up ${log?.status === "skipped" ? "opacity-70" : ""}`} >
              <div className="flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`font-medium text-[16px] ${log?.status === "skipped" ? "line-through text-[var(--ink-faint)]" : "text-[var(--ink)]"}`}>{r.name}</span>
                    {streak >= 2 && <Tag tone="warn"><Flame size={11} aria-hidden /> {streak}-day streak</Tag>}
                    {!isToday && <Tag>rest day</Tag>}
                  </div>
                  <p className="text-xs text-[var(--ink-faint)] mt-1">
                    {r.schedule_days.length === 7 ? "every day" : r.schedule_days.map((d) => DAY_SHORT[d]).join(" ")}
                    {r.reminder_time ? ` — remind ${r.reminder_time}` : ""}
                  </p>
                </div>
                <button
                    onClick={() => setEditing(r)}
                    aria-label={`Edit ${r.name}`}
                    className="focus-ring neo-sm w-11 h-11 rounded-xl flex items-center justify-center text-[var(--ink-faint)] hover:text-[var(--ink)] shrink-0"
                  >
                    <Pencil size={16} aria-hidden />
                  </button>
                <div className="flex gap-2">
                  <button
                    onClick={() => setLog(r.id!, "done")}
                    aria-label={`Mark ${r.name} done`}
                    aria-pressed={log?.status === "done"}
                    className={`focus-ring w-[52px] h-[52px] rounded-xl flex items-center justify-center transition-all ${log?.status === "done" ? "neo-pressed text-[var(--accent)]" : "neo text-[var(--ink-faint)] hover:text-[var(--accent)]"}`}
                  >
                    <Check size={20} strokeWidth={2.5} aria-hidden />
                  </button>
                  <button
                    onClick={() => setLog(r.id!, "skipped")}
                    aria-label={`Mark ${r.name} skipped`}
                    aria-pressed={log?.status === "skipped"}
                    className={`focus-ring w-[52px] h-[52px] rounded-xl flex items-center justify-center transition-all ${log?.status === "skipped" ? "neo-pressed text-rose-500" : "neo text-[var(--ink-faint)] hover:text-rose-400"}`}
                  >
                    <X size={20} strokeWidth={2.5} aria-hidden />
                  </button>
                </div>
              </div>
            </GlassCard>
          );
        })}
      </div>

      <AddRoutineModal open={showAdd} onClose={() => setShowAdd(false)} />
      <EditRoutineModal routine={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function AddRoutineModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [time, setTime] = useState("06:30");
  return (
    <Modal open={open} onClose={onClose} title="New routine">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          await db.routines.add({
            name: name.trim(),
            schedule_type: days.length === 7 ? "daily" : "specific_days",
            schedule_days: days.length ? days : [1, 2, 3, 4, 5],
            reminder_time: time,
          });
          setName(""); onClose();
        }}
        className="space-y-4"
      >
        <Field label="Name" value={name} onChange={setName} placeholder="Gym, Bible reading, 20 pages…" />
        <div>
          <div className="flex flex-wrap gap-2 mb-2.5">
            <button type="button" onClick={() => setDays([0, 1, 2, 3, 4, 5, 6])}
              aria-pressed={days.length === 7}
              className={`focus-ring rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${days.length === 7 ? "neo-pressed text-[var(--ink)]" : "neo text-[var(--ink-faint)]"}`}>
              Every day
            </button>
            <button type="button" onClick={() => setDays([1, 2, 3, 4, 5])}
              aria-pressed={days.length === 5 && !days.includes(0) && !days.includes(6)}
              className={`focus-ring rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${days.length === 5 && !days.includes(0) && !days.includes(6) ? "neo-pressed text-[var(--ink)]" : "neo text-[var(--ink-faint)]"}`}>
              Weekdays
            </button>
            <button type="button" onClick={() => setDays([])}
              className="focus-ring rounded-lg px-3 py-1.5 text-xs font-semibold neo text-[var(--ink-faint)]">
              Clear
            </button>
          </div>
          <p className="text-xs font-medium text-[var(--ink-faint)] mb-2 uppercase tracking-wide">Days</p>
          <div className="flex flex-wrap gap-2">
            {DAY_SHORT.map((d, i) => (
              <button
                key={d}
                type="button"
                aria-pressed={days.includes(i)}
                aria-label={d}
                onClick={() => setDays((ds) => (ds.includes(i) ? ds.filter((x) => x !== i) : [...ds, i]))}
                className={`focus-ring w-11 h-11 rounded-xl text-xs font-semibold transition-all ${days.includes(i) ? "neo-pressed text-[var(--accent)]" : "neo text-[var(--ink-faint)]"}`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
        <Field label="Reminder time" value={time} onChange={setTime} type="time" />
        <div className="flex justify-end gap-2">
          <NeoButton onClick={onClose}>Cancel</NeoButton>
          <NeoButton type="submit" variant="accent" className="font-semibold">Add routine</NeoButton>
        </div>
      </form>
    </Modal>
  );
}

function EditRoutineModal({ routine, onClose }: { routine: Routine | null; onClose: () => void }) {
  const [days, setDays] = useState<number[]>(routine?.schedule_days ?? []);
  const [time, setTime] = useState(routine?.reminder_time ?? "06:30");
  const [name, setName] = useState(routine?.name ?? "");
  const [confirmRemove, setConfirmRemove] = useState(false);

  const [forId, setForId] = useState<number | null>(routine?.id ?? null);
  if (routine && routine.id !== forId) {
    setForId(routine.id ?? null);
    setDays(routine.schedule_days);
    setTime(routine.reminder_time);
    setName(routine.name);
    setConfirmRemove(false);
  }

  return (
    <Modal open={!!routine} onClose={onClose} title="Edit routine">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!routine?.id || !name.trim()) return;
          await db.routines.update(routine.id, {
            name: name.trim(),
            schedule_type: days.length === 7 ? "daily" : "specific_days",
            schedule_days: days.length ? days : [1, 2, 3, 4, 5],
            reminder_time: time,
          });
          onClose();
        }}
        className="space-y-4"
      >
        <Field label="Name" value={name} onChange={setName} />
        <div>
          <div className="flex flex-wrap gap-2 mb-2.5">
            <button type="button" onClick={() => setDays([0, 1, 2, 3, 4, 5, 6])}
              aria-pressed={days.length === 7}
              className={`focus-ring rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${days.length === 7 ? "neo-pressed text-[var(--ink)]" : "neo text-[var(--ink-faint)]"}`}>
              Every day
            </button>
            <button type="button" onClick={() => setDays([1, 2, 3, 4, 5])}
              aria-pressed={days.length === 5 && !days.includes(0) && !days.includes(6)}
              className={`focus-ring rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${days.length === 5 && !days.includes(0) && !days.includes(6) ? "neo-pressed text-[var(--ink)]" : "neo text-[var(--ink-faint)]"}`}>
              Weekdays
            </button>
            <button type="button" onClick={() => setDays([])}
              className="focus-ring rounded-lg px-3 py-1.5 text-xs font-semibold neo text-[var(--ink-faint)]">
              Clear
            </button>
          </div>
          <p className="text-xs font-medium text-[var(--ink-faint)] mb-2 uppercase tracking-wide">Days</p>
          <div className="flex flex-wrap gap-2">
            {DAY_SHORT.map((d, i) => (
              <button
                key={d}
                type="button"
                aria-pressed={days.includes(i)}
                aria-label={d}
                onClick={() => setDays((ds) => (ds.includes(i) ? ds.filter((x) => x !== i) : [...ds, i]))}
                className={`focus-ring w-11 h-11 rounded-xl text-xs font-semibold transition-all ${days.includes(i) ? "neo-pressed text-[var(--ink)] font-bold" : "neo text-[var(--ink-faint)]"}`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
        <Field label="Reminder time" value={time} onChange={setTime} type="time" />
        <div className="flex items-center justify-between pt-1">
          {confirmRemove ? (
            <button
              type="button"
              onClick={async () => {
                if (routine?.id) {
                  await db.routines.delete(routine.id);
                  await db.routine_logs.where("routine_id").equals(routine.id).delete();
                }
                onClose();
              }}
              className="focus-ring text-sm font-medium text-rose-500"
            >
              Tap again to remove
            </button>
          ) : (
            <button type="button" onClick={() => setConfirmRemove(true)} className="focus-ring text-sm text-[var(--ink-faint)] hover:text-rose-500">
              Remove routine
            </button>
          )}
          <div className="flex gap-2">
            <NeoButton onClick={onClose}>Cancel</NeoButton>
            <NeoButton type="submit" variant="accent" className="font-semibold">Save</NeoButton>
          </div>
        </div>
      </form>
    </Modal>
  );
}
