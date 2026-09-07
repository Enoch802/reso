"use client";
import { useState } from "react";
import { Plus, CornerDownRight, X } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { NeoCheck, NeoButton, EmptyState, GlassCard } from "./ui";
import { useToday } from "./AppShell";

/** Today's Plan as a simple checklist. Fresh per date; carryover is handled by AppShell's prompt. */
export default function Checklist({ compact = false }: { compact?: boolean }) {
  const today = useToday();
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);

  const items = useLiveQuery(
    () => db.daily_plan_items.where("date").equals(today).toArray(),
    [today]
  );

  const add = async () => {
    const text = draft.trim();
    if (!text) return;
    await db.daily_plan_items.add({ date: today, text, checked: 0, carried_from_date: null });
    setDraft("");
  };

  const toggle = async (id: number, checked: 0 | 1) => {
    await db.daily_plan_items.update(id, { checked: checked ? 0 : 1 });
  };

  const remove = async (id: number) => {
    await db.daily_plan_items.delete(id);
  };

  const shown = compact ? items?.slice(0, 4) : items;
  const remaining = (items?.length ?? 0) - (shown?.length ?? 0);

  return (
    <div>
      {/* Add-an-item bar */}
      <form
        onSubmit={(e) => { e.preventDefault(); add(); }}
        className="flex gap-2 items-center"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={compact ? "Add a plan item…" : "e.g. CSC141 — 2hrs"}
          aria-label="New plan item"
          className={`focus-ring flex-1 rounded-xl px-4 py-3 text-[15px] bg-[var(--neo-base)] text-[var(--ink)] transition-shadow
            ${focused ? "shadow-[inset_4px_4px_9px_rgba(58,56,82,0.14),inset_-4px_-4px_9px_rgba(255,255,255,0.85)]" : "shadow-[3px_3px_8px_rgba(58,56,82,0.13),-3px_-3px_7px_rgba(255,255,255,0.9)]"}
            dark:shadow-[inset_4px_4px_10px_rgba(0,0,0,0.55),inset_-4px_-4px_9px_rgba(255,255,255,0.05)]
            border border-white/30 dark:border-white/5`}
        />
        <NeoButton type="submit" ariaLabel="Add plan item" variant="accent" className="!px-3.5">
          <Plus size={18} aria-hidden />
        </NeoButton>
      </form>

      <ul className="mt-4 space-y-2.5" aria-label="Today's Plan">
        {shown?.map((item, i) => (
          <li
            key={item.id}
            className="group flex items-center gap-3 neo rounded-2xl px-3.5 py-2.5 animate-fade-up min-h-[56px]"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <NeoCheck
              checked={item.checked === 1}
              label={`Mark ${item.text} ${item.checked ? "undone" : "done"}`}
              onToggle={() => toggle(item.id!, item.checked)}
            />
            <div className="flex-1 min-w-0">
              <span className={`block text-[15px] truncate transition-all ${item.checked ? "line-through text-[var(--ink-faint)]" : "text-[var(--ink)]"}`}>
                {item.text}
              </span>
              {item.carried_from_date && !item.checked && (
                <span className="inline-flex items-center gap-1 text-[11px] text-[var(--ink-faint)] mt-0.5">
                  <CornerDownRight size={11} aria-hidden /> carried from yesterday
                </span>
              )}
            </div>
            <button
              onClick={() => remove(item.id!)}
              aria-label={`Remove ${item.text}`}
              className="focus-ring opacity-0 group-hover:opacity-100 focus:opacity-100 text-[var(--ink-faint)] hover:text-rose-500 transition-all p-1.5"
            >
              <X size={15} aria-hidden />
            </button>
          </li>
        ))}
      </ul>

      {compact && remaining > 0 && (
        <p className="text-sm text-[var(--ink-faint)] mt-3 pl-1">+ {remaining} more planned</p>
      )}

      {items && items.length === 0 && (
        <EmptyState
          icon={<Plus size={26} aria-hidden />}
          title={compact ? "Nothing planned yet" : "What's the plan for today?"}
          sub={compact ? "Add your first item above — small and concrete works best." : "Add a couple of checkable items — 'CSC141 — 2hrs', 'Gym'. Each one you tick feeds your discipline score honestly."}
        />
      )}
    </div>
  );
}
