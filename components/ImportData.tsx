"use client";
import { useRef, useState } from "react";
import { db } from "@/lib/db";
import { NeoButton } from "./ui";

const TABLES = [
  "profile", "courses", "course_ca_components", "course_scores",
  "course_topics", "timetable_slots", "exams", "personal_study_slots",
  "finance_settings", "finance_weeks", "expenses", "finance_income", "routines",
  "routine_logs", "daily_plan_items", "daily_logs", "chat_messages",
  "discipline_scores", "weekly_digests", "email_accounts", "email_items",
  "archived_semesters", "screentime_tracking", "reminder_prefs",
  "custom_reminders", "alarms", "course_chats", "meta",
];

/** Restores a Reso export file. REPLACES all current data — confirms first. */
export default function ImportData({ onDone }: { onDone?: (msg: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const doImport = async (file: File) => {
    if (!confirm("Importing replaces ALL current data with the file's contents. Continue?")) return;
    setBusy(true);
    try {
      const parsed = JSON.parse(await file.text());
      if (parsed?.app !== "reso" || typeof parsed.data !== "object") {
        throw new Error("That doesn't look like a Reso export file.");
      }
      const data = parsed.data as Record<string, unknown[]>;
      await db.transaction("rw", db.tables, async () => {
        for (const t of TABLES) {
          const rows = data[t];
          if (!Array.isArray(rows)) continue;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const table = (db as unknown as Record<string, any>)[t];
          await table.clear();
          if (rows.length) await table.bulkPut(rows);
        }
      });
      onDone?.("Import complete — everything restored.");
    } catch (e) {
      onDone?.(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void doImport(f);
          e.target.value = "";
        }}
      />
      <NeoButton onClick={() => fileRef.current?.click()} disabled={busy}>
        {busy ? "Importing…" : "Import"}
      </NeoButton>
    </>
  );
}
